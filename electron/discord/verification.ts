import {
  ActionRowBuilder,
  AttachmentBuilder,
  type ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type Client,
  EmbedBuilder,
  GatewayIntentBits,
  type Guild,
  type GuildMember,
  IntentsBitField,
  type Message,
  type MessageReaction,
  type NonThreadGuildBasedChannel,
  type OverwriteResolvable,
  type PartialMessage,
  type PartialMessageReaction,
  type PartialUser,
  PermissionFlagsBits,
  time,
  TimestampStyles,
  type User,
} from 'discord.js'
import type {
  VerificationButtonStyle,
  VerificationDiagnostics,
  VerificationEntry,
  VerificationEvent,
  VerificationSettings,
  VerificationTicket,
} from '../../shared/types'
import * as store from '../store/verification'
import { getTemplate, isCustomized } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'

// Fluxo: painel com o botão "Verificar" num canal → o membro clica → o bot cria um canal de ticket
// privado (só o membro, a gestão e o bot o veem) na categoria escolhida → o membro manda a foto →
// o bot recria-a num embed com ✅/❌ e marca a gestão → um gestor reage → cargos, log e o ticket fecha.

const APPROVE = '✅'
const REJECT = '❌'
const OPEN_BUTTON_ID = 'verif:open'
const CLOSE_BUTTON_PREFIX = 'verif:close:'
const MAX_IMAGES = 4
/** Limite de upload de um bot num servidor sem boosts. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const WARNING_TTL_MS = 10_000
const MANUAL_CLOSE_DELAY_MS = 5_000
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i

const BUTTON_STYLES: Record<VerificationButtonStyle, ButtonStyle> = {
  success: ButtonStyle.Success,
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  danger: ButtonStyle.Danger,
}

/** Pedidos a ser decididos agora mesmo — evita dois gestores a aprovar o mesmo ao mesmo tempo. */
const processing = new Set<string>()
/** Membros com um ticket a ser criado agora mesmo — evita dois cliques rápidos criarem dois canais. */
const opening = new Set<string>()

// ==========================================================================
// Diagnóstico
// ==========================================================================

/** Últimos acontecimentos por servidor (só em memória) — mostrados no diagnóstico da app. */
const MAX_EVENTS = 30
const recentEvents = new Map<string, VerificationEvent[]>()

