import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Interaction,
  type MessageComponentInteraction,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js'
import type { MovListMember, MovListOp, MovListSettings, MovListState, VerificationButtonStyle } from '../../shared/types'
import { buildMovListCopy, defaultMovListSettings, fillTokens, paginateMovList } from '../../shared/movList'
import * as store from '../store/movList'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { embedToContainer } from './componentsV2'
import { parseButtonEmoji } from './verification'

// Listagem de Mov Call: uma mensagem fixa (caixa V2) com a lista numerada dos membros — menção e ID —
// e os botões Add Membro · Remover membro · Copiar listagem. Tudo (textos, emojis, cores, embed) vem
// das definições da app. Adicionar/remover abre uma janela só para quem clicou, com um seletor de
// membros e a opção de colar IDs.

const ID = {
  add: 'movlist:add',
  remove: 'movlist:remove',
  copy: 'movlist:copy',
  page: 'movlist:page:',
  /** Tudo o que está dentro das janelas efémeras (seletores, "Por ID", páginas do remover). */
  panel: 'movlist:p:',
} as const

const PANEL_TTL_MS = 5 * 60_000
const MODAL_TTL_MS = 5 * 60_000
const SELECT_PAGE = 25
const MAX_IDS_PER_MODAL = 100
const MENTION_LIST_MAX = 20

const BUTTON_STYLES: Record<VerificationButtonStyle, ButtonStyle> = {
  success: ButtonStyle.Success,
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  danger: ButtonStyle.Danger,
}

/** Página mostrada agora na mensagem pública de cada servidor. */
const currentPage = new Map<string, number>()
/** Janelas efémeras com coletor vivo (as outras expiraram — o handler global responde por elas). */
const activePanels = new Set<string>()
/** Atualizações da mensagem pública, uma de cada vez por servidor (para não chegarem fora de ordem). */
const refreshQueue = new Map<string, Promise<unknown>>()

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

// ==========================================================================
// Mensagem pública
// ==========================================================================

function button(customId: string, label: string, emoji: string, style: VerificationButtonStyle, withEmoji: boolean, fallback: string): ButtonBuilder {
  const b = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel((label || fallback).slice(0, 80))
    .setStyle(BUTTON_STYLES[style] ?? ButtonStyle.Secondary)
  const parsed = withEmoji ? parseButtonEmoji(emoji) : null
  if (parsed) b.setEmoji(parsed)
  return b
}

