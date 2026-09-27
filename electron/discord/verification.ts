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
  ModalBuilder,
  type NonThreadGuildBasedChannel,
  type OverwriteResolvable,
  type PartialMessage,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  time,
  TimestampStyles,
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
// o bot recria-a num embed com os botões da gestão (Assumir · Finalizar · Cancelar · Painel staff) e
// marca a gestão → um gestor assume, escolhe os cargos num painel só dele e finaliza → cargos, log e
// o ticket fecha.

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
    claimLabel: (input.claimLabel ?? '').trim().slice(0, 60) || 'Assumir',
    finishLabel: (input.finishLabel ?? '').trim().slice(0, 80) || 'Finalizar',
    cancelLabel: (input.cancelLabel ?? '').trim().slice(0, 80) || 'Cancelar',
    staffPanelLabel: (input.staffPanelLabel ?? '').trim().slice(0, 80) || 'Painel staff',
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
  if (STAFF_BUTTON_IDS.has(interaction.customId)) {
    await handleStaffButton(interaction)
    return true
  }
  // "Finalizar" de um painel staff antigo (o coletor já expirou, ou o bot reiniciou entretanto).
  if (interaction.customId.startsWith('verif:pfinish:') && !activePanels.has(interaction.message.id)) {
    await finishFromStalePanel(interaction, interaction.customId.slice('verif:pfinish:'.length))
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

const CLAIM_ID = 'verif:claim'
const FINISH_ID = 'verif:finish'
const CANCEL_ID = 'verif:cancel'
const PANEL_ID = 'verif:panel'
const STAFF_BUTTON_IDS = new Set([CLAIM_ID, FINISH_ID, CANCEL_ID, PANEL_ID])
const PANEL_TTL_MS = 14 * 60_000
/** Painéis staff com um coletor ativo — os outros são tratados pelo handler global. */
const activePanels = new Set<string>()
const MAX_MANUAL_ROLES = 10

/** Botões da gestão no embed da foto — "Assumir" fica desativado depois de alguém assumir. */
function staffButtons(settings: VerificationSettings, claimedByName?: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(CLAIM_ID)
        .setLabel(claimedByName ? `Assumido por ${claimedByName}`.slice(0, 80) : settings.claimLabel || 'Assumir')
        .setEmoji('🙋')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(Boolean(claimedByName)),
      new ButtonBuilder().setCustomId(FINISH_ID).setLabel(settings.finishLabel || 'Finalizar').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(CANCEL_ID).setLabel(settings.cancelLabel || 'Cancelar').setEmoji('✖️').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(PANEL_ID).setLabel(settings.staffPanelLabel || 'Painel staff').setEmoji('🛠️').setStyle(ButtonStyle.Secondary),
    ),
  ]
}

