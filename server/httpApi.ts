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
import type { ChannelPickerEntry, JustificationChannelKind } from '../shared/types'
import { discordManager } from '../electron/discord/client'
import { applyJustificationChannel } from '../electron/discord/justifications'
import * as justificationSettingsStore from '../electron/store/justificationSettings'

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

  // GET /api/guilds/:guildId/justifications não precisa de ligação à Discord — só lê um ficheiro
  // local — por isso a verificação de "bot ligado" fica dentro de cada rota que precisa mesmo dela,
  // em vez de bloquear tudo (incluindo rotas desconhecidas, que devem dar sempre 404).
  const needsConnection =
    (req.method === 'GET' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'guilds') ||
    (req.method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'guilds' && parts[3] === 'channels') ||
    (req.method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'guilds' && parts[3] === 'justifications')

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

    sendJson(res, 404, { error: 'Rota não encontrada.' })
  } catch (err) {
    console.error('[api] Erro a processar pedido:', err)
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Erro desconhecido.' })
  }
}