function messagePayload(guild: Guild, settings: MovListSettings, members: MovListMember[], page: number, withEmoji: boolean) {
  const pages = paginateMovList(settings, members, 'discord')
  const p = Math.min(Math.max(0, page), pages.length - 1)
  let embed = buildEmbedFromDraft(
    getTemplate(guild.id, 'movList'),
    {
      listagem: pages[p],
      total: String(members.length),
      pagina: String(p + 1),
      paginas: String(pages.length),
      atualizado: `<t:${Math.floor(Date.now() / 1000)}:f>`,
      servidor: guild.name,
    },
    { separators: 'keep' },
  )
  if (!embedHasContent(embed)) embed = embed.setDescription(pages[p])

  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(ID.add, settings.addLabel, settings.addEmoji, settings.addStyle, withEmoji, 'Add Membro'),
      button(ID.remove, settings.removeLabel, settings.removeEmoji, settings.removeStyle, withEmoji, 'Remover membro'),
      button(ID.copy, settings.copyLabel, settings.copyEmoji, settings.copyStyle, withEmoji, 'Copiar listagem'),
    ),
  ]
  if (pages.length > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`${ID.page}${p - 1}`, settings.prevLabel, settings.prevEmoji, settings.pageStyle, withEmoji, 'Anterior').setDisabled(p === 0),
        new ButtonBuilder()
          .setCustomId(`${ID.page}indicator`)
          .setLabel(`${p + 1}/${pages.length}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        button(`${ID.page}${p + 1}`, settings.nextLabel, settings.nextEmoji, settings.pageStyle, withEmoji, 'Seguinte').setDisabled(p >= pages.length - 1),
      ),
    )
  }
  return {
    page: p,
    payload: {
      flags: MessageFlags.IsComponentsV2 as const,
      components: [embedToContainer(embed, rows)],
      allowedMentions: { parse: [] as [] },
    },
  }
}

/** Publica ou atualiza a mensagem da listagem. Devolve o id da mensagem (ou null se não houver canal). */
export async function postMovList(guild: Guild): Promise<string | null> {
  const settings = store.getMovListSettings(guild.id)
  if (!settings.channelId) return null
  const channel = await guild.channels.fetch(settings.channelId).catch(() => null)
  if (!channel || !channel.isTextBased()) return null
  const members = store.listMovListMembers(guild.id)

  const send = async (withEmoji: boolean) => {
    const { page, payload } = messagePayload(guild, settings, members, currentPage.get(guild.id) ?? 0, withEmoji)
    currentPage.set(guild.id, page)
    const existing = settings.messageId ? await channel.messages.fetch(settings.messageId).catch(() => null) : null
    if (existing && existing.flags.has(MessageFlags.IsComponentsV2)) return (await existing.edit(payload)).id
    if (existing) await existing.delete().catch(() => undefined)
    return (await channel.send(payload)).id
  }

  let messageId: string
  try {
    messageId = await send(true)
  } catch (err) {
    // Um emoji inválido num dos botões não pode deitar a mensagem toda abaixo — publica sem emojis.
    console.warn(`[listagem] Falhou com emojis (${errText(err)}) — a publicar sem emojis.`)
    messageId = await send(false)
  }
  if (messageId !== settings.messageId) store.setMovListMessageId(guild.id, messageId)
  return messageId
}

/** Atualiza a mensagem pública depois de uma mudança — em fila, uma de cada vez por servidor. */
export function refreshMovList(guild: Guild): Promise<unknown> {
  const previous = refreshQueue.get(guild.id) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(() => postMovList(guild))
    .catch((err) => console.error('[listagem] Não consegui atualizar a mensagem:', errText(err)))
  refreshQueue.set(guild.id, next)
  return next
}

// ==========================================================================
// Definições (app / bot remoto)
// ==========================================================================

const MESSAGE_PERMISSIONS = [
  [PermissionFlagsBits.ViewChannel, 'Ver canal'],
  [PermissionFlagsBits.SendMessages, 'Enviar mensagens'],
  [PermissionFlagsBits.EmbedLinks, 'Inserir links'],
  [PermissionFlagsBits.ReadMessageHistory, 'Ler histórico de mensagens'],
] as const

function validStyle(value: unknown, fallback: VerificationButtonStyle): VerificationButtonStyle {
  return value === 'success' || value === 'primary' || value === 'secondary' || value === 'danger' ? value : fallback
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** Valida e grava as definições e publica (ou atualiza) a mensagem da listagem. */
export async function applyMovListSettings(guild: Guild, input: MovListSettings): Promise<MovListSettings> {
  const me = guild.members.me ?? (await guild.members.fetchMe())
  await guild.roles.fetch()
  const previous = store.getMovListSettings(guild.id)
  const d = defaultMovListSettings()
  const txt = (v: unknown, max: number, fallback: string) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || fallback
  const emoji = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

  const next: MovListSettings = {
    ...d,
    ...input,
    messageId: previous.messageId,
    lineFormat: txt(input.lineFormat, 300, d.lineFormat),
    blankLineBetween: input.blankLineBetween !== false,
    emptyText: txt(input.emptyText, 1000, d.emptyText),
    perPage: clampInt(input.perPage, 5, 100, d.perPage),
    addLabel: txt(input.addLabel, 80, d.addLabel),
    addEmoji: emoji(input.addEmoji),
    addStyle: validStyle(input.addStyle, d.addStyle),
    removeLabel: txt(input.removeLabel, 80, d.removeLabel),
    removeEmoji: emoji(input.removeEmoji),
    removeStyle: validStyle(input.removeStyle, d.removeStyle),
    copyLabel: txt(input.copyLabel, 80, d.copyLabel),
    copyEmoji: emoji(input.copyEmoji),
    copyStyle: validStyle(input.copyStyle, d.copyStyle),
    prevLabel: txt(input.prevLabel, 80, d.prevLabel),
    prevEmoji: emoji(input.prevEmoji),
    nextLabel: txt(input.nextLabel, 80, d.nextLabel),
    nextEmoji: emoji(input.nextEmoji),
    pageStyle: validStyle(input.pageStyle, d.pageStyle),
    byIdLabel: txt(input.byIdLabel, 80, d.byIdLabel),
    byIdEmoji: emoji(input.byIdEmoji),
    byIdStyle: validStyle(input.byIdStyle, d.byIdStyle),
    copyForEveryone: Boolean(input.copyForEveryone),
    copyFormat: txt(input.copyFormat, 300, d.copyFormat),
    copyHeader: typeof input.copyHeader === 'string' ? input.copyHeader.trim().slice(0, 300) : d.copyHeader,
    copyAsCodeBlock: input.copyAsCodeBlock !== false,
    addPrompt: txt(input.addPrompt, 1500, d.addPrompt),
    removePrompt: txt(input.removePrompt, 1500, d.removePrompt),
    selectPlaceholder: txt(input.selectPlaceholder, 150, d.selectPlaceholder),
    replyAdded: txt(input.replyAdded, 1500, d.replyAdded),
    replyRemoved: txt(input.replyRemoved, 1500, d.replyRemoved),
    replyAlready: txt(input.replyAlready, 1500, d.replyAlready),
    replyNothing: txt(input.replyNothing, 1500, d.replyNothing),
    replyNoPermission: txt(input.replyNoPermission, 1500, d.replyNoPermission),
    logAdded: txt(input.logAdded, 1500, d.logAdded),
    logRemoved: txt(input.logRemoved, 1500, d.logRemoved),
    managerRoleIds: [...new Set(input.managerRoleIds ?? [])].filter((id) => guild.roles.cache.has(id) && id !== guild.id),
  }

  if (next.channelId) {
    const channel = await guild.channels.fetch(next.channelId).catch(() => null)
    if (!channel || !channel.isTextBased() || channel.isThread()) throw new Error('O canal da listagem tem de ser um canal de texto.')
    const missing = MESSAGE_PERMISSIONS.filter(([flag]) => !channel.permissionsFor(me)?.has(flag)).map(([, l]) => l)
    if (missing.length > 0) throw new Error(`O bot precisa destas permissões em #${channel.name}: ${missing.join(', ')}.`)
    next.channelName = channel.name
  } else {
    next.channelName = null
  }

  if (next.logChannelId) {
    const log = await guild.channels.fetch(next.logChannelId).catch(() => null)
    if (!log || !log.isTextBased() || log.isThread()) throw new Error('O canal de log da listagem tem de ser um canal de texto.')
    if (!log.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      throw new Error(`O bot não consegue enviar mensagens em #${log.name}.`)
    }
    next.logChannelName = log.name
  } else {
    next.logChannelName = null
  }

  // Mudou de canal (ou foi desligada): apaga a mensagem antiga para não ficarem botões órfãos.
  if (previous.messageId && previous.channelId && previous.channelId !== next.channelId) {
    const old = await guild.channels.fetch(previous.channelId).catch(() => null)
    if (old?.isTextBased()) await old.messages.delete(previous.messageId).catch(() => undefined)
    next.messageId = null
  }

  store.saveMovListSettings(guild.id, next)
  if (next.channelId) await postMovList(guild)
  return store.getMovListSettings(guild.id)
}