/** Embed(s) da foto a partir do template — usado ao publicar e sempre que o estado muda (assumido). */
function requestEmbeds(
  guild: Guild,
  info: { userId: string; name: string; avatar: string; createdAt: Date | null; joinedAt: Date | null; claimedById?: string },
  imageNames: string[],
): EmbedBuilder[] {
  const embed = buildEmbedFromDraft(getTemplate(guild.id, 'verificationRequest'), {
    membro: `<@${info.userId}>`,
    nome: info.name,
    avatar: info.avatar,
    id: info.userId,
    criada: info.createdAt ? time(info.createdAt, TimestampStyles.ShortDate) : '—',
    entrou: info.joinedAt ? time(info.joinedAt, TimestampStyles.RelativeTime) : '—',
    responsavel: info.claimedById ? `<@${info.claimedById}>` : '*ninguém ainda*',
    estado: info.claimedById ? '🟡 Em análise' : '⏳ À espera de um verificador',
    servidor: guild.name,
  })
  if (imageNames[0]) embed.setImage(`attachment://${imageNames[0]}`)
  const color = embed.data.color ?? 0xeb459e
  return [embed, ...imageNames.slice(1).map((n) => new EmbedBuilder().setColor(color).setImage(`attachment://${n}`))]
}

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
    files = await Promise.all(usable.map((a, i) => download(a.url, `verificacao-${message.author.id}-${Date.now()}-${i + 1}.${extensionOf(a)}`)))
  } catch (err) {
    logEvent(message.guildId, 'error', `Não consegui descarregar a foto de ${message.author.tag}: ${errText(err)}`)
    return
  }

  // Uma foto nova substitui o pedido anterior do mesmo ticket — mas quem já tinha assumido continua.
  const previous = store.findPendingByTicket(ticket.id)
  if (previous) {
    await deleteRequestMessages(message.guild, previous)
    store.dropPending(previous.id)
  }

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null))
  const claimer = previous?.claimedById ? await message.guild.members.fetch(previous.claimedById).catch(() => null) : null
  const embeds = requestEmbeds(
    message.guild,
    {
      userId: message.author.id,
      name: member?.displayName ?? message.author.username,
      avatar: message.author.displayAvatarURL({ size: 256 }),
      createdAt: message.author.createdAt,
      joinedAt: member?.joinedAt ?? null,
      claimedById: previous?.claimedById,
    },
    files.map((f) => f.name ?? ''),
  )

  let sent: Message<true>
  try {
    sent = await message.channel.send({
      embeds,
      files,
      components: staffButtons(settings, claimer?.displayName ?? previous?.claimedByTag),
      allowedMentions: { parse: [] },
    })
  } catch (err) {
    logEvent(message.guildId, 'error', `Não consegui publicar o embed de ${message.author.tag}: ${errText(err)}`)
    return
  }
  await message.delete().catch((err) => logEvent(message.guildId, 'warn', `Não consegui apagar a foto original: ${errText(err)}`))

  let pingMessageId: string | null = null
  const pingText = fillPingText(settings.pingText, settings.pingRoleId, message.author.id)
  if (settings.pingRoleId && pingText && !previous?.claimedById) {
    const ping = await message.channel
      .send({ content: pingText.slice(0, 2000), allowedMentions: { roles: [settings.pingRoleId], users: [] } })
      .catch((err) => {
        logEvent(message.guildId, 'warn', `Não consegui mandar a marcação: ${errText(err)}`)
        return null
      })
    pingMessageId = ping?.id ?? null
  }
  logEvent(message.guildId, 'info', `Pedido criado para ${message.author.tag} no ticket #${ticket.number} (${files.length} imagem(ns)).`)

  const entry = store.addPending({
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
  if (previous?.claimedById) {
    store.updatePending(entry.id, {
      claimedById: previous.claimedById,
      claimedByTag: previous.claimedByTag,
      claimedAt: previous.claimedAt,
      manualRoleIds: previous.manualRoleIds,
    })
  }
}

async function deleteRequestMessages(guild: Guild, entry: VerificationEntry): Promise<void> {
  const channel = await guild.channels.fetch(entry.channelId).catch(() => null)
  if (!channel || !channel.isTextBased()) return
  await channel.messages.delete(entry.embedMessageId).catch(() => undefined)
  if (entry.pingMessageId) await channel.messages.delete(entry.pingMessageId).catch(() => undefined)
}

// ==========================================================================
// Botões da gestão: Assumir · Finalizar · Cancelar · Painel staff
// ==========================================================================

async function handleStaffButton(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild
  if (!guild) return
  const entry = store.findPendingByMessage(interaction.message.id)
  if (!entry) {
    await interaction.reply({ content: 'ℹ️ Esta verificação já foi finalizada ou cancelada.', ephemeral: true })
    return
  }
  const settings = store.getVerificationSettings(guild.id)
  const member = await guild.members.fetch(interaction.user.id).catch(() => null)
  if (!member || !isApprover(member, settings)) {
    await interaction.reply({ content: '❌ Só a gestão pode usar estes botões.', ephemeral: true })
    return
  }
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator)
  const claimedByOther = entry.claimedById && entry.claimedById !== member.id

  switch (interaction.customId) {
    case CLAIM_ID: {
      if (claimedByOther) {
        await interaction.reply({ content: `🙋 Esta verificação já foi assumida por <@${entry.claimedById}>.`, ephemeral: true, allowedMentions: { parse: [] } })
        return
      }
      const claimed = entry.claimedById ? entry : await claim(interaction, entry, member, settings)
      if (claimed) await showStaffPanel(interaction, claimed, member, settings)
      return
    }
    case PANEL_ID: {
      if (claimedByOther && !isAdmin) {
        await interaction.reply({ content: `🛠️ Só <@${entry.claimedById}> (quem assumiu) ou um administrador podem abrir o painel.`, ephemeral: true, allowedMentions: { parse: [] } })
        return
      }
      const claimed = entry.claimedById ? entry : await claim(interaction, entry, member, settings)
      if (claimed) await showStaffPanel(interaction, claimed, member, settings)
      return
    }
    case FINISH_ID: {
      if (claimedByOther && !isAdmin) {
        await interaction.reply({ content: `✅ Só <@${entry.claimedById}> (quem assumiu) ou um administrador podem finalizar.`, ephemeral: true, allowedMentions: { parse: [] } })
        return
      }
      await interaction.deferReply({ ephemeral: true })
      const ok = await finishVerification(guild, entry, member, true)
      await interaction.editReply({ content: ok ? '✅ Verificação finalizada — log enviado e o ticket vai ser fechado.' : 'ℹ️ Esta verificação já tinha sido decidida.' })
      return
    }
    case CANCEL_ID: {
      if (claimedByOther && !isAdmin) {
        await interaction.reply({ content: `✖️ Só <@${entry.claimedById}> (quem assumiu) ou um administrador podem cancelar.`, ephemeral: true, allowedMentions: { parse: [] } })
        return
      }
      const modalId = `verif:cancelmodal:${interaction.id}`
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(modalId)
          .setTitle('Cancelar verificação')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('motivo')
                .setLabel('Motivo (opcional — vai para o log)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(500)
                .setPlaceholder('Ex.: print ilegível, cargos não correspondem…'),
            ),
          ),
      )
      const submit = await interaction.awaitModalSubmit({ time: 5 * 60_000, filter: (i) => i.customId === modalId }).catch(() => null)
      if (!submit) return
      await submit.deferReply({ ephemeral: true })
      const ok = await finishVerification(guild, entry, member, false, submit.fields.getTextInputValue('motivo').trim() || undefined)
      await submit.editReply({ content: ok ? '✖️ Verificação cancelada — log enviado e o ticket vai ser fechado.' : 'ℹ️ Esta verificação já tinha sido decidida.' })
      return
    }
  }
}

