import {
  AttachmentBuilder,
  type Client,
  EmbedBuilder,
  GatewayIntentBits,
  type Guild,
  type GuildMember,
  IntentsBitField,
  type Message,
  type MessageReaction,
  type PartialMessage,
  type PartialMessageReaction,
  type PartialUser,
  PermissionFlagsBits,
  time,
  TimestampStyles,
  type User,
} from 'discord.js'
import type { VerificationDiagnostics, VerificationEntry, VerificationEvent, VerificationSettings } from '../../shared/types'
import * as store from '../store/verification'
import { getTemplate, isCustomized } from '../store/embedTemplates'
import { buildEmbedFromDraft } from './embedTemplate'

const APPROVE = '✅'
const REJECT = '❌'
const MAX_IMAGES = 4
/** Limite de upload de um bot num servidor sem boosts. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const WARNING_TTL_MS = 10_000
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i

/** Pedidos a ser decididos agora mesmo — evita dois gestores a aprovar o mesmo ao mesmo tempo. */
const processing = new Set<string>()

/** Últimos acontecimentos por servidor (só em memória) — mostrados no diagnóstico da app. */
const MAX_EVENTS = 25
const recentEvents = new Map<string, VerificationEvent[]>()

function logEvent(guildId: string, level: VerificationEvent['level'], text: string): void {
  const list = recentEvents.get(guildId) ?? []
  list.unshift({ at: new Date().toISOString(), level, text })
  recentEvents.set(guildId, list.slice(0, MAX_EVENTS))
  if (level === 'error') console.error(`[verificação] ${text}`)
}

const CHANNEL_PERMISSIONS = [
  [PermissionFlagsBits.ViewChannel, 'Ver canal'],
  [PermissionFlagsBits.SendMessages, 'Enviar mensagens'],
  [PermissionFlagsBits.EmbedLinks, 'Inserir links'],
  [PermissionFlagsBits.AttachFiles, 'Anexar ficheiros'],
  [PermissionFlagsBits.AddReactions, 'Adicionar reações'],
  [PermissionFlagsBits.ManageMessages, 'Gerir mensagens'],
  [PermissionFlagsBits.ReadMessageHistory, 'Ler histórico de mensagens'],
] as const

function hasMessageContent(client: Client): boolean {
  return new IntentsBitField(client.options.intents).has(GatewayIntentBits.MessageContent)
}

/** Verifica tudo o que a verificação precisa, para a app mostrar exatamente o que está a falhar. */
export async function getVerificationDiagnostics(client: Client | null, guildId: string): Promise<VerificationDiagnostics> {
  const events = recentEvents.get(guildId) ?? []
  if (!client || !client.isReady()) {
    return { connected: false, messageContent: false, channelOk: false, missingPermissions: [], pingRoleOk: false, events }
  }
  const settings = store.getVerificationSettings(guildId)
  const guild = await client.guilds.fetch(guildId).catch(() => null)
  let channelOk = false
  let missingPermissions: string[] = []
  let pingRoleOk = !settings.pingRoleId
  if (guild) {
    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null))
    if (settings.channelId && me) {
      const channel = await guild.channels.fetch(settings.channelId).catch(() => null)
      if (channel && channel.isTextBased()) {
        channelOk = true
        const perms = channel.permissionsFor(me)
        missingPermissions = CHANNEL_PERMISSIONS.filter(([flag]) => !perms?.has(flag)).map(([, label]) => label)
      }
    }
    if (settings.pingRoleId) pingRoleOk = Boolean(await guild.roles.fetch(settings.pingRoleId).catch(() => null))
  }
  return { connected: true, messageContent: hasMessageContent(client), channelOk, missingPermissions, pingRoleOk, events }
}

// ==========================================================================
// Definições (app / bot remoto)
// ==========================================================================

/**
 * Valida e grava as definições da verificação: confirma que o bot tem as permissões certas no canal
 * e que consegue mesmo dar/tirar os cargos escolhidos (tem de estar acima deles na hierarquia).
 */
