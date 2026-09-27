import {
  AuditLogEvent,
  type Client,
  type ReadonlyCollection,
  EmbedBuilder,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
  type PartialMessage,
  PermissionFlagsBits,
  type Snowflake,
  time,
  TimestampStyles,
} from 'discord.js'
import type { MovPointsLogEntry, ServerLogSettings } from '../../shared/types'
import { HOURS_LOG_ACTIONS } from '../../shared/types'
import { formatDuration } from '../../shared/leaderboardFormat'
import * as store from '../store/serverLogs'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'

// Canais de log do servidor: mensagens apagadas (com quem apagou, pelo registo de auditoria),
// mensagens editadas, e cada alteração de pontos/horas de Mov. Call.

const CONTENT_LIMIT = 1500
const AUDIT_LOG_DELAY_MS = 1200
const AUDIT_FRESH_MS = 15_000
const MAX_AUDIT_CACHE = 200

type ChannelKey = 'messageDeleteChannelId' | 'messageEditChannelId' | 'pointsChannelId' | 'hoursChannelId'
const NAME_KEYS: Record<ChannelKey, keyof ServerLogSettings> = {
  messageDeleteChannelId: 'messageDeleteChannelName',
  messageEditChannelId: 'messageEditChannelName',
  pointsChannelId: 'pointsChannelName',
  hoursChannelId: 'hoursChannelName',
}

/** Valida os canais escolhidos (o bot tem de conseguir mandar embeds lá) e grava. */
export async function applyServerLogSettings(guild: Guild, input: ServerLogSettings): Promise<ServerLogSettings> {
  const me = guild.members.me ?? (await guild.members.fetchMe())
  const next: ServerLogSettings = { ...store.defaultServerLogSettings(), ...input }
  const names = next as unknown as Record<string, string | null>
  for (const key of Object.keys(NAME_KEYS) as ChannelKey[]) {
    const id = next[key]
    if (!id) {
      names[NAME_KEYS[key]] = null
      continue
    }
    const channel = await guild.channels.fetch(id).catch(() => null)
    if (!channel || !channel.isTextBased() || channel.isThread()) throw new Error('Um dos canais de log já não existe ou não é de texto.')
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      throw new Error(`O bot não consegue enviar embeds em #${channel.name} — dá-lhe Ver canal, Enviar mensagens e Inserir links.`)
    }
    names[NAME_KEYS[key]] = channel.name
  }
  return store.saveServerLogSettings(guild.id, next)
}

async function logChannel(guild: Guild, channelId: string | null): Promise<GuildTextBasedChannel | null> {
  if (!channelId) return null
  const channel = await guild.channels.fetch(channelId).catch(() => null)
  return channel && channel.isTextBased() ? channel : null
}

function clip(text: string, max = CONTENT_LIMIT): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

async function send(channel: GuildTextBasedChannel, embed: EmbedBuilder): Promise<void> {
  if (!embedHasContent(embed)) return
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((err) => console.error('[logs] Falha a enviar log:', err))
}

// ==========================================================================
// Mensagens apagadas
// ==========================================================================

/** Último "count" visto por entrada do registo de auditoria — a Discord agrupa apagamentos repetidos na mesma entrada. */
const auditCounts = new Map<string, number>()

/**
 * Descobre quem apagou a mensagem pelo registo de auditoria. A Discord só regista quando alguém apaga
 * a mensagem de OUTRA pessoa — sem entrada, foi o próprio autor. Precisa de "Ver registo de auditoria".
 */
async function findDeleter(guild: Guild, authorId: string | null, channelId: string): Promise<string | null> {
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null))
  if (!authorId || !me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null
  await new Promise((r) => setTimeout(r, AUDIT_LOG_DELAY_MS))
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 8 }).catch(() => null)
  if (!logs) return null

  let found: string | null = null
  for (const entry of logs.entries.values()) {
    const extra = entry.extra as { count?: number; channel?: { id: string } } | null
    const count = extra?.count ?? 1
    const previous = auditCounts.get(entry.id)
    auditCounts.set(entry.id, count)
    if (found || entry.targetId !== authorId || extra?.channel?.id !== channelId) continue
    const fresh = Date.now() - entry.createdTimestamp < AUDIT_FRESH_MS
    if ((previous === undefined && fresh) || (previous !== undefined && count > previous)) found = entry.executorId
  }
  if (auditCounts.size > MAX_AUDIT_CACHE) {
    for (const key of [...auditCounts.keys()].slice(0, auditCounts.size - MAX_AUDIT_CACHE)) auditCounts.delete(key)
  }
  return found
}