/** Marca o pedido como assumido e atualiza o embed da foto (estado + responsável). */
async function claim(interaction: ButtonInteraction, entry: VerificationEntry, member: GuildMember, settings: VerificationSettings): Promise<VerificationEntry | null> {
  const updated = store.updatePending(entry.id, { claimedById: member.id, claimedByTag: member.user.tag, claimedAt: new Date().toISOString() })
  if (!updated) return null
  logEvent(entry.guildId, 'info', `${member.user.tag} assumiu a verificação de ${entry.userTag}.`)
  const guild = interaction.guild!
  const target = await guild.members.fetch(entry.userId).catch(() => null)
  const imageNames = [...interaction.message.attachments.values()].map((a) => a.name)
  await interaction.message
    .edit({
      embeds: requestEmbeds(
        guild,
        {
          userId: entry.userId,
          name: target?.displayName ?? entry.userTag,
          avatar: target?.user.displayAvatarURL({ size: 256 }) ?? entry.userAvatar ?? '',
          createdAt: target?.user.createdAt ?? null,
          joinedAt: target?.joinedAt ?? null,
          claimedById: member.id,
        },
        imageNames,
      ),
      components: staffButtons(settings, member.displayName),
    })
    .catch((err) => logEvent(entry.guildId, 'warn', `Não consegui atualizar o embed ao assumir: ${errText(err)}`))
  // A marcação já não é precisa — alguém pegou no pedido.
  if (entry.pingMessageId && interaction.channel?.isTextBased()) await interaction.channel.messages.delete(entry.pingMessageId).catch(() => undefined)
  return updated
}

/** Cargos que este gestor pode dar: abaixo do cargo do bot e (se não for admin) abaixo do cargo mais alto dele. */
function assignableRole(guild: Guild, roleId: string, moderator: GuildMember): { ok: boolean; name: string } {
  const role = guild.roles.cache.get(roleId)
  if (!role) return { ok: false, name: roleId }
  const me = guild.members.me
  const botOk = !role.managed && role.id !== guild.id && (!me || role.position < me.roles.highest.position)
  const modOk = moderator.permissions.has(PermissionFlagsBits.Administrator) || role.position < moderator.roles.highest.position
  return { ok: botOk && modOk, name: role.name }
}