export function getMovListState(guildId: string): MovListState {
  return { settings: store.getMovListSettings(guildId), members: store.listMovListMembers(guildId) }
}

// ==========================================================================
// Membros: resolver nomes, adicionar, remover
// ==========================================================================

async function resolveMembers(guild: Guild, ids: string[]): Promise<{ found: Omit<MovListMember, 'addedAt'>[]; invalid: string[] }> {
  const found: Omit<MovListMember, 'addedAt'>[] = []
  const invalid: string[] = []
  for (const id of [...new Set(ids)]) {
    const member = await guild.members.fetch(id).catch(() => null)
    const user = member?.user ?? (await guild.client.users.fetch(id).catch(() => null))
    if (!user) {
      invalid.push(id)
      continue
    }
    found.push({ userId: user.id, username: user.username, displayName: member?.displayName ?? user.globalName ?? user.username, addedByTag: null })
  }
  return { found, invalid }
}

function mentionList(members: { userId: string }[]): string {
  const shown = members.slice(0, MENTION_LIST_MAX).map((m) => `<@${m.userId}>`)
  const rest = members.length - shown.length
  return shown.join(', ') + (rest > 0 ? ` e mais ${rest}` : '')
}

async function sendLog(guild: Guild, settings: MovListSettings, template: string, actor: string, members: MovListMember[], total: number): Promise<void> {
  if (!settings.logChannelId || members.length === 0) return
  const channel = await guild.channels.fetch(settings.logChannelId).catch(() => null)
  if (!channel?.isTextBased()) return
  const content = fillTokens(template, { autor: actor, membros: mentionList(members), quantidade: String(members.length), total: String(total) })
  await channel.send({ content: content.slice(0, 2000), allowedMentions: { parse: [] } }).catch(() => undefined)
}