export async function handleMessageDeleteLog(message: Message | PartialMessage): Promise<void> {
  if (!message.guild) return
  const settings = store.getServerLogSettings(message.guild.id)
  if (!settings.messageDeleteChannelId || message.channelId === settings.messageDeleteChannelId) return
  const author = message.author
  if (author?.bot && settings.ignoreBots) return

  const channel = await logChannel(message.guild, settings.messageDeleteChannelId)
  if (!channel) return

  const deleterId = await findDeleter(message.guild, author?.id ?? null, message.channelId)
  const known = !message.partial
  const content = known ? message.content?.trim() || '*(sem texto)*' : '*(mensagem antiga — não estava na memória do bot, o conteúdo é desconhecido)*'
  const attachments = known ? [...message.attachments.values()].map((a) => `[${a.name}](${a.url})`).join('\n') : ''

  const embed = buildEmbedFromDraft(getTemplate(message.guild.id, 'logMessageDelete'), {
    autor: author ? `<@${author.id}>` : '*desconhecido*',
    nomeAutor: author?.tag ?? 'desconhecido',
    avatarAutor: author?.displayAvatarURL({ size: 128 }) ?? '',
    idAutor: author?.id ?? '—',
    canal: `<#${message.channelId}>`,
    conteudo: clip(content),
    anexos: attachments ? clip(attachments, 1000) : '—',
    apagadaPor: deleterId ? `<@${deleterId}>` : author ? 'o próprio autor' : '*desconhecido*',
    enviadaEm: message.createdAt ? time(message.createdAt, TimestampStyles.ShortDateTime) : '—',
    idMensagem: message.id,
  })
  await send(channel, embed)
}

export async function handleBulkDeleteLog(messages: ReadonlyCollection<Snowflake, Message | PartialMessage>, channelId: string, guild: Guild): Promise<void> {
  const settings = store.getServerLogSettings(guild.id)
  if (!settings.messageDeleteChannelId || channelId === settings.messageDeleteChannelId) return
  const channel = await logChannel(guild, settings.messageDeleteChannelId)
  if (!channel) return

  const lines = [...messages.values()]
    .filter((m) => !m.partial && !(m.author?.bot && settings.ignoreBots))
    .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0))
    .slice(0, 20)
    .map((m) => `**${m.author?.tag ?? '?'}:** ${clip(m.content?.replace(/\n/g, ' ') || '*(sem texto)*', 120)}`)
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`🧹 ${messages.size} mensagens apagadas em massa`)
    .setDescription(clip([`**Canal:** <#${channelId}>`, '', ...(lines.length ? lines : ['*(nenhuma estava na memória do bot)*'])].join('\n'), 4000))
    .setTimestamp(new Date())
  await send(channel, embed)
}

// ==========================================================================
// Mensagens editadas
// ==========================================================================

export async function handleMessageEditLog(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): Promise<void> {
  if (!newMessage.guild) return
  const settings = store.getServerLogSettings(newMessage.guild.id)
  if (!settings.messageEditChannelId || newMessage.channelId === settings.messageEditChannelId) return
  const full = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage
  if (!full || !full.author || full.webhookId) return
  if (full.author.bot && settings.ignoreBots) return
  // A Discord também manda "edições" quando só carrega a pré-visualização de um link — ignora.
  if (!oldMessage.partial && oldMessage.content === full.content) return

  const channel = await logChannel(newMessage.guild, settings.messageEditChannelId)
  if (!channel) return
  const embed = buildEmbedFromDraft(getTemplate(newMessage.guild.id, 'logMessageEdit'), {
    autor: `<@${full.author.id}>`,
    nomeAutor: full.author.tag,
    avatarAutor: full.author.displayAvatarURL({ size: 128 }),
    idAutor: full.author.id,
    canal: `<#${full.channelId}>`,
    antes: clip(oldMessage.partial ? '*(desconhecido — mensagem antiga)*' : oldMessage.content || '*(sem texto)*', 1000),
    depois: clip(full.content || '*(sem texto)*', 1000),
    link: full.url,
  })
  await send(channel, embed)
}

// ==========================================================================
// Pontos e horas de Mov. Call
// ==========================================================================

export async function postMovPointsLog(client: Client, entry: MovPointsLogEntry): Promise<void> {
  if (!client.isReady() || !client.guilds.cache.has(entry.guildId)) return
  const guild = await client.guilds.fetch(entry.guildId).catch(() => null)
  if (!guild) return
  const settings = store.getServerLogSettings(guild.id)

  if (entry.action === 'reset') {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('♻️ Placar de Mov. Call reposto')
      .setDescription(`**${entry.actorTag}** apagou todos os pontos e horas do servidor.`)
      .setTimestamp(new Date(entry.date))
    for (const id of new Set([settings.pointsChannelId, settings.hoursChannelId])) {
      const channel = await logChannel(guild, id)
      if (channel) await send(channel, embed)
    }
    return
  }

  const isHours = HOURS_LOG_ACTIONS.includes(entry.action)
  const channel = await logChannel(guild, isHours ? settings.hoursChannelId : settings.pointsChannelId)
  if (!channel) return
  const adding = entry.action === 'add_points' || entry.action === 'add_hours'
  const format = (n: number | null) => (n === null ? '—' : isHours ? formatDuration(Math.max(0, n)) : String(n))
  const embed = buildEmbedFromDraft(getTemplate(guild.id, isHours ? 'logHours' : 'logPoints'), {
    membro: entry.targetUserId ? `<@${entry.targetUserId}>` : (entry.targetTag ?? '—'),
    nomeMembro: entry.targetTag ?? '—',
    acao: adding ? 'adicionou' : 'removeu',
    quantidade: format(entry.amount),
    total: format(entry.newTotal),
    autor: entry.actorTag,
    nota: entry.note?.trim() || '—',
  })
  if (!embed.data.timestamp) embed.setTimestamp(new Date(entry.date))
  await send(channel, embed)
}