function logEvent(guildId: string, level: VerificationEvent['level'], text: string): void {
  const list = recentEvents.get(guildId) ?? []
  list.unshift({ at: new Date().toISOString(), level, text })
  recentEvents.set(guildId, list.slice(0, MAX_EVENTS))
  if (level === 'error') console.error(`[verificação] ${text}`)
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

const PANEL_PERMISSIONS = [
  [PermissionFlagsBits.ViewChannel, 'Ver canal'],
  [PermissionFlagsBits.SendMessages, 'Enviar mensagens'],
  [PermissionFlagsBits.EmbedLinks, 'Inserir links'],
  [PermissionFlagsBits.ReadMessageHistory, 'Ler histórico de mensagens'],
] as const

const TICKET_PERMISSIONS = [
  [PermissionFlagsBits.ViewChannel, 'Ver canal'],
  [PermissionFlagsBits.ManageChannels, 'Gerir canais'],
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
  if (!client || !client.isReady()) return { checks: [{ label: 'Bot ligado à Discord', ok: false, detail: 'O bot não está ligado.' }], events }

  const checks: VerificationDiagnostics['checks'] = [{ label: 'Bot ligado à Discord', ok: true }]
  checks.push({
    label: 'Intent Message Content',
    ok: hasMessageContent(client),
    detail: 'Desligada — ativa em Developer Portal → Bot → Privileged Gateway Intents e reinicia o bot.',
  })

  const settings = store.getVerificationSettings(guildId)
  const guild = await client.guilds.fetch(guildId).catch(() => null)
  const me = guild ? (guild.members.me ?? (await guild.members.fetchMe().catch(() => null))) : null
  if (!guild || !me) return { checks, events }

  // Painel
  const panel = settings.channelId ? await guild.channels.fetch(settings.channelId).catch(() => null) : null
  if (!settings.channelId) checks.push({ label: 'Painel com o botão', ok: false, detail: 'Escolhe o canal do painel e guarda.' })
  else if (!panel || !panel.isTextBased()) checks.push({ label: 'Painel com o botão', ok: false, detail: 'O canal do painel já não existe.' })
  else {
    const missing = PANEL_PERMISSIONS.filter(([flag]) => !panel.permissionsFor(me)?.has(flag)).map(([, l]) => l)
    const message = settings.panelMessageId ? await panel.messages.fetch(settings.panelMessageId).catch(() => null) : null
    checks.push({
      label: `Painel em #${panel.name}`,
      ok: missing.length === 0 && Boolean(message),
      detail: missing.length > 0 ? `Faltam: ${missing.join(', ')}` : 'A mensagem do painel foi apagada — guarda outra vez para a publicar.',
    })
  }

  // Categoria dos tickets
  const category = settings.ticketCategoryId ? await guild.channels.fetch(settings.ticketCategoryId).catch(() => null) : null
  if (!category || category.type !== ChannelType.GuildCategory) {
    checks.push({ label: 'Categoria dos tickets', ok: false, detail: settings.ticketCategoryId ? 'A categoria já não existe.' : 'Escolhe a categoria e guarda.' })
  } else {
    const missing: string[] = TICKET_PERMISSIONS.filter(([flag]) => !category.permissionsFor(me)?.has(flag)).map(([, l]) => l)
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) missing.push('Gerir cargos (no servidor)')
    checks.push({ label: `Categoria ${category.name}`, ok: missing.length === 0, detail: `Faltam: ${missing.join(', ')}` })
  }

  checks.push({
    label: 'Cargo a marcar',
    ok: !settings.pingRoleId || Boolean(await guild.roles.fetch(settings.pingRoleId).catch(() => null)),
    detail: 'O cargo escolhido já não existe.',
  })
  return { checks, events }
}

// ==========================================================================
// Definições (app / bot remoto)
// ==========================================================================

/**
 * Valida e grava as definições da verificação — permissões no canal do painel e na categoria dos
 * tickets, hierarquia dos cargos a dar/tirar — e publica (ou atualiza) o painel com o botão.
 */