export async function applyVerificationSettings(guild: Guild, input: VerificationSettings): Promise<VerificationSettings> {
  const me = guild.members.me ?? (await guild.members.fetchMe())
  await guild.roles.fetch()

  const next: VerificationSettings = {
    ...store.defaultVerificationSettings(),
    ...input,
    pingText: (input.pingText ?? '').trim() || store.DEFAULT_PING_TEXT,
  }

  if (next.channelId) {
    const channel = await guild.channels.fetch(next.channelId).catch(() => null)
    if (!channel || !channel.isTextBased() || channel.isThread()) throw new Error('O canal de verificação tem de ser um canal de texto.')
    const perms = channel.permissionsFor(me)
    const missing = CHANNEL_PERMISSIONS.filter(([flag]) => !perms?.has(flag)).map(([, label]) => label)
    if (missing.length > 0) throw new Error(`O bot precisa destas permissões em #${channel.name}: ${missing.join(', ')}.`)
    next.channelName = channel.name
  } else {
    next.channelName = null
  }

  if (next.pingRoleId) {
    const role = guild.roles.cache.get(next.pingRoleId)
    if (!role) throw new Error('O cargo a marcar já não existe.')
    next.pingRoleName = role.name
  } else {
    next.pingRoleName = null
  }

  const existing = (ids: string[]) => [...new Set(ids)].filter((id) => guild.roles.cache.has(id) && id !== guild.id)
  next.approverRoleIds = existing(next.approverRoleIds)
  next.addRoleIds = existing(next.addRoleIds)
  next.removeRoleIds = existing(next.removeRoleIds)

  const tooHigh = [...next.addRoleIds, ...next.removeRoleIds]
    .map((id) => guild.roles.cache.get(id)!)
    .filter((role) => role.managed || role.position >= me.roles.highest.position)
  if (tooHigh.length > 0) {
    throw new Error(
      `O bot não consegue gerir ${tooHigh.map((r) => `@${r.name}`).join(', ')} — arrasta o cargo do bot para cima destes em Definições do servidor → Cargos.`,
    )
  }
  if ((next.addRoleIds.length > 0 || next.removeRoleIds.length > 0) && !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('Para dar/tirar cargos ao aprovar, o bot precisa da permissão Gerir cargos.')
  }

  if (next.logChannelId) {
    const log = await guild.channels.fetch(next.logChannelId).catch(() => null)
    if (!log || !log.isTextBased() || log.isThread()) throw new Error('O canal de log tem de ser um canal de texto.')
    if (!log.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles])) {
      throw new Error(`O bot não consegue enviar embeds com imagens em #${log.name}.`)
    }
    next.logChannelName = log.name
  } else {
    next.logChannelName = null
  }

  return store.saveVerificationSettings(guild.id, next)
}

// ==========================================================================
// Quem pode aprovar
// ==========================================================================

/** Administradores e os cargos de aprovação (ou, se nenhum estiver escolhido, o cargo marcado). */
export function isApprover(member: GuildMember, settings: VerificationSettings): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true
  const roles = settings.approverRoleIds.length > 0 ? settings.approverRoleIds : settings.pingRoleId ? [settings.pingRoleId] : []
  return roles.some((id) => member.roles.cache.has(id))
}

export function fillPingText(template: string, roleId: string | null, userId: string): string {
  return (template || store.DEFAULT_PING_TEXT)
    .split('{cargo}')
    .join(roleId ? `<@&${roleId}>` : '')
    .split('{membro}')
    .join(`<@${userId}>`)
    .trim()
}

function isImage(a: { contentType: string | null; name: string }): boolean {
  return Boolean(a.contentType?.startsWith('image/')) || IMAGE_EXT.test(a.name)
}

function extensionOf(a: { contentType: string | null; name: string }): string {
  const fromName = a.name.match(IMAGE_EXT)?.[1]?.toLowerCase()
  if (fromName) return fromName === 'jpeg' ? 'jpg' : fromName
  const fromType = a.contentType?.split('/')[1]?.split(';')[0]
  return fromType === 'jpeg' ? 'jpg' : fromType || 'png'
}