interface ChangeResult {
  added: MovListMember[]
  already: MovListMember[]
  removed: MovListMember[]
  invalid: string[]
  total: number
}

async function addIds(guild: Guild, ids: string[], actorTag: string, actorMention: string): Promise<ChangeResult> {
  const { found, invalid } = await resolveMembers(guild, ids)
  const { added, already, list } = store.addMovListMembers(
    guild.id,
    found.map((m) => ({ ...m, addedByTag: actorTag })),
  )
  const settings = store.getMovListSettings(guild.id)
  if (added.length > 0) {
    void refreshMovList(guild)
    void sendLog(guild, settings, settings.logAdded, actorMention, added, list.length)
  } else if (already.length > 0) {
    void refreshMovList(guild) // os nomes podem ter mudado
  }
  return { added, already, removed: [], invalid, total: list.length }
}

function removeIds(guild: Guild, ids: string[], actorMention: string): ChangeResult {
  const { removed, list } = store.removeMovListMembers(guild.id, ids)
  const settings = store.getMovListSettings(guild.id)
  if (removed.length > 0) {
    void refreshMovList(guild)
    void sendLog(guild, settings, settings.logRemoved, actorMention, removed, list.length)
  }
  return { added: [], already: [], removed, invalid: [], total: list.length }
}

/** Operações feitas pela app (local ou via bot remoto). */
export async function applyMovListOp(guild: Guild, op: MovListOp, actor: string): Promise<MovListState> {
  const actorLabel = `**${actor}** (app)`
  const validIds = (ids: unknown) => (Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && /^\d{17,20}$/.test(id)) : []).slice(0, 500)
  let message: string | undefined
  if (op.kind === 'add') {
    const r = await addIds(guild, validIds(op.userIds), actor, actorLabel)
    message = summary(r)
  } else if (op.kind === 'remove') {
    const r = removeIds(guild, validIds(op.userIds), actorLabel)
    message = summary(r)
  } else if (op.kind === 'move') {
    store.moveMovListMember(guild.id, String(op.userId), Number(op.delta) || 0)
    void refreshMovList(guild)
  } else if (op.kind === 'clear') {
    const before = store.listMovListMembers(guild.id)
    store.clearMovList(guild.id)
    void refreshMovList(guild)
    const settings = store.getMovListSettings(guild.id)
    void sendLog(guild, settings, settings.logRemoved, actorLabel, before, 0)
    message = `Listagem limpa (${before.length} removidos).`
  } else if (op.kind === 'importRole') {
    if (!/^\d{17,20}$/.test(String(op.roleId))) throw new Error('Cargo inválido.')
    const role = await guild.roles.fetch(op.roleId).catch(() => null)
    if (!role) throw new Error('Esse cargo já não existe.')
    // Com a intent Server Members, vem a lista completa; sem ela, só os membros que o bot já viu.
    await guild.members.fetch().catch(() => undefined)
    const ids = [...role.members.values()].filter((m) => !m.user.bot).map((m) => m.id)
    if (ids.length === 0) throw new Error(`Não encontrei membros com @${role.name} (se o cargo tem membros, liga a intent Server Members do bot).`)
    const r = await addIds(guild, ids, actor, actorLabel)
    message = `@${role.name}: ${summary(r)}`
  } else {
    throw new Error('Operação desconhecida.')
  }
  return { ...getMovListState(guild.id), message }
}