export async function applyVerificationSettings(guild: Guild, input: VerificationSettings): Promise<VerificationSettings> {
  const me = guild.members.me ?? (await guild.members.fetchMe())
  await guild.roles.fetch()
  const previous = store.getVerificationSettings(guild.id)

  const next: VerificationSettings = {
    ...store.defaultVerificationSettings(),
    ...input,
    panelMessageId: previous.panelMessageId,
    pingText: (input.pingText ?? '').trim() || store.DEFAULT_PING_TEXT,
    ticketNameTemplate: (input.ticketNameTemplate ?? '').trim() || store.DEFAULT_TICKET_NAME,
    closeMessage: (input.closeMessage ?? '').trim() || store.DEFAULT_CLOSE_MESSAGE,
    buttonLabel: (input.buttonLabel ?? '').trim().slice(0, 80) || 'Verificar',
    buttonEmoji: (input.buttonEmoji ?? '').trim(),
    maxTicketsPerWindow: clampInt(input.maxTicketsPerWindow, 1, 20, 2),
    ticketWindowMinutes: clampInt(input.ticketWindowMinutes, 1, 10_080, 60),
  }

  if (next.channelId) {
    const channel = await guild.channels.fetch(next.channelId).catch(() => null)
    if (!channel || !channel.isTextBased() || channel.isThread()) throw new Error('O canal do painel tem de ser um canal de texto.')
    const missing = PANEL_PERMISSIONS.filter(([flag]) => !channel.permissionsFor(me)?.has(flag)).map(([, l]) => l)
    if (missing.length > 0) throw new Error(`O bot precisa destas permissões em #${channel.name}: ${missing.join(', ')}.`)
    next.channelName = channel.name
  } else {
    next.channelName = null
  }

  if (next.ticketCategoryId) {
    const category = await guild.channels.fetch(next.ticketCategoryId).catch(() => null)
    if (!category || category.type !== ChannelType.GuildCategory) throw new Error('Escolhe uma categoria válida para os tickets.')
    const missing = TICKET_PERMISSIONS.filter(([flag]) => !category.permissionsFor(me)?.has(flag)).map(([, l]) => l)
    if (missing.length > 0) throw new Error(`Para criar tickets em ${category.name}, o bot precisa de: ${missing.join(', ')}.`)
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error('Para criar tickets privados, o bot precisa da permissão Gerir cargos (é o que deixa definir quem vê cada canal).')
    }
    next.ticketCategoryName = category.name
  } else {
    next.ticketCategoryName = null
  }
  if (next.channelId && !next.ticketCategoryId) throw new Error('Escolhe a categoria onde os tickets vão ser criados.')

  if (next.pingRoleId) {
    const role = guild.roles.cache.get(next.pingRoleId)
    if (!role) throw new Error('O cargo a marcar já não existe.')
    next.pingRoleName = role.name
  } else {
    next.pingRoleName = null
  }

  const existing = (ids: string[]) => [...new Set(ids ?? [])].filter((id) => guild.roles.cache.has(id) && id !== guild.id)
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

  // O painel mudou de canal (ou foi desligado): apaga o antigo para não ficar um botão órfão.
  if (previous.panelMessageId && previous.channelId && previous.channelId !== next.channelId) {
    const old = await guild.channels.fetch(previous.channelId).catch(() => null)
    if (old?.isTextBased()) await old.messages.delete(previous.panelMessageId).catch(() => undefined)
    next.panelMessageId = null
  }

  store.saveVerificationSettings(guild.id, next)
  if (next.channelId) {
    next.panelMessageId = await postVerificationPanel(guild)
  }
  return store.getVerificationSettings(guild.id)
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

function panelComponents(settings: VerificationSettings, withEmoji = true): ActionRowBuilder<ButtonBuilder>[] {
  const button = new ButtonBuilder().setCustomId(OPEN_BUTTON_ID).setLabel(settings.buttonLabel || 'Verificar').setStyle(BUTTON_STYLES[settings.buttonStyle] ?? ButtonStyle.Success)
  if (withEmoji && settings.buttonEmoji) button.setEmoji(settings.buttonEmoji)
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(button)]
}

/** Publica ou atualiza o painel com o botão "Verificar". Devolve o id da mensagem. */
export async function postVerificationPanel(guild: Guild): Promise<string | null> {
  const settings = store.getVerificationSettings(guild.id)
  if (!settings.channelId) return null
  const channel = await guild.channels.fetch(settings.channelId).catch(() => null)
  if (!channel || !channel.isTextBased()) return null

  let embed = buildEmbedFromDraft(getTemplate(guild.id, 'verificationPanel'), { servidor: guild.name })
  if (!embedHasContent(embed)) embed = embed.setDescription('Clica no botão abaixo para te verificares.')

  const send = async (withEmoji: boolean) => {
    const payload = { embeds: [embed], components: panelComponents(settings, withEmoji) }
    const existing = settings.panelMessageId ? await channel.messages.fetch(settings.panelMessageId).catch(() => null) : null
    if (existing) return (await existing.edit(payload)).id
    return (await channel.send(payload)).id
  }

  let messageId: string
  try {
    messageId = await send(true)
  } catch (err) {
    if (!settings.buttonEmoji) throw err
    // Emoji inválido (ex.: texto em vez de emoji) — publica sem ele em vez de falhar tudo.
    logEvent(guild.id, 'warn', `O emoji do botão ("${settings.buttonEmoji}") não é válido — publiquei o painel sem emoji.`)
    messageId = await send(false)
  }
  store.setPanelMessageId(guild.id, messageId)
  return messageId
}