async function download(url: string, name: string): Promise<AttachmentBuilder> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Não consegui descarregar a imagem (HTTP ${res.status}).`)
  return new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), { name })
}

async function tempWarning(message: Message<true>, text: string): Promise<void> {
  const warn = await message.channel.send({ content: text, allowedMentions: { users: [message.author.id] } }).catch(() => null)
  if (warn) setTimeout(() => void warn.delete().catch(() => undefined), WARNING_TTL_MS)
}

// ==========================================================================
// Mensagem nova no canal de verificação
// ==========================================================================

export async function handleVerificationMessage(message: Message): Promise<void> {
  if (!message.inGuild() || message.author.bot || message.webhookId || message.system) return
  const settings = store.guildForVerificationChannel(message.guildId, message.channelId)
  if (!settings) return

  // Sem a intent MessageContent a Discord não manda os anexos — sem isto, TODAS as fotos pareciam
  // "mensagens sem imagem" e eram apagadas.
  if (!hasMessageContent(message.client)) {
    logEvent(
      message.guildId,
      'error',
      `Mensagem de ${message.author.tag} ignorada: a intent "Message Content" está desligada — sem ela a Discord não manda as imagens ao bot.`,
    )
    return
  }

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null))
  const images = [...message.attachments.values()].filter(isImage)
  if (images.length === 0) {
    // Texto da gestão fica sempre (podem conversar no canal); imagens são processadas venham de quem vierem.
    if (member && isApprover(member, settings)) {
      logEvent(message.guildId, 'info', `Mensagem sem imagem de ${message.author.tag} (gestão) deixada no canal.`)
      return
    }
    logEvent(message.guildId, 'info', `Mensagem sem imagem de ${message.author.tag}${settings.deleteNonImage ? ' — apagada com aviso' : ' — ignorada'}.`)
    if (settings.deleteNonImage) {
      await message.delete().catch(() => undefined)
      await tempWarning(message, `📸 ${message.author}, neste canal envia só a **foto do teu perfil com os cargos** (como imagem).`)
    }
    return
  }

  const usable = images.filter((a) => a.size <= MAX_IMAGE_BYTES).slice(0, MAX_IMAGES)
  if (usable.length === 0) {
    logEvent(message.guildId, 'warn', `Imagem de ${message.author.tag} com mais de 10 MB — não processada.`)
    await tempWarning(message, `❌ ${message.author}, a imagem é demasiado grande (máx. 10 MB). Tira um print mais pequeno e envia outra vez.`)
    return
  }

  let files: AttachmentBuilder[]
  try {
    files = await Promise.all(usable.map((a, i) => download(a.url, `verificacao-${message.author.id}-${i + 1}.${extensionOf(a)}`)))
  } catch (err) {
    logEvent(message.guildId, 'error', `Não consegui descarregar a foto de ${message.author.tag}: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  // Uma foto nova substitui um pedido anterior do mesmo membro que ainda não tinha sido visto.
  const previous = store.findPendingByUser(message.guildId, message.author.id)
  if (previous) {
    await deleteRequestMessages(message.guild, previous)
    store.dropPending(previous.id)
  }

  const joinedAt = member?.joinedAt ?? null
  const embed = buildEmbedFromDraft(getTemplate(message.guildId, 'verificationRequest'), {
    membro: `<@${message.author.id}>`,
    nome: member?.displayName ?? message.author.username,
    avatar: message.author.displayAvatarURL({ size: 256 }),
    id: message.author.id,
    criada: time(message.author.createdAt, TimestampStyles.ShortDate),
    entrou: joinedAt ? time(joinedAt, TimestampStyles.RelativeTime) : '—',
    servidor: message.guild.name,
  })
  embed.setImage(`attachment://${files[0].name}`)
  const color = embed.data.color ?? 0xed4245
  const extra = files.slice(1).map((f) => new EmbedBuilder().setColor(color).setImage(`attachment://${f.name}`))

  let sent: Message<true>
  try {
    sent = await message.channel.send({ embeds: [embed, ...extra], files, allowedMentions: { parse: [] } })
  } catch (err) {
    logEvent(message.guildId, 'error', `Não consegui publicar o embed de ${message.author.tag}: ${err instanceof Error ? err.message : String(err)}`)
    return
  }
  await message.delete().catch((err) => logEvent(message.guildId, 'warn', `Não consegui apagar a foto original: ${err instanceof Error ? err.message : String(err)}`))
  await sent.react(APPROVE).catch(() => undefined)
  await sent.react(REJECT).catch(() => undefined)

  let pingMessageId: string | null = null
  const pingText = fillPingText(settings.pingText, settings.pingRoleId, message.author.id)
  if (settings.pingRoleId && pingText) {
    const ping = await message.channel
      .send({ content: pingText.slice(0, 2000), allowedMentions: { roles: [settings.pingRoleId], users: [] } })
      .catch((err) => {
        logEvent(message.guildId, 'warn', `Não consegui mandar a marcação: ${err instanceof Error ? err.message : String(err)}`)
        return null
      })
    pingMessageId = ping?.id ?? null
  }
  logEvent(message.guildId, 'info', `Pedido criado para ${message.author.tag} (${files.length} imagem(ns)).`)

  store.addPending({
    guildId: message.guildId,
    channelId: message.channelId,
    userId: message.author.id,
    userTag: message.author.tag,
    userAvatar: message.author.displayAvatarURL({ size: 128 }),
    embedMessageId: sent.id,
    pingMessageId,
    imageCount: files.length,
  })
}

async function deleteRequestMessages(guild: Guild, entry: VerificationEntry): Promise<void> {
  const channel = await guild.channels.fetch(entry.channelId).catch(() => null)
  if (!channel || !channel.isTextBased()) return
  await channel.messages.delete(entry.embedMessageId).catch(() => undefined)
  if (entry.pingMessageId) await channel.messages.delete(entry.pingMessageId).catch(() => undefined)
}

// ==========================================================================
// ✅ / ❌ de um gestor
// ==========================================================================

