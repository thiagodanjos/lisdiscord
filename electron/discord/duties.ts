import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type Interaction,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from 'discord.js'
import type { Duty, DutiesAction, DutiesSettings, DutiesState, DutyAssignee, DutyPanelButton, DutySubItem, VerificationButtonStyle } from '../../shared/types'
import { defaultDutiesSettings, detailValues, dutiesText, dutyId, fillDuty, minesFor, summaryValues } from '../../shared/duties'
import * as store from '../store/duties'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { embedToContainer, textLine } from './componentsV2'
import { customButton } from './profileCommand'
import { parseButtonEmoji } from './verification'

// Funções da gestão: um painel num canal com quem cuida de cada função (texto simples, como uma
// mensagem normal, ou embed), botões configuráveis ("Quem cuida de quê", "As minhas funções", links,
// mensagens próprias) e um menu para ver cada função em detalhe. Tudo editável na app.

const BTN_PREFIX = 'duty:btn:'
const SELECT_ID = 'duty:sel'
const MAX_DUTIES = 25
const MAX_SUBS = 10
const MAX_ASSIGNEES = 15
const MAX_BUTTONS = 20

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

function updatedStamp(): string {
  return `<t:${Math.floor(Date.now() / 1000)}:R>`
}

function panelRows(s: DutiesSettings, withEmoji: boolean): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []
  if (s.showSelect && s.duties.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(SELECT_ID)
      .setPlaceholder((s.selectPlaceholder || 'Ver uma função').slice(0, 150))
      .addOptions(
        s.duties.slice(0, MAX_DUTIES).map((d) => ({
          label: d.title.slice(0, 100) || 'Função',
          value: d.id,
          description: (d.note || d.description).slice(0, 100) || undefined,
        })),
      )
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu))
  }
  const buttons: ButtonBuilder[] = []
  for (const b of s.buttons.filter((x) => x.show).slice(0, MAX_BUTTONS)) {
    if (b.kind === 'link') {
      if (!/^https?:\/\/\S+$/i.test(b.url.trim())) continue
      const link = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(b.url.trim()).setLabel((b.label || 'Link').slice(0, 80))
      const emoji = withEmoji ? parseButtonEmoji(b.emoji) : null
      if (emoji) link.setEmoji(emoji)
      buttons.push(link)
    } else {
      buttons.push(customButton(`${BTN_PREFIX}${b.id}`, b, 'Ver', withEmoji))
    }
  }
  for (let i = 0; i < buttons.length && rows.length < 5; i += 5) {
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons.slice(i, i + 5)))
  }
  return rows
}

function panelPayload(guild: Guild, s: DutiesSettings, withEmoji: boolean) {
  const values = { funcoes: dutiesText(s, 'discord'), total: String(s.duties.length), atualizado: updatedStamp(), servidor: guild.name }
  const rows = panelRows(s, withEmoji)
  const allowedMentions = s.pingOnPublish ? { parse: ['users', 'roles'] as ('users' | 'roles')[] } : { parse: [] as [] }
  if (s.useEmbed) {
    let embed = buildEmbedFromDraft(getTemplate(guild.id, 'dutiesPanel'), values, { separators: 'keep' })
    if (!embedHasContent(embed)) embed = embed.setDescription(values.funcoes || '—')
    return { flags: MessageFlags.IsComponentsV2 as const, components: [embedToContainer(embed, rows)], allowedMentions }
  }
  // Texto simples: uma mensagem V2 só com texto parece uma mensagem normal, e aceita até 4000 caracteres.
  const text = fillDuty(s.plainTemplate, values).trim().slice(0, 3900) || '—'
  return { flags: MessageFlags.IsComponentsV2 as const, components: [textLine(text), ...rows], allowedMentions }
}

async function withEmojiFallback<T>(run: (withEmoji: boolean) => Promise<T>): Promise<T> {
  try {
    return await run(true)
  } catch (err) {
    if (/emoji/i.test(errText(err))) return run(false)
    throw err
  }
}

async function panelChannel(guild: Guild, channelId: string) {
  const ch = await guild.channels.fetch(channelId).catch(() => null)
  if (!ch || !ch.isTextBased() || ch.isThread()) throw new Error('O canal do painel tem de ser um canal de texto.')
  return ch
}

/** Publica o painel (ou atualiza o que já existe). */
export async function publishDutiesPanel(guild: Guild): Promise<string> {
  const s = store.getDutiesSettings(guild.id)
  if (!s.channelId) throw new Error('Escolhe primeiro o canal do painel.')
  const channel = await panelChannel(guild, s.channelId)
  const existing = s.messageId ? await channel.messages.fetch(s.messageId).catch(() => null) : null
  if (existing && existing.flags.has(MessageFlags.IsComponentsV2)) {
    await withEmojiFallback((e) => existing.edit(panelPayload(guild, s, e)))
    return existing.id
  }
  if (existing) await existing.delete().catch(() => undefined)
  const sent = await withEmojiFallback((e) => channel.send(panelPayload(guild, s, e)))
  store.setDutiesMessage(guild.id, channel.id, sent.id)
  return sent.id
}