/** Mensagem só para o gestor: escolher os cargos a dar ao membro do ticket (aplicados na hora). */
async function showStaffPanel(interaction: ButtonInteraction, entry: VerificationEntry, moderator: GuildMember, settings: VerificationSettings): Promise<void> {
  const guild = interaction.guild!
  let current = store.findPendingById(entry.id) ?? entry

  const render = (note?: string) => {
    const manual = current.manualRoleIds ?? []
    const auto = settings.addRoleIds.map((id) => `<@&${id}>`)
    const removing = settings.removeRoleIds.map((id) => `<@&${id}>`)
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🛠️ Painel staff')
      .setDescription(
        [
          `Verificação de <@${entry.userId}> — só tu vês esta mensagem.`,
          '',
          '**1.** Escolhe abaixo os cargos a dar ao membro (são dados na hora; tirar da lista remove-os).',
          `**2.** Clica em **${settings.finishLabel || 'Finalizar'}** para fechar e mandar o log.`,
        ].join('\n'),
      )
      .addFields(
        { name: 'Cargos escolhidos', value: manual.length ? manual.map((id) => `<@&${id}>`).join(' ') : '*nenhum ainda*', inline: false },
        { name: 'Ao finalizar, também', value: [auto.length ? `➕ ${auto.join(' ')}` : null, removing.length ? `➖ ${removing.join(' ')}` : null].filter(Boolean).join('\n') || '—', inline: false },
      )
    if (note) embed.setFooter({ text: note.slice(0, 2000) })
    const select = new RoleSelectMenuBuilder()
      .setCustomId(`verif:roles:${entry.id}`)
      .setPlaceholder('Escolhe os cargos do membro…')
      .setMinValues(0)
      .setMaxValues(MAX_MANUAL_ROLES)
    if (manual.length) select.setDefaultRoles(manual.slice(0, MAX_MANUAL_ROLES))
    const finish = new ButtonBuilder().setCustomId(`verif:pfinish:${entry.id}`).setLabel(settings.finishLabel || 'Finalizar').setEmoji('✅').setStyle(ButtonStyle.Success)
    return {
      embeds: [embed],
      components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select), new ActionRowBuilder<ButtonBuilder>().addComponents(finish)],
      allowedMentions: { parse: [] as [] },
    }
  }

  const reply = await interaction.reply({ ...render(), ephemeral: true, withResponse: true })
  const panel = reply.resource?.message
  if (!panel) return

  activePanels.add(panel.id)
  const collector = panel.createMessageComponentCollector({ time: PANEL_TTL_MS })
  collector.on('end', () => activePanels.delete(panel.id))
  collector.on('collect', async (i) => {
    try {
      if (i.isRoleSelectMenu()) {
        const pending = store.findPendingById(entry.id)
        if (!pending) {
          await i.update({ content: 'ℹ️ Esta verificação já foi decidida.', embeds: [], components: [] })
          return
        }
        const target = await guild.members.fetch(entry.userId).catch(() => null)
        if (!target) {
          await i.update(render('❌ O membro já não está no servidor.'))
          return
        }
        const before = new Set(pending.manualRoleIds ?? [])
        const wanted = i.values.filter((id) => assignableRole(guild, id, moderator).ok)
        const refused = i.values.filter((id) => !assignableRole(guild, id, moderator).ok).map((id) => `@${assignableRole(guild, id, moderator).name}`)
        const toAdd = wanted.filter((id) => !before.has(id))
        const toRemove = [...before].filter((id) => !wanted.includes(id))
        const failed: string[] = []
        for (const id of toAdd) await target.roles.add(id, `Verificação — dado por ${moderator.user.tag}`).catch(() => failed.push(`@${guild.roles.cache.get(id)?.name ?? id}`))
        for (const id of toRemove) await target.roles.remove(id, `Verificação — retirado por ${moderator.user.tag}`).catch(() => failed.push(`@${guild.roles.cache.get(id)?.name ?? id}`))
        current = store.updatePending(entry.id, { manualRoleIds: wanted }) ?? pending
        if (toAdd.length || toRemove.length) logEvent(guild.id, 'info', `${moderator.user.tag} atualizou os cargos de ${entry.userTag} (+${toAdd.length} −${toRemove.length}).`)
        const notes = [
          refused.length ? `Não podes dar: ${refused.join(', ')} (acima do teu cargo ou do do bot).` : null,
          failed.length ? `Falhou: ${failed.join(', ')}.` : null,
          !refused.length && !failed.length ? '✅ Cargos atualizados.' : null,
        ].filter(Boolean)
        await i.update(render(notes.join(' ')))
        return
      }
      if (i.isButton() && i.customId === `verif:pfinish:${entry.id}`) {
        await i.deferUpdate()
        const ok = await finishVerification(guild, store.findPendingById(entry.id) ?? current, moderator, true)
        await i.editReply({ content: ok ? '✅ Verificação finalizada — log enviado e o ticket vai ser fechado.' : 'ℹ️ Esta verificação já tinha sido decidida.', embeds: [], components: [] })
        collector.stop()
      }
    } catch (err) {
      logEvent(guild.id, 'error', `Erro no painel staff: ${errText(err)}`)
    }
  })
}