// ==========================================================================
// Quem pode aprovar / ver os tickets
// ==========================================================================

/** Administradores e os cargos de aprovação (ou, se nenhum estiver escolhido, o cargo marcado). */
export function isApprover(member: GuildMember, settings: VerificationSettings): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true
  return staffRoleIds(settings).some((id) => member.roles.cache.has(id))
}

function staffRoleIds(settings: VerificationSettings): string[] {
  return settings.approverRoleIds.length > 0 ? settings.approverRoleIds : settings.pingRoleId ? [settings.pingRoleId] : []
}

export function fillPingText(template: string, roleId: string | null, userId: string): string {
  return (template || store.DEFAULT_PING_TEXT)
    .split('{cargo}')
    .join(roleId ? `<@&${roleId}>` : '')
    .split('{membro}')
    .join(`<@${userId}>`)
    .trim()
}

/** Nome do canal de ticket a partir do modelo — minúsculas, sem espaços, até 100 caracteres. */
export function buildTicketName(template: string, user: { username: string; id: string }, number: number): string {
  const raw = (template || store.DEFAULT_TICKET_NAME)
    .split('{usuario}')
    .join(user.username)
    .split('{id}')
    .join(user.id)
    .split('{numero}')
    .join(String(number).padStart(3, '0'))
  const clean = raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\p{Extended_Pictographic}_・•|-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
  return clean || `verificacao-${number}`
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
// Botões: abrir e fechar ticket
// ==========================================================================

export async function handleVerificationButtons(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId === OPEN_BUTTON_ID) {
    await openTicket(interaction)
    return true
  }
  if (interaction.customId.startsWith(CLOSE_BUTTON_PREFIX)) {
    await closeTicketByButton(interaction, interaction.customId.slice(CLOSE_BUTTON_PREFIX.length))
    return true
  }
  return false
}

