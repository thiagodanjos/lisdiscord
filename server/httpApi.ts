// API HTTP mínima do bot autónomo — existe só para a app desktop poder gerir configurações (por
// agora, as Justificativas) sem precisar de manter a sua própria ligação à Discord em paralelo.
// Ter duas ligações vivas ao mesmo token (a app + este bot) faz cada uma escrever na sua própria
// cópia local dos dados, e cai numa "corrida" imprevisível por quem responde a cada interação — esta
// API existe para a app poder falar diretamente com O bot que está mesmo a atender o servidor,
// em vez de duplicar a ligação.
//
// Só arranca se LISDISCORD_API_KEY estiver definida (fica desligada por omissão). Autenticação por
// simples bearer token — não há HTTPS embutido, por isso o mais seguro é restringir a porta na
// firewall da máquina a apenas os IPs de confiança, além de guardar bem a chave.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import type { Guild } from 'discord.js'
import type { ChannelPickerEntry, EmbedDraft, EmbedTemplateKind, JustificationChannelKind, MovPointsEntry } from '../shared/types'
import { discordManager } from '../electron/discord/client'
import { addBotEmoji, deleteBotEmoji, listBotEmojis } from '../electron/discord/botEmojis'
import { applyJustificationChannel, postJustificationMessage } from '../electron/discord/justifications'
import { sendEmbedMessage } from '../electron/discord/messaging'
import { getMemberProfile, listGuildRoles } from '../electron/discord/memberProfile'
import { buildFullLeaderboard } from '../electron/discord/leaderboard'
import { refreshBoard } from '../electron/discord/movcall'
import * as moderation from '../electron/discord/moderation'
import * as justificationSettingsStore from '../electron/store/justificationSettings'
import * as movPointsStore from '../electron/store/movPoints'
import * as movPointsLogStore from '../electron/store/movPointsLog'
import * as excludedMembersStore from '../electron/store/excludedMembers'
import * as roleGoalsStore from '../electron/store/roleGoals'
import * as embedTemplatesStore from '../electron/store/embedTemplates'

const EMBED_TEMPLATE_KINDS: EmbedTemplateKind[] = ['pontosBoard', 'inativos', 'justificationFixed', 'justificationDaily']

/** Mesma lógica que o IPC da app usa — atualiza logo a mensagem já publicada quando o template muda. */
async function refreshEmbedTemplateTarget(guild: Guild, kind: EmbedTemplateKind): Promise<void> {
  if (kind === 'pontosBoard') {
    await refreshBoard(guild).catch(() => undefined)
    return
  }
  if (kind === 'justificationFixed' || kind === 'justificationDaily') {
    const type = kind === 'justificationFixed' ? 'fixed' : 'daily'
    const settings = justificationSettingsStore.getSettings(guild.id)
    const channelId = type === 'fixed' ? settings.fixedPostChannelId : settings.dailyPostChannelId
    if (!channelId) return
    const existingMessageId = justificationSettingsStore.getPostMessageId(guild.id, type)
    const messageId = await postJustificationMessage(guild, type, channelId, existingMessageId).catch(() => null)
    if (messageId) justificationSettingsStore.setPostMessageId(guild.id, type, messageId)
  }
}

/** Identifica no log de pontos ações feitas pelo bot remoto (partilhado com a app desktop). */
const REMOTE_API_ACTOR = 'Aplicação desktop (via bot remoto)'

async function fullLeaderboard(guildId: string): Promise<MovPointsEntry[]> {
  if (!discordManager.isConnected()) return movPointsStore.getLeaderboard(guildId)
  const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
  if (!guild) return movPointsStore.getLeaderboard(guildId)
  return buildFullLeaderboard(guild).catch(() => movPointsStore.getLeaderboard(guildId))
}

const CHANNEL_KIND_MAP: Record<number, ChannelPickerEntry['kind']> = {
  0: 'text',
  2: 'voice',
  4: 'category',
  5: 'announcement',
  13: 'stage',
  15: 'forum',
}