// ==========================================================================
// Botões e menu
// ==========================================================================

export async function handleDutiesInteraction(interaction: Interaction): Promise<boolean> {
  if (!interaction.guild) return false
  const isButton = interaction.isButton() && interaction.customId.startsWith(BTN_PREFIX)
  const isSelect = interaction.isStringSelectMenu() && interaction.customId === SELECT_ID
  if (!isButton && !isSelect) return false
  const guild = interaction.guild
  const s = store.getDutiesSettings(guild.id)
  const flags = s.ephemeral ? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 : MessageFlags.IsComponentsV2
  const reply = async (kind: 'dutiesSummary' | 'dutiesMine' | 'dutyDetail', values: Record<string, string>, fallback: string) => {
    let embed = buildEmbedFromDraft(getTemplate(guild.id, kind), values, { separators: 'keep' })
    if (!embedHasContent(embed)) embed = embed.setDescription(fallback)
    await interaction.reply({ flags, components: [embedToContainer(embed)], allowedMentions: { parse: [] } })
  }

  if (isSelect) {
    const d = s.duties.find((x) => x.id === interaction.values[0])
    if (!d) {
      await interaction.reply({ content: 'ℹ️ Essa função já não existe — o painel vai ser atualizado.', flags: MessageFlags.Ephemeral })
      return true
    }
    const values = detailValues(d, s, 'discord', guild.name)
    await reply('dutyDetail', values, `**${d.title}**\n${values.responsaveis}`)
    return true
  }

  if (!interaction.isButton()) return true
  const b = s.buttons.find((x) => `${BTN_PREFIX}${x.id}` === interaction.customId)
  if (!b) {
    await interaction.reply({ content: 'ℹ️ Este botão já não existe — o painel vai ser atualizado.', flags: MessageFlags.Ephemeral })
    return true
  }
  if (b.kind === 'summary') {
    const values = summaryValues(s, 'discord', guild.name)
    await reply('dutiesSummary', values, values.resumo)
  } else if (b.kind === 'mine') {
    const member = await guild.members.fetch(interaction.user.id).catch(() => null)
    const lines = minesFor(s, interaction.user.id, member ? [...member.roles.cache.keys()] : [])
    if (lines.length === 0) {
      await interaction.reply({ content: s.replyNoDuties.slice(0, 2000), flags: s.ephemeral ? MessageFlags.Ephemeral : undefined, allowedMentions: { parse: [] } })
      return true
    }
    await reply('dutiesMine', { membro: `<@${interaction.user.id}>`, funcoes: lines.join('\n'), total: String(lines.length), servidor: guild.name }, lines.join('\n'))
  } else if (b.kind === 'message') {
    await interaction.reply({ content: (b.text || '—').slice(0, 2000), flags: s.ephemeral ? MessageFlags.Ephemeral : undefined, allowedMentions: { parse: [] } })
  }
  return true
}

// ==========================================================================
// App
// ==========================================================================

export function getDutiesState(guildId: string): DutiesState {
  return { settings: store.getDutiesSettings(guildId) }
}