async function finishFromStalePanel(interaction: ButtonInteraction, entryId: string): Promise<void> {
  const guild = interaction.guild
  if (!guild) return
  const entry = store.findPendingById(entryId)
  const settings = store.getVerificationSettings(guild.id)
  const member = await guild.members.fetch(interaction.user.id).catch(() => null)
  if (!entry || !member || !isApprover(member, settings)) {
    await interaction.reply({ content: 'ℹ️ Esta verificação já foi decidida.', ephemeral: true })
    return
  }
  await interaction.deferUpdate()
  const ok = await finishVerification(guild, entry, member, true)
  await interaction.editReply({ content: ok ? '✅ Verificação finalizada — log enviado e o ticket vai ser fechado.' : 'ℹ️ Esta verificação já tinha sido decidida.', embeds: [], components: [] })
}

/**
 * Fecha a verificação: finalizar dá os cargos automáticos (e tira os configurados); cancelar retira os
 * cargos que o gestor tinha dado no painel. Depois: log com a foto, aviso no ticket e o canal é apagado.
 */
async function finishVerification(guild: Guild, entry: VerificationEntry, moderator: GuildMember, finished: boolean, reason?: string): Promise<boolean> {
  if (processing.has(entry.id)) return false
  processing.add(entry.id)
  try {
    const fresh = store.findPendingById(entry.id)
    if (!fresh) return false
    const settings = store.getVerificationSettings(guild.id)
    const roleName = (id: string) => guild.roles.cache.get(id)?.name ?? id
    const added: string[] = []
    const removed: string[] = []
    const target = await guild.members.fetch(fresh.userId).catch(() => null)

    if (target && finished) {
      added.push(...(fresh.manualRoleIds ?? []).filter((id) => target.roles.cache.has(id)).map(roleName))
      for (const id of settings.addRoleIds) {
        if (target.roles.cache.has(id)) continue
        await target.roles
          .add(id, `Verificação finalizada por ${moderator.user.tag}`)
          .then(() => added.push(roleName(id)))
          .catch((err) => logEvent(guild.id, 'error', `Falha a dar @${roleName(id)}: ${errText(err)}`))
      }
      for (const id of settings.removeRoleIds) {
        if (!target.roles.cache.has(id)) continue
        await target.roles
          .remove(id, `Verificação finalizada por ${moderator.user.tag}`)
          .then(() => removed.push(roleName(id)))
          .catch((err) => logEvent(guild.id, 'error', `Falha a tirar @${roleName(id)}: ${errText(err)}`))
      }
    } else if (target && !finished) {
      for (const id of fresh.manualRoleIds ?? []) {
        if (!target.roles.cache.has(id)) continue
        await target.roles
          .remove(id, `Verificação cancelada por ${moderator.user.tag}`)
          .then(() => removed.push(roleName(id)))
          .catch(() => undefined)
      }
    }

    // Guarda as imagens antes de apagar o embed — é a única cópia da foto, e vai para o log.
    const channel = await guild.channels.fetch(fresh.channelId).catch(() => null)
    const embedMessage = channel?.isTextBased() ? await channel.messages.fetch(fresh.embedMessageId).catch(() => null) : null
    const logFiles = settings.logChannelId && embedMessage ? await collectImages(embedMessage).catch(() => []) : []

    const decided = store.decide(fresh.id, finished ? 'approved' : 'rejected', { id: moderator.id, tag: moderator.user.tag }, { added, removed }, reason)
    if (!decided) return false
    await deleteRequestMessages(guild, fresh)
    logEvent(guild.id, 'info', `${fresh.userTag} ${finished ? 'finalizado ✅' : 'cancelado ✖️'} por ${moderator.user.tag}.`)

    const ticket = fresh.ticketId ? store.closeTicket(fresh.ticketId, finished ? 'approved' : 'rejected', moderator.user.tag) : null
    if (settings.logChannelId) {
      await postLog(guild, settings.logChannelId, decided, logFiles, ticket).catch((err) => logEvent(guild.id, 'error', `Falha a mandar o log: ${errText(err)}`))
    }
    if (ticket && channel?.isTextBased()) {
      const text = (settings.closeMessage || store.DEFAULT_CLOSE_MESSAGE)
        .split('{estado}')
        .join(finished ? 'finalizada ✅' : 'cancelada ✖️')
        .split('{membro}')
        .join(`<@${fresh.userId}>`)
        .split('{moderador}')
        .join(`<@${moderator.id}>`)
        .split('{segundos}')
        .join(String(store.CLOSE_DELAY_SECONDS))
      await channel.send({ content: `${text}${reason ? `\n**Motivo:** ${reason}` : ''}`.slice(0, 2000), allowedMentions: { users: [fresh.userId] } }).catch(() => undefined)
      scheduleChannelDelete(guild, ticket.channelId, store.CLOSE_DELAY_SECONDS * 1000, `Verificação ${finished ? 'finalizada' : 'cancelada'} por ${moderator.user.tag}`)
    }
    return true
  } finally {
    processing.delete(entry.id)
  }
}