const JUSTIFICATION_KINDS: JustificationChannelKind[] = ['fixedPost', 'dailyPost', 'fixedLog', 'dailyLog']

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.trim() === '') return {}
  return JSON.parse(raw)
}

/** Arranca a API HTTP, se `LISDISCORD_API_KEY` estiver definida no ambiente. Devolve `null` se ficou desligada. */
export function startHttpApi(): ReturnType<typeof createServer> | null {
  const apiKey = process.env.LISDISCORD_API_KEY
  if (!apiKey) {
    console.log('ℹ️  LISDISCORD_API_KEY não definida — a API remota para a app desktop fica desligada.')
    return null
  }

  const port = Number(process.env.LISDISCORD_API_PORT ?? '8787')

  const server = createServer((req, res) => {
    handleRequest(req, res, apiKey).catch((err) => {
      console.error('[api] Erro não tratado a processar pedido:', err)
      if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno.' })
    })
  })

  server.listen(port, () => {
    console.log(`🌐 API remota a ouvir na porta ${port} — usa-a na app desktop em Justificativas → Bot remoto.`)
  })

  return server
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, apiKey: string): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const parts = url.pathname.split('/').filter(Boolean)

  if (req.method === 'GET' && parts.length === 1 && parts[0] === 'health') {
    sendJson(res, 200, { ok: true, connected: discordManager.isConnected() })
    return
  }

  const auth = req.headers.authorization ?? ''
  const providedKey = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : ''
  if (!providedKey || !safeEqual(providedKey, apiKey)) {
    sendJson(res, 401, { error: 'Chave de API em falta ou inválida.' })
    return
  }

  // Rotas debaixo de /api/guilds/:guildId/... têm sempre este prefixo — computa-se uma vez para
  // nunca haver o risco de um caminho não relacionado (ex.: /outracoisa/x/y/roles) apanhar por
  // engano uma condição que só olha para as partes finais do caminho.
  const isGuildRoute = parts[0] === 'api' && parts[1] === 'guilds' && parts.length >= 3
  const isEmojiRoute = parts[0] === 'api' && parts[1] === 'emojis'

  // GET /api/guilds/:guildId/justifications não precisa de ligação à Discord — só lê um ficheiro
  // local — por isso a verificação de "bot ligado" fica dentro de cada rota que precisa mesmo dela,
  // em vez de bloquear tudo (incluindo rotas desconhecidas, que devem dar sempre 404).
  const needsConnection =
    (req.method === 'GET' && parts.length === 2 && isGuildRoute) ||
    (req.method === 'GET' && parts.length === 4 && isGuildRoute && parts[3] === 'channels') ||
    (req.method === 'POST' && parts.length === 5 && isGuildRoute && parts[3] === 'justifications') ||
    isEmojiRoute ||
    (req.method === 'POST' && parts.length === 6 && isGuildRoute && parts[3] === 'movpoints' && ['add', 'remove', 'hours'].includes(parts[5])) ||
    (req.method === 'POST' && parts.length === 5 && isGuildRoute && parts[3] === 'movpoints' && parts[4] === 'board') ||
    (req.method === 'GET' && parts.length === 5 && isGuildRoute && parts[3] === 'members' && parts[4] === 'search') ||
    (req.method === 'GET' && parts.length === 4 && isGuildRoute && parts[3] === 'roles') ||
    (req.method === 'GET' && parts.length === 6 && isGuildRoute && parts[3] === 'members' && parts[5] === 'profile') ||
    (req.method === 'POST' && parts.length === 4 && isGuildRoute && parts[3] === 'messages')

  if (needsConnection && !discordManager.isConnected()) {
    sendJson(res, 503, { error: 'O bot não está ligado à Discord neste momento.' })
    return
  }

  try {
    // GET /api/guilds
    if (req.method === 'GET' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'guilds') {
      sendJson(res, 200, await discordManager.listGuilds())
      return
    }

    // GET /api/guilds/:guildId/channels
    if (req.method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'guilds' && parts[3] === 'channels') {
      const guildId = parts[2]
      const guild = await discordManager.getClient().guilds.fetch(guildId)
      await guild.channels.fetch()
      const channels: ChannelPickerEntry[] = [...guild.channels.cache.values()]
        .filter((c) => c.isTextBased() && !c.isThread())
        .map((c) => ({ id: c.id, name: c.name, kind: CHANNEL_KIND_MAP[c.type] ?? 'text' }))
      sendJson(res, 200, channels)
      return
    }

    // GET /api/guilds/:guildId/justifications
    if (req.method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'guilds' && parts[3] === 'justifications') {
      sendJson(res, 200, justificationSettingsStore.getSettings(parts[2]))
      return
    }

    // POST /api/guilds/:guildId/justifications/:kind  { channelId: string | null }
    if (
      req.method === 'POST' &&
      parts.length === 5 &&
      parts[0] === 'api' &&
      parts[1] === 'guilds' &&
      parts[3] === 'justifications'
    ) {
      const guildId = parts[2]
      const kind = parts[4]
      if (!JUSTIFICATION_KINDS.includes(kind as JustificationChannelKind)) {
        sendJson(res, 400, { error: `Tipo de canal inválido: ${kind}` })
        return
      }
      const body = (await readJsonBody(req)) as { channelId?: string | null }
      const channelId = typeof body.channelId === 'string' ? body.channelId : null

      const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
      const updated = await applyJustificationChannel(guild, guildId, kind as JustificationChannelKind, channelId)
      sendJson(res, 200, updated)
      return
    }

    // GET /api/guilds/:guildId/movpoints
    if (req.method === 'GET' && parts.length === 4 && isGuildRoute && parts[3] === 'movpoints') {
      sendJson(res, 200, await fullLeaderboard(parts[2]))
      return
    }

    // POST /api/guilds/:guildId/movpoints/board  { channelId: string | null }
    if (req.method === 'POST' && parts.length === 5 && isGuildRoute && parts[3] === 'movpoints' && parts[4] === 'board') {
      const guildId = parts[2]
      const body = (await readJsonBody(req)) as { channelId?: string | null }
      const channelId = typeof body.channelId === 'string' ? body.channelId : null
      if (!channelId) {
        sendJson(res, 200, movPointsStore.setBoardChannel(guildId, null, null))
        return
      }
      const guild = await discordManager.getClient().guilds.fetch(guildId)
      const channel = await guild.channels.fetch(channelId)
      const config = movPointsStore.setBoardChannel(guildId, channelId, channel?.name ?? channelId)
      await refreshBoard(guild).catch(() => undefined)
      sendJson(res, 200, config)
      return
    }

    // GET /api/guilds/:guildId/movpoints/board
    if (req.method === 'GET' && parts.length === 5 && isGuildRoute && parts[3] === 'movpoints' && parts[4] === 'board') {
      sendJson(res, 200, movPointsStore.getBoardConfig(parts[2]))
      return
    }

    // GET /api/guilds/:guildId/movpoints/log
    if (req.method === 'GET' && parts.length === 5 && isGuildRoute && parts[3] === 'movpoints' && parts[4] === 'log') {
      sendJson(res, 200, movPointsLogStore.listMovPointsLog(parts[2]))
      return
    }

    // POST /api/guilds/:guildId/movpoints/reset
    if (req.method === 'POST' && parts.length === 5 && isGuildRoute && parts[3] === 'movpoints' && parts[4] === 'reset') {
      const guildId = parts[2]
      movPointsStore.resetGuild(guildId, REMOTE_API_ACTOR)
      if (discordManager.isConnected()) {
        const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
        if (guild) await refreshBoard(guild).catch(() => undefined)
      }
      sendJson(res, 200, await fullLeaderboard(guildId))
      return
    }

    // GET /api/guilds/:guildId/movpoints/excluded
    if (req.method === 'GET' && parts.length === 5 && isGuildRoute && parts[3] === 'movpoints' && parts[4] === 'excluded') {
      sendJson(res, 200, excludedMembersStore.listExcluded(parts[2]))
      return
    }

    // POST /api/guilds/:guildId/movpoints/excluded/:userId  { tag: string, excluded: boolean }
    if (req.method === 'POST' && parts.length === 6 && isGuildRoute && parts[3] === 'movpoints' && parts[4] === 'excluded') {
      const guildId = parts[2]
      const userId = parts[5]
      const body = (await readJsonBody(req)) as { tag?: string; excluded?: boolean }
      const updated = excludedMembersStore.setExcluded(guildId, userId, body.tag ?? userId, Boolean(body.excluded))
      if (discordManager.isConnected()) {
        const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
        if (guild) await refreshBoard(guild).catch(() => undefined)
      }
      sendJson(res, 200, updated)
      return
    }

    // POST /api/guilds/:guildId/movpoints/:userId/add|remove|hours  { amount } | { seconds }
    if (req.method === 'POST' && parts.length === 6 && isGuildRoute && parts[3] === 'movpoints' && ['add', 'remove', 'hours'].includes(parts[5])) {
      const guildId = parts[2]
      const userId = parts[4]
      const action = parts[5]
      const guild = await discordManager.getClient().guilds.fetch(guildId)
      const member = await guild.members.fetch(userId)
      const body = (await readJsonBody(req)) as { amount?: number; seconds?: number }
      if (action === 'add') movPointsStore.addPoints(guildId, userId, member.user.tag, Number(body.amount) || 0, REMOTE_API_ACTOR)
      else if (action === 'remove') movPointsStore.removePoints(guildId, userId, member.user.tag, Number(body.amount) || 0, REMOTE_API_ACTOR)
      else movPointsStore.addHours(guildId, userId, member.user.tag, Number(body.seconds) || 0, REMOTE_API_ACTOR)
      await refreshBoard(guild).catch(() => undefined)
      sendJson(res, 200, await fullLeaderboard(guildId))
      return
    }

    // GET /api/guilds/:guildId/members/search?q=...
    if (req.method === 'GET' && parts.length === 5 && isGuildRoute && parts[3] === 'members' && parts[4] === 'search') {
      const guild = await discordManager.getClient().guilds.fetch(parts[2])
      sendJson(res, 200, await moderation.searchMembers(guild, url.searchParams.get('q') ?? ''))
      return
    }

    // GET /api/guilds/:guildId/members/:userId/profile
    if (req.method === 'GET' && parts.length === 6 && isGuildRoute && parts[3] === 'members' && parts[5] === 'profile') {
      const guild = await discordManager.getClient().guilds.fetch(parts[2])
      sendJson(res, 200, await getMemberProfile(guild, parts[4]))
      return
    }

    // GET /api/guilds/:guildId/roles
    if (req.method === 'GET' && parts.length === 4 && isGuildRoute && parts[3] === 'roles') {
      const guild = await discordManager.getClient().guilds.fetch(parts[2])
      sendJson(res, 200, await listGuildRoles(guild))
      return
    }

    // GET /api/guilds/:guildId/goals
    if (req.method === 'GET' && parts.length === 4 && isGuildRoute && parts[3] === 'goals') {
      sendJson(res, 200, roleGoalsStore.listGoals(parts[2]))
      return
    }

    // POST /api/guilds/:guildId/goals/:roleId  { roleName, pointsGoal, hoursGoal }
    if (req.method === 'POST' && parts.length === 5 && isGuildRoute && parts[3] === 'goals') {
      const body = (await readJsonBody(req)) as { roleName?: string; pointsGoal?: number; hoursGoal?: number }
      sendJson(res, 200, roleGoalsStore.setGoal(parts[2], parts[4], body.roleName ?? parts[4], Number(body.pointsGoal) || 0, Number(body.hoursGoal) || 0))
      return
    }

    // DELETE /api/guilds/:guildId/goals/:roleId
    if (req.method === 'DELETE' && parts.length === 5 && isGuildRoute && parts[3] === 'goals') {
      sendJson(res, 200, roleGoalsStore.removeGoal(parts[2], parts[4]))
      return
    }

    // POST /api/guilds/:guildId/messages  { channelId: string, draft: EmbedDraft }
    if (req.method === 'POST' && parts.length === 4 && isGuildRoute && parts[3] === 'messages') {
      const guildId = parts[2]
      const body = (await readJsonBody(req)) as { channelId?: string; draft?: EmbedDraft }
      if (!body.channelId || !body.draft) {
        sendJson(res, 400, { error: 'Faltam os campos "channelId" e "draft".' })
        return
      }
      const guild = await discordManager.getClient().guilds.fetch(guildId)
      await sendEmbedMessage(guild, body.channelId, body.draft)
      sendJson(res, 200, { ok: true })
      return
    }

    // GET /api/guilds/:guildId/embed-templates/:kind
    if (req.method === 'GET' && parts.length === 5 && isGuildRoute && parts[3] === 'embed-templates') {
      const kind = parts[4]
      if (!EMBED_TEMPLATE_KINDS.includes(kind as EmbedTemplateKind)) {
        sendJson(res, 400, { error: `Tipo de template inválido: ${kind}` })
        return
      }
      const guildId = parts[2]
      sendJson(res, 200, {
        draft: embedTemplatesStore.getTemplate(guildId, kind as EmbedTemplateKind),
        customized: embedTemplatesStore.isCustomized(guildId, kind as EmbedTemplateKind),
      })
      return
    }

    // POST /api/guilds/:guildId/embed-templates/:kind  { draft: EmbedDraft }
    if (req.method === 'POST' && parts.length === 5 && isGuildRoute && parts[3] === 'embed-templates') {
      const kind = parts[4]
      if (!EMBED_TEMPLATE_KINDS.includes(kind as EmbedTemplateKind)) {
        sendJson(res, 400, { error: `Tipo de template inválido: ${kind}` })
        return
      }
      const guildId = parts[2]
      const body = (await readJsonBody(req)) as { draft?: EmbedDraft }
      if (!body.draft) {
        sendJson(res, 400, { error: 'Falta o campo "draft".' })
        return
      }
      embedTemplatesStore.setTemplate(guildId, kind as EmbedTemplateKind, body.draft)
      if (discordManager.isConnected()) {
        const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
        if (guild) await refreshEmbedTemplateTarget(guild, kind as EmbedTemplateKind)
      }
      sendJson(res, 200, { draft: body.draft, customized: true })
      return
    }

    // DELETE /api/guilds/:guildId/embed-templates/:kind
    if (req.method === 'DELETE' && parts.length === 5 && isGuildRoute && parts[3] === 'embed-templates') {
      const kind = parts[4]
      if (!EMBED_TEMPLATE_KINDS.includes(kind as EmbedTemplateKind)) {
        sendJson(res, 400, { error: `Tipo de template inválido: ${kind}` })
        return
      }
      const guildId = parts[2]
      const draft = embedTemplatesStore.resetTemplate(guildId, kind as EmbedTemplateKind)
      if (discordManager.isConnected()) {
        const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
        if (guild) await refreshEmbedTemplateTarget(guild, kind as EmbedTemplateKind)
      }
      sendJson(res, 200, { draft, customized: false })
      return
    }

    // GET /api/emojis
    if (req.method === 'GET' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'emojis') {
      sendJson(res, 200, await listBotEmojis(discordManager.getClient()))
      return
    }

    // POST /api/emojis  { name: string, imageDataUrl: string }
    if (req.method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'emojis') {
      const body = (await readJsonBody(req)) as { name?: string; imageDataUrl?: string }
      if (typeof body.name !== 'string' || typeof body.imageDataUrl !== 'string') {
        sendJson(res, 400, { error: 'Faltam os campos "name" e "imageDataUrl".' })
        return
      }
      const emoji = await addBotEmoji(discordManager.getClient(), body.name, body.imageDataUrl)
      sendJson(res, 200, emoji)
      return
    }

    // DELETE /api/emojis/:id
    if (req.method === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'emojis') {
      await deleteBotEmoji(discordManager.getClient(), parts[2])
      sendJson(res, 200, { ok: true })
      return
    }

    sendJson(res, 404, { error: 'Rota não encontrada.' })
  } catch (err) {
    console.error('[api] Erro a processar pedido:', err)
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Erro desconhecido.' })
  }
}