export async function handleVerificationReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  client: Client,
): Promise<void> {
  if (user.id === client.user?.id) return
  const emoji = reaction.emoji.name
  if (emoji !== APPROVE && emoji !== REJECT) return
  const entry = store.findPendingByMessage(reaction.message.id)
  if (!entry || processing.has(entry.id)) return

  const guild = reaction.message.guild ?? (await client.guilds.fetch(entry.guildId).catch(() => null))
  if (!guild) return
  const settings = store.getVerificationSettings(guild.id)
  const moderator = await guild.members.fetch(user.id).catch(() => null)
  if (!moderator || moderator.user.bot) return
  if (!isApprover(moderator, settings)) {
    logEvent(guild.id, 'info', `Reação ${emoji} de ${moderator.user.tag} removida — não tem cargo de aprovação.`)
    await reaction.users.remove(user.id).catch(() => undefined)
    return
  }

  processing.add(entry.id)
  try {
    const approved = emoji === APPROVE
    const added: string[] = []
    const removed: string[] = []
    if (approved) {
      const target = await guild.members.fetch(entry.userId).catch(() => null)
      if (target) {
        for (const id of settings.addRoleIds) {
          if (target.roles.cache.has(id)) continue
          await target.roles
            .add(id, `Verificação aprovada por ${moderator.user.tag}`)
            .then(() => added.push(guild.roles.cache.get(id)?.name ?? id))
            .catch((err) => logEvent(guild.id, 'error', `Falha a dar @${guild.roles.cache.get(id)?.name ?? id}: ${err instanceof Error ? err.message : String(err)}`))
        }
        for (const id of settings.removeRoleIds) {
          if (!target.roles.cache.has(id)) continue
          await target.roles
            .remove(id, `Verificação aprovada por ${moderator.user.tag}`)
            .then(() => removed.push(guild.roles.cache.get(id)?.name ?? id))
            .catch((err) => logEvent(guild.id, 'error', `Falha a tirar @${guild.roles.cache.get(id)?.name ?? id}: ${err instanceof Error ? err.message : String(err)}`))
        }
      }
    }

    // Guarda as imagens antes de apagar o embed — é a única cópia da foto, e vai para o log.
    const logFiles = settings.logChannelId ? await collectImages(reaction.message).catch(() => []) : []

    const decided = store.decide(entry.id, approved ? 'approved' : 'rejected', { id: moderator.id, tag: moderator.user.tag }, { added, removed })
    await deleteRequestMessages(guild, entry)
    if (decided) logEvent(guild.id, 'info', `${entry.userTag} ${approved ? 'aprovado ✅' : 'recusado ❌'} por ${moderator.user.tag}.`)
    if (decided && settings.logChannelId) {
      await postLog(guild, settings.logChannelId, decided, logFiles).catch((err) =>
        logEvent(guild.id, 'error', `Falha a mandar o log: ${err instanceof Error ? err.message : String(err)}`),
      )
    }
  } finally {
    processing.delete(entry.id)
  }
}

async function collectImages(message: Message | PartialMessage): Promise<AttachmentBuilder[]> {
  const full = message.partial ? await message.fetch() : message
  return Promise.all([...full.attachments.values()].filter(isImage).map((a) => download(a.url, a.name)))
}

async function postLog(guild: Guild, channelId: string, entry: VerificationEntry, files: AttachmentBuilder[]): Promise<void> {
  const channel = await guild.channels.fetch(channelId).catch(() => null)
  if (!channel || !channel.isTextBased()) return
  const approved = entry.status === 'approved'
  const embed = buildEmbedFromDraft(getTemplate(guild.id, 'verificationLog'), {
    membro: `<@${entry.userId}>`,
    nome: entry.userTag,
    avatar: entry.userAvatar ?? '',
    id: entry.userId,
    estado: approved ? 'aprovada ✅' : 'recusada ❌',
    moderador: entry.moderatorId ? `<@${entry.moderatorId}>` : '—',
    cargosDados: entry.rolesAdded?.length ? entry.rolesAdded.map((n) => `@${n}`).join(', ') : '—',
    cargosTirados: entry.rolesRemoved?.length ? entry.rolesRemoved.map((n) => `@${n}`).join(', ') : '—',
    servidor: guild.name,
  })
  // Com o template de fábrica, recusas ficam a vermelho; um template personalizado manda sempre na cor.
  if (!approved && !isCustomized(guild.id, 'verificationLog')) embed.setColor(0xed4245)
  if (files[0]) embed.setImage(`attachment://${files[0].name}`)
  await channel.send({ embeds: [embed], files: files.slice(0, 1), allowedMentions: { parse: [] } })
}

// ==========================================================================
// Alguém apagou o embed à mão
// ==========================================================================

export async function handleVerificationMessageDelete(message: Message | PartialMessage): Promise<void> {
  if (!message.guild) return
  const entry = store.findPendingByMessage(message.id)
  if (!entry) return
  store.dropPending(entry.id)
  await deleteRequestMessages(message.guild, entry)
}