async function collectImages(message: Message | PartialMessage): Promise<AttachmentBuilder[]> {
  const full = message.partial ? await message.fetch() : message
  return Promise.all([...full.attachments.values()].filter(isImage).map((a) => download(a.url, a.name)))
}

function formatSpan(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h}h ${min % 60}min` : `${Math.floor(h / 24)}d ${h % 24}h`
}

async function postLog(guild: Guild, channelId: string, entry: VerificationEntry, files: AttachmentBuilder[], ticket: VerificationTicket | null): Promise<void> {
  const channel = await guild.channels.fetch(channelId).catch(() => null)
  if (!channel || !channel.isTextBased()) return
  const finished = entry.status === 'approved'
  const opened = ticket ? new Date(ticket.createdAt).getTime() : new Date(entry.createdAt).getTime()
  const embed = buildEmbedFromDraft(getTemplate(guild.id, 'verificationLog'), {
    membro: `<@${entry.userId}>`,
    nome: entry.userTag,
    avatar: entry.userAvatar ?? '',
    id: entry.userId,
    estado: finished ? 'finalizada ✅' : 'cancelada ✖️',
    moderador: entry.moderatorId ? `<@${entry.moderatorId}>` : '—',
    responsavel: entry.claimedById ? `<@${entry.claimedById}>` : '—',
    cargosDados: entry.rolesAdded?.length ? entry.rolesAdded.map((n) => `@${n}`).join(', ') : '—',
    cargosTirados: entry.rolesRemoved?.length ? entry.rolesRemoved.map((n) => `@${n}`).join(', ') : '—',
    motivo: entry.cancelReason || '—',
    ticket: ticket ? String(ticket.number) : '—',
    duracao: formatSpan(Date.now() - opened),
    servidor: guild.name,
  })
  // Com o template de fábrica, cancelamentos ficam a vermelho; um template personalizado manda sempre na cor.
  if (!finished && !isCustomized(guild.id, 'verificationLog')) embed.setColor(0xed4245)
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