async function openTicket(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild
  if (!guild) return
  const settings = store.getVerificationSettings(guild.id)
  const user = interaction.user
  const member = await guild.members.fetch(user.id).catch(() => null)
  const staff = member ? isApprover(member, settings) : false

  if (!settings.ticketCategoryId) {
    await interaction.reply({ content: '❌ A verificação ainda não está configurada (falta a categoria dos tickets). Avisa a gestão.', ephemeral: true })
    return
  }

  const existing = store.findOpenTicketByUser(guild.id, user.id)
  if (existing) {
    const channel = await guild.channels.fetch(existing.channelId).catch(() => null)
    if (channel) {
      await interaction.reply({ content: `📋 Já tens um ticket aberto: <#${existing.channelId}>`, ephemeral: true })
      return
    }
    store.closeTicket(existing.id, 'closed', 'canal apagado')
  }

  // Limite: N tickets por janela de tempo (a gestão não tem limite, para poder testar).
  if (!staff) {
    const windowMs = settings.ticketWindowMinutes * 60_000
    const recent = store.ticketsOpenedSince(guild.id, user.id, new Date(Date.now() - windowMs))
    if (recent.length >= settings.maxTicketsPerWindow) {
      const oldest = recent.map((t) => new Date(t.createdAt).getTime()).sort((a, b) => a - b)[0]
      const retryAt = new Date(oldest + windowMs)
      logEvent(guild.id, 'info', `${user.tag} tentou abrir um ticket mas atingiu o limite (${settings.maxTicketsPerWindow}).`)
      await interaction.reply({
        content: `⏳ Só podes abrir **${settings.maxTicketsPerWindow} ticket(s)** a cada ${formatWindow(settings.ticketWindowMinutes)}. Tenta outra vez ${time(retryAt, TimestampStyles.RelativeTime)}.`,
        ephemeral: true,
      })
      return
    }
  }

  if (opening.has(`${guild.id}:${user.id}`)) {
    await interaction.reply({ content: '⏳ O teu ticket já está a ser criado…', ephemeral: true })
    return
  }
  opening.add(`${guild.id}:${user.id}`)
  try {
    await interaction.deferReply({ ephemeral: true })
    const number = store.nextTicketNumber(guild.id)
    const me = guild.members.me ?? (await guild.members.fetchMe())
    const staffIds = [...new Set([...staffRoleIds(settings), ...(settings.pingRoleId ? [settings.pingRoleId] : [])])]
    const overwrites: OverwriteResolvable[] = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory],
      },
      ...staffIds.map((id) => ({
        id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AddReactions,
        ],
      })),
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ]

    let channel: NonThreadGuildBasedChannel
    try {
      channel = await guild.channels.create({
        name: buildTicketName(settings.ticketNameTemplate, user, number),
        type: ChannelType.GuildText,
        parent: settings.ticketCategoryId,
        permissionOverwrites: overwrites,
        topic: `Verificação de ${user.tag} (${user.id})`,
        reason: `Ticket de verificação de ${user.tag}`,
      })
    } catch (err) {
      logEvent(guild.id, 'error', `Não consegui criar o ticket de ${user.tag}: ${errText(err)}`)
      await interaction.editReply({ content: '❌ Não consegui criar o teu ticket. Avisa a gestão.' })
      return
    }

    const ticket = store.addTicket({ guildId: guild.id, channelId: channel.id, channelName: channel.name, userId: user.id, userTag: user.tag, number })

    if (channel.isTextBased()) {
      let embed = buildEmbedFromDraft(getTemplate(guild.id, 'verificationTicket'), {
        membro: `<@${user.id}>`,
        nome: member?.displayName ?? user.username,
        avatar: user.displayAvatarURL({ size: 256 }),
        id: user.id,
        numero: String(number),
        cargo: settings.pingRoleId ? `<@&${settings.pingRoleId}>` : '',
        servidor: guild.name,
      })
      if (!embedHasContent(embed)) embed = embed.setDescription('Envia aqui o print do teu perfil com os cargos.')
      const close = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${CLOSE_BUTTON_PREFIX}${ticket.id}`).setLabel('Fechar ticket').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
      )
      await channel
        .send({ content: `<@${user.id}>`, embeds: [embed], components: [close], allowedMentions: { users: [user.id] } })
        .catch((err) => logEvent(guild.id, 'warn', `Ticket criado, mas não consegui mandar a mensagem inicial: ${errText(err)}`))
    }

    logEvent(guild.id, 'info', `Ticket #${number} aberto por ${user.tag} (#${channel.name}).`)
    await interaction.editReply({ content: `✅ O teu ticket foi criado: <#${channel.id}> — envia lá o print do teu perfil com os cargos.` })
  } finally {
    opening.delete(`${guild.id}:${user.id}`)
  }
}

function formatWindow(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? '24 horas' : `${minutes / 1440} dias`
  if (minutes % 60 === 0) return minutes === 60 ? '1 hora' : `${minutes / 60} horas`
  return `${minutes} minutos`
}