export async function applyDutiesSettings(guild: Guild, input: DutiesSettings): Promise<DutiesState> {
  const d = defaultDutiesSettings()
  const previous = store.getDutiesSettings(guild.id)
  await guild.roles.fetch().catch(() => undefined)
  const txt = (v: unknown, max: number, fb: string) => (typeof v === 'string' ? v.slice(0, max) : fb)
  const style = (v: unknown, fb: VerificationButtonStyle): VerificationButtonStyle =>
    v === 'success' || v === 'primary' || v === 'secondary' || v === 'danger' ? v : fb
  const assignees = (list: unknown): DutyAssignee[] => {
    const seen = new Set<string>()
    return (Array.isArray(list) ? list : [])
      .filter((a): a is DutyAssignee => a && (a.kind === 'user' || a.kind === 'role') && typeof a.id === 'string' && /^\d{15,21}$/.test(a.id))
      .filter((a) => (a.kind === 'role' ? guild.roles.cache.has(a.id) : true))
      .filter((a) => !seen.has(`${a.kind}:${a.id}`) && Boolean(seen.add(`${a.kind}:${a.id}`)))
      .slice(0, MAX_ASSIGNEES)
      .map((a) => ({ kind: a.kind, id: a.id, name: (a.kind === 'role' ? guild.roles.cache.get(a.id)?.name : a.name)?.slice(0, 100) || a.id }))
  }
  const ids = new Set<string>()
  const uniqueId = (raw: unknown, prefix: string) => {
    let id = typeof raw === 'string' && /^[\w-]{1,40}$/.test(raw) ? raw : dutyId(prefix)
    while (ids.has(id)) id = dutyId(prefix)
    ids.add(id)
    return id
  }
  const duties: Duty[] = (Array.isArray(input.duties) ? input.duties : [])
    .filter((x) => x && typeof x.title === 'string' && x.title.trim())
    .slice(0, MAX_DUTIES)
    .map((x) => ({
      id: uniqueId(x.id, 'd'),
      title: x.title.trim().slice(0, 200),
      note: txt(x.note, 200, '').trim(),
      description: txt(x.description, 1500, '').trim(),
      assignees: assignees(x.assignees),
      subItems: (Array.isArray(x.subItems) ? x.subItems : [])
        .filter((sub): sub is DutySubItem => sub && typeof sub.label === 'string' && Boolean(sub.label.trim()))
        .slice(0, MAX_SUBS)
        .map((sub) => ({ id: uniqueId(sub.id, 's'), label: sub.label.trim().slice(0, 100), assignees: assignees(sub.assignees) })),
    }))
  const buttons: DutyPanelButton[] = (Array.isArray(input.buttons) ? input.buttons : [])
    .filter((b) => b && ['summary', 'mine', 'link', 'message'].includes(b.kind))
    .slice(0, MAX_BUTTONS)
    .map((b) => ({
      id: uniqueId(b.id, 'b'),
      kind: b.kind,
      show: b.show !== false,
      label: txt(b.label, 80, 'Botão').trim() || 'Botão',
      emoji: txt(b.emoji, 100, '').trim(),
      style: style(b.style, 'secondary'),
      url: txt(b.url, 500, '').trim(),
      text: txt(b.text, 2000, '').trim(),
    }))
  for (const b of buttons) if (b.kind === 'link' && b.show && !/^https?:\/\/\S+$/i.test(b.url)) throw new Error(`O botão "${b.label}" precisa de um link que comece por https://`)

  const next: DutiesSettings = {
    ...d,
    channelId: typeof input.channelId === 'string' && input.channelId ? input.channelId : null,
    channelName: null,
    messageId: previous.messageId,
    useEmbed: Boolean(input.useEmbed),
    plainTemplate: txt(input.plainTemplate, 3500, d.plainTemplate),
    lineFormat: txt(input.lineFormat, 300, d.lineFormat).trim() || d.lineFormat,
    groupLineFormat: txt(input.groupLineFormat, 300, d.groupLineFormat).trim() || d.groupLineFormat,
    subLineFormat: txt(input.subLineFormat, 300, d.subLineFormat).trim() || d.subLineFormat,
    arrow: txt(input.arrow, 100, d.arrow).trim(),
    separator: txt(input.separator, 20, d.separator) || ' ',
    emptyAssignee: txt(input.emptyAssignee, 200, d.emptyAssignee).trim() || '—',
    spacing: input.spacing !== false,
    pingOnPublish: Boolean(input.pingOnPublish),
    duties,
    buttons,
    showSelect: input.showSelect !== false,
    selectPlaceholder: txt(input.selectPlaceholder, 150, d.selectPlaceholder).trim() || d.selectPlaceholder,
    summaryLineFormat: txt(input.summaryLineFormat, 300, d.summaryLineFormat).trim() || d.summaryLineFormat,
    mineLineFormat: txt(input.mineLineFormat, 300, d.mineLineFormat).trim() || d.mineLineFormat,
    replyNoDuties: txt(input.replyNoDuties, 500, d.replyNoDuties).trim() || d.replyNoDuties,
    ephemeral: input.ephemeral !== false,
  }

  if (next.channelId) {
    const ch = await panelChannel(guild, next.channelId)
    const me = guild.members.me ?? (await guild.members.fetchMe())
    if (!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) throw new Error(`O bot não consegue enviar mensagens em #${ch.name}.`)
    next.channelName = ch.name
  }
  // Mudou de canal: o painel antigo sai.
  if (previous.messageId && previous.channelId && previous.channelId !== next.channelId) {
    const old = await guild.channels.fetch(previous.channelId).catch(() => null)
    if (old?.isTextBased()) await old.messages.delete(previous.messageId).catch(() => undefined)
    next.messageId = null
  }
  store.saveDutiesSettings(guild.id, next)
  // O painel que já está publicado atualiza-se sozinho.
  if (next.messageId && next.channelId) {
    await publishDutiesPanel(guild).catch((err) => console.error('[funções] atualizar painel:', errText(err)))
    return { ...getDutiesState(guild.id), message: 'Guardado — o painel no Discord foi atualizado.' }
  }
  return getDutiesState(guild.id)
}

export async function applyDutiesAction(guild: Guild, action: DutiesAction): Promise<DutiesState> {
  if (action.kind === 'publish') {
    const had = Boolean(store.getDutiesSettings(guild.id).messageId)
    await publishDutiesPanel(guild)
    return { ...getDutiesState(guild.id), message: had ? 'Painel atualizado no Discord.' : 'Painel publicado no Discord.' }
  }
  if (action.kind === 'remove') {
    const s = store.getDutiesSettings(guild.id)
    if (s.messageId && s.channelId) {
      const ch = await guild.channels.fetch(s.channelId).catch(() => null)
      if (ch?.isTextBased()) await ch.messages.delete(s.messageId).catch(() => undefined)
    }
    store.setDutiesMessage(guild.id, s.channelId, null)
    return { ...getDutiesState(guild.id), message: 'Painel apagado do Discord (as funções continuam guardadas).' }
  }
  throw new Error('Ação desconhecida.')
}