function summary(r: ChangeResult): string {
  const parts = [
    r.added.length ? `${r.added.length} adicionado(s)` : null,
    r.removed.length ? `${r.removed.length} removido(s)` : null,
    r.already.length ? `${r.already.length} já estava(m) na lista` : null,
    r.invalid.length ? `${r.invalid.length} ID(s) inválido(s)` : null,
  ].filter(Boolean)
  return parts.length ? `${parts.join(', ')}. Total: ${r.total}.` : 'Nada mudou.'
}

/** Resposta (só para quem clicou) com o resultado de uma alteração, nos textos da app. */
function replyText(settings: MovListSettings, r: ChangeResult, actorMention: string): string {
  const base = { total: String(r.total), autor: actorMention }
  const lines = [
    r.added.length ? fillTokens(settings.replyAdded, { ...base, membros: mentionList(r.added), quantidade: String(r.added.length) }) : null,
    r.removed.length ? fillTokens(settings.replyRemoved, { ...base, membros: mentionList(r.removed), quantidade: String(r.removed.length) }) : null,
    r.already.length ? fillTokens(settings.replyAlready, { ...base, membros: mentionList(r.already), quantidade: String(r.already.length) }) : null,
    r.invalid.length ? `⚠️ IDs que não encontrei: ${r.invalid.slice(0, 20).join(', ')}` : null,
  ].filter(Boolean)
  return (lines.length ? lines.join('\n') : fillTokens(settings.replyNothing, { ...base, membros: '', quantidade: '0' })).slice(0, 1900)
}

// ==========================================================================
// Botões na Discord
// ==========================================================================

function isManager(member: GuildMember, settings: MovListSettings): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) return true
  return settings.managerRoleIds.some((id) => member.roles.cache.has(id))
}

export async function handleMovListInteraction(interaction: Interaction): Promise<boolean> {
  if (!interaction.isMessageComponent() || !interaction.customId.startsWith('movlist:') || !interaction.inGuild() || !interaction.guild) return false
  const guild = interaction.guild
  const id = interaction.customId

  if (id.startsWith(ID.panel)) {
    // Janela com coletor vivo: é o coletor que responde.
    if (activePanels.has(interaction.message.id)) return true
    await interaction.update({ content: '⌛ Esta janela expirou — clica outra vez no botão da listagem.', components: [] }).catch(() => undefined)
    return true
  }

  if (id.startsWith(ID.page) && interaction.isButton()) {
    const page = Number(id.slice(ID.page.length))
    if (!Number.isInteger(page)) return true
    const settings = store.getMovListSettings(guild.id)
    const built = messagePayload(guild, settings, store.listMovListMembers(guild.id), page, true)
    currentPage.set(guild.id, built.page)
    await interaction.update(built.payload).catch(async () => {
      await interaction.update(messagePayload(guild, settings, store.listMovListMembers(guild.id), page, false).payload)
    })
    return true
  }

  if (!interaction.isButton()) return false
  const settings = store.getMovListSettings(guild.id)
  const member = await guild.members.fetch(interaction.user.id).catch(() => null)
  if (!member) return true
  const manager = isManager(member, settings)

  if (id === ID.copy) {
    if (!manager && !settings.copyForEveryone) {
      await interaction.reply({ content: settings.replyNoPermission, flags: MessageFlags.Ephemeral })
      return true
    }
    await replyCopy(interaction, settings)
    return true
  }
  if (id === ID.add || id === ID.remove) {
    if (!manager) {
      await interaction.reply({ content: settings.replyNoPermission, flags: MessageFlags.Ephemeral })
      return true
    }
    if (id === ID.add) await openAddPanel(interaction, settings)
    else await openRemovePanel(interaction, settings)
    return true
  }
  return false
}