async function closeTicketByButton(interaction: ButtonInteraction, ticketId: string): Promise<void> {
  const guild = interaction.guild
  if (!guild) return
  const settings = store.getVerificationSettings(guild.id)
  const ticket = store.listTickets(guild.id).find((t) => t.id === ticketId)
  if (!ticket || ticket.status !== 'open') {
    await interaction.reply({ content: 'ℹ️ Este ticket já foi fechado.', ephemeral: true })
    return
  }
  const member = await guild.members.fetch(interaction.user.id).catch(() => null)
  if (interaction.user.id !== ticket.userId && !(member && isApprover(member, settings))) {
    await interaction.reply({ content: '❌ Só quem abriu o ticket ou a gestão o podem fechar.', ephemeral: true })
    return
  }

  store.closeTicket(ticket.id, 'closed', interaction.user.tag)
  const pending = store.findPendingByTicket(ticket.id)
  if (pending) store.dropPending(pending.id)
  logEvent(guild.id, 'info', `Ticket #${ticket.number} de ${ticket.userTag} fechado por ${interaction.user.tag}.`)
  await interaction.reply({ content: `🔒 Ticket fechado por ${interaction.user} — este canal vai ser apagado em ${MANUAL_CLOSE_DELAY_MS / 1000} segundos.`, allowedMentions: { parse: [] } })
  scheduleChannelDelete(guild, ticket.channelId, MANUAL_CLOSE_DELAY_MS, `Ticket fechado por ${interaction.user.tag}`)
}

function scheduleChannelDelete(guild: Guild, channelId: string, delayMs: number, reason: string): void {
  setTimeout(() => {
    void guild.channels
      .delete(channelId, reason)
      .catch((err) => logEvent(guild.id, 'warn', `Não consegui apagar o canal do ticket: ${errText(err)}`))
  }, delayMs)
}

// ==========================================================================
// Mensagem nova dentro de um ticket
// ==========================================================================