async function replyCopy(interaction: ButtonInteraction, settings: MovListSettings): Promise<void> {
  const guild = interaction.guild!
  const members = store.listMovListMembers(guild.id)
  const date = new Date().toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' })
  const text = buildMovListCopy(settings, members, guild.name, date)
  const safe = text.replace(/```/g, 'ˋˋˋ')
  const inline = settings.copyAsCodeBlock ? `\`\`\`\n${safe}\n\`\`\`` : safe
  if (members.length > 0 && inline.length <= 1990) {
    await interaction.reply({ content: inline, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })
    return
  }
  if (members.length === 0) {
    await interaction.reply({ content: settings.emptyText || 'A listagem está vazia.', flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })
    return
  }
  // Grande demais para uma mensagem: vai num ficheiro .txt (abre e copia tudo de uma vez).
  const file = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: 'listagem-movcall.txt' })
  await interaction.reply({
    content: `📋 A listagem tem ${members.length} membros — vai em ficheiro para copiares tudo de uma vez.`,
    files: [file],
    flags: MessageFlags.Ephemeral,
  })
}

// ---- Janela "Add Membro" ----

async function openAddPanel(interaction: ButtonInteraction, settings: MovListSettings): Promise<void> {
  const guild = interaction.guild!
  const actorMention = `<@${interaction.user.id}>`
  const render = (note?: string, withEmoji = true) => ({
    content: [settings.addPrompt, note].filter(Boolean).join('\n\n').slice(0, 2000),
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`${ID.panel}adduser`)
          .setPlaceholder(settings.selectPlaceholder.slice(0, 150) || 'Escolhe os membros…')
          .setMinValues(1)
          .setMaxValues(25),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`${ID.panel}addid`, settings.byIdLabel, settings.byIdEmoji, settings.byIdStyle, withEmoji, 'Por ID'),
      ),
    ],
    allowedMentions: { parse: [] as [] },
  })

  const reply = await interaction
    .reply({ ...render(), flags: MessageFlags.Ephemeral, withResponse: true })
    .catch(() => interaction.reply({ ...render(undefined, false), flags: MessageFlags.Ephemeral, withResponse: true }))
  const panel = reply.resource?.message
  if (!panel) return
  collectPanel(panel.id, panel.createMessageComponentCollector({ time: PANEL_TTL_MS }), async (i) => {
    if (i.isUserSelectMenu() && i.customId === `${ID.panel}adduser`) {
      await i.deferUpdate()
      const ids = i.values.filter((uid) => !i.users.get(uid)?.bot)
      const r = await addIds(guild, ids, i.user.tag, actorMention)
      await i.editReply(render(replyText(store.getMovListSettings(guild.id), r, actorMention)))
      return
    }
    if (i.isButton() && i.customId === `${ID.panel}addid`) {
      const submit = await askIds(i, 'Adicionar por ID', 'IDs ou menções (um por linha, ou separados por espaço)')
      if (!submit) return
      await submit.deferUpdate()
      const ids = parseIds(submit.fields.getTextInputValue('ids'))
      const r = ids.length ? await addIds(guild, ids, i.user.tag, actorMention) : { added: [], already: [], removed: [], invalid: [], total: store.listMovListMembers(guild.id).length }
      await submit.editReply(render(replyText(store.getMovListSettings(guild.id), r, actorMention)))
    }
  })
}

// ---- Janela "Remover membro" ----

async function openRemovePanel(interaction: ButtonInteraction, settings: MovListSettings): Promise<void> {
  const guild = interaction.guild!
  const actorMention = `<@${interaction.user.id}>`
  let page = 0

  const render = (note?: string, withEmoji = true) => {
    const members = store.listMovListMembers(guild.id)
    const pages = Math.max(1, Math.ceil(members.length / SELECT_PAGE))
    page = Math.min(page, pages - 1)
    const slice = members.slice(page * SELECT_PAGE, (page + 1) * SELECT_PAGE)
    const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = []
    if (slice.length > 0) {
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`${ID.panel}rmselect`)
            .setPlaceholder(settings.selectPlaceholder.slice(0, 150) || 'Escolhe os membros…')
            .setMinValues(1)
            .setMaxValues(slice.length)
            .addOptions(
              slice.map((m, i) => ({
                label: `${page * SELECT_PAGE + i + 1}. ${m.displayName || m.username}`.slice(0, 100),
                description: `@${m.username} · ${m.userId}`.slice(0, 100),
                value: m.userId,
              })),
            ),
        ),
      )
    }
    const buttons = [button(`${ID.panel}rmid`, settings.byIdLabel, settings.byIdEmoji, settings.byIdStyle, withEmoji, 'Por ID')]
    if (pages > 1) {
      buttons.unshift(
        button(`${ID.panel}rmprev`, settings.prevLabel, settings.prevEmoji, settings.pageStyle, withEmoji, 'Anterior').setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`${ID.panel}rmind`).setLabel(`${page + 1}/${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        button(`${ID.panel}rmnext`, settings.nextLabel, settings.nextEmoji, settings.pageStyle, withEmoji, 'Seguinte').setDisabled(page >= pages - 1),
      )
    }
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons))
    const empty = members.length === 0 ? settings.emptyText : null
    return {
      content: [settings.removePrompt, empty, note].filter(Boolean).join('\n\n').slice(0, 2000),
      components: rows,
      allowedMentions: { parse: [] as [] },
    }
  }

  const reply = await interaction
    .reply({ ...render(), flags: MessageFlags.Ephemeral, withResponse: true })
    .catch(() => interaction.reply({ ...render(undefined, false), flags: MessageFlags.Ephemeral, withResponse: true }))
  const panel = reply.resource?.message
  if (!panel) return
  collectPanel(panel.id, panel.createMessageComponentCollector({ time: PANEL_TTL_MS }), async (i) => {
    if (i.isStringSelectMenu() && i.customId === `${ID.panel}rmselect`) {
      await i.deferUpdate()
      const r = removeIds(guild, i.values, actorMention)
      await i.editReply(render(replyText(store.getMovListSettings(guild.id), r, actorMention)))
      return
    }
    if (i.isButton() && (i.customId === `${ID.panel}rmprev` || i.customId === `${ID.panel}rmnext`)) {
      page += i.customId.endsWith('prev') ? -1 : 1
      page = Math.max(0, page)
      await i.update(render())
      return
    }
    if (i.isButton() && i.customId === `${ID.panel}rmid`) {
      const submit = await askIds(i, 'Remover por ID', 'IDs ou menções a remover (um por linha, ou separados por espaço)')
      if (!submit) return
      await submit.deferUpdate()
      const r = removeIds(guild, parseIds(submit.fields.getTextInputValue('ids')), actorMention)
      await submit.editReply(render(replyText(store.getMovListSettings(guild.id), r, actorMention)))
    }
  })
}

// ---- Auxiliares das janelas ----

function collectPanel(
  messageId: string,
  collector: { on(event: 'collect', fn: (i: MessageComponentInteraction) => void): unknown; on(event: 'end', fn: () => void): unknown },
  onCollect: (i: MessageComponentInteraction) => Promise<void>,
): void {
  activePanels.add(messageId)
  collector.on('end', () => activePanels.delete(messageId))
  collector.on('collect', (i) => {
    onCollect(i).catch((err) => console.error('[listagem] Erro na janela:', errText(err)))
  })
}

async function askIds(i: ButtonInteraction | MessageComponentInteraction, title: string, label: string): Promise<ModalSubmitInteraction | null> {
  const modalId = `movlist:modal:${i.id}`
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('ids')
          .setLabel(label.slice(0, 45))
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('1526787849175830569\n339473345181646848')
          .setRequired(true)
          .setMaxLength(4000),
      ),
    )
  await i.showModal(modal)
  return i.awaitModalSubmit({ time: MODAL_TTL_MS, filter: (s) => s.customId === modalId && s.user.id === i.user.id }).catch(() => null)
}

/** IDs soltos, menções (<@id> / <@!id>) ou uma mistura — até 100 de cada vez. */
export function parseIds(text: string): string[] {
  return [...new Set(text.match(/\d{17,20}/g) ?? [])].slice(0, MAX_IDS_PER_MODAL)
}