export async function handleVerificationMessage(message: Message): Promise<void> {
  if (!message.inGuild() || message.author.bot || message.webhookId || message.system) return
  const ticket = store.findOpenTicketByChannel(message.channelId)
  if (!ticket) return
  if (message.author.id !== ticket.userId) return // a gestão pode conversar à vontade no ticket
  const settings = store.getVerificationSettings(message.guildId)

  // Sem a intent MessageContent a Discord não manda os anexos — sem isto, TODAS as fotos pareciam
  // "mensagens sem imagem" e eram apagadas.
  if (!hasMessageContent(message.client)) {
    logEvent(message.guildId, 'error', `Mensagem de ${message.author.tag} ignorada: a intent "Message Content" está desligada — sem ela a Discord não manda as imagens ao bot.`)
    return
  }

  const images = [...message.attachments.values()].filter(isImage)
  if (images.length === 0) {
    logEvent(message.guildId, 'info', `Texto de ${message.author.tag} no ticket${settings.deleteNonImage ? ' — apagado com aviso' : ' — ignorado'}.`)
    if (settings.deleteNonImage) {
      await message.delete().catch(() => undefined)
      await tempWarning(message, `📸 ${message.author}, aqui envia só o **print do teu perfil com os cargos** (como imagem).`)
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
    logEvent(message.guildId, 'error', `Não consegui descarregar a foto de ${message.author.tag}: ${errText(err)}`)
    return
  }

  // Uma foto nova substitui o pedido anterior do mesmo ticket que ainda não tinha sido visto.
  const previous = store.findPendingByTicket(ticket.id)
  if (previous) {
    await deleteRequestMessages(message.guild, previous)
    store.dropPending(previous.id)
  }

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null))
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
    logEvent(message.guildId, 'error', `Não consegui publicar o embed de ${message.author.tag}: ${errText(err)}`)
    return
  }
  await message.delete().catch((err) => logEvent(message.guildId, 'warn', `Não consegui apagar a foto original: ${errText(err)}`))
  await sent.react(APPROVE).catch(() => undefined)
  await sent.react(REJECT).catch(() => undefined)

  let pingMessageId: string | null = null
  const pingText = fillPingText(settings.pingText, settings.pingRoleId, message.author.id)
  if (settings.pingRoleId && pingText) {
    const ping = await message.channel
      .send({ content: pingText.slice(0, 2000), allowedMentions: { roles: [settings.pingRoleId], users: [] } })
      .catch((err) => {
        logEvent(message.guildId, 'warn', `Não consegui mandar a marcação: ${errText(err)}`)
        return null
      })
    pingMessageId = ping?.id ?? null
  }
  logEvent(message.guildId, 'info', `Pedido criado para ${message.author.tag} no ticket #${ticket.number} (${files.length} imagem(ns)).`)

  store.addPending({
    guildId: message.guildId,
    channelId: message.channelId,
    userId: message.author.id,
    userTag: message.author.tag,
    userAvatar: message.author.displayAvatarURL({ size: 128 }),
    embedMessageId: sent.id,
    pingMessageId,
    ticketId: ticket.id,
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
            .catch((err) => logEvent(guild.id, 'error', `Falha a dar @${guild.roles.cache.get(id)?.name ?? id}: ${errText(err)}`))
        }
        for (const id of settings.removeRoleIds) {
          if (!target.roles.cache.has(id)) continue
          await target.roles
            .remove(id, `Verificação aprovada por ${moderator.user.tag}`)
            .then(() => removed.push(guild.roles.cache.get(id)?.name ?? id))
            .catch((err) => logEvent(guild.id, 'error', `Falha a tirar @${guild.roles.cache.get(id)?.name ?? id}: ${errText(err)}`))
        }
      }
    }

    // Guarda as imagens antes de apagar o embed — é a única cópia da foto, e vai para o log.
    const logFiles = settings.logChannelId ? await collectImages(reaction.message).catch(() => []) : []

    const decided = store.decide(entry.id, approved ? 'approved' : 'rejected', { id: moderator.id, tag: moderator.user.tag }, { added, removed })
    await deleteRequestMessages(guild, entry)
    if (decided) logEvent(guild.id, 'info', `${entry.userTag} ${approved ? 'aprovado ✅' : 'recusado ❌'} por ${moderator.user.tag}.`)
    if (decided && settings.logChannelId) {
      await postLog(guild, settings.logChannelId, decided, logFiles).catch((err) => logEvent(guild.id, 'error', `Falha a mandar o log: ${errText(err)}`))
    }

    // Dentro de um ticket: avisa o resultado e apaga o canal passados uns segundos.
    const ticket = entry.ticketId ? store.closeTicket(entry.ticketId, approved ? 'approved' : 'rejected', moderator.user.tag) : null
    if (ticket) {
      const channel = await guild.channels.fetch(ticket.channelId).catch(() => null)
      if (channel?.isTextBased()) {
        const text = (settings.closeMessage || store.DEFAULT_CLOSE_MESSAGE)
          .split('{estado}')
          .join(approved ? 'aprovada ✅' : 'recusada ❌')
          .split('{membro}')
          .join(`<@${entry.userId}>`)
          .split('{moderador}')
          .join(`<@${moderator.id}>`)
          .split('{segundos}')
          .join(String(store.CLOSE_DELAY_SECONDS))
        await channel.send({ content: text.slice(0, 2000), allowedMentions: { users: [entry.userId] } }).catch(() => undefined)
      }
      scheduleChannelDelete(guild, ticket.channelId, store.CLOSE_DELAY_SECONDS * 1000, `Verificação ${approved ? 'aprovada' : 'recusada'} por ${moderator.user.tag}`)
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
// Alguém apagou o embed ou o canal do ticket à mão
// ==========================================================================

export async function handleVerificationMessageDelete(message: Message | PartialMessage): Promise<void> {
  if (!message.guild) return
  const entry = store.findPendingByMessage(message.id)
  if (!entry) return
  store.dropPending(entry.id)
  await deleteRequestMessages(message.guild, entry)
}

export function handleVerificationChannelDelete(channelId: string): VerificationTicket | null {
  const ticket = store.findOpenTicketByChannel(channelId)
  if (!ticket) return null
  const pending = store.findPendingByTicket(ticket.id)
  if (pending) store.dropPending(pending.id)
  return store.closeTicket(ticket.id, 'closed', 'canal apagado')
}
