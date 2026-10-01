import {
  ActionRowBuilder,
  type AutocompleteInteraction,
  type ButtonBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type GuildMember,
  type Interaction,
  MessageFlags,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  ChannelType,
} from 'discord.js'
import type {
  Activity,
  ActivityAction,
  ActivityCategory,
  ActivityInput,
  ActivityPerson,
  CalendarSettings,
  CalendarState,
  CustomButton,
  VerificationButtonStyle,
} from '../../shared/types'
import {
  activityEnd,
  activityPlaceholders,
  addDays,
  categoryOf,
  defaultCalendarSettings,
  fillTokens,
  findConflicts,
  groupedAgenda,
  isFull,
  overlaps,
  safeTimeZone,
  shortDate,
  zonedParts,
  zonedToUtc,
} from '../../shared/calendar'
import * as store from '../store/activities'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { embedToContainer, textLine } from './componentsV2'
import { customButton } from './profileCommand'

// Agenda de atividades: cada atividade é uma mensagem (caixa V2) no canal da agenda, com os botões
// Confirmar presença · Indisponível · Quero organizar · Sair. Um painel fixo mostra os próximos dias
// agrupados por dia, os lembretes saem sozinhos antes do início e os conflitos de horário são
// bloqueados. Criar/editar/cancelar/listar: na app ou com /atividade.

const TICK_MS = 60_000
const BOARD_REFRESH_MS = 60 * 60_000
const MAX_LIST = 40
const BTN = { join: 'act:join:', unav: 'act:unav:', org: 'act:org:', leave: 'act:leave:' } as const

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const boardTimers = new Map<string, ReturnType<typeof setTimeout>>()
const lastBoardRefresh = new Map<string, number>()

// ==========================================================================
// Comando
// ==========================================================================

export function atividadeCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  const addFields = (s: import('discord.js').SlashCommandSubcommandBuilder, required: boolean) =>
    s
      .addStringOption((o) => o.setName('titulo').setDescription('Nome da atividade').setRequired(required).setMaxLength(100))
      .addStringOption((o) => o.setName('data').setDescription('Data: DD/MM, DD/MM/AAAA, hoje ou amanhã').setRequired(required))
      .addStringOption((o) => o.setName('hora').setDescription('Hora de início, HH:MM (ex.: 20:30)').setRequired(required))
      .addIntegerOption((o) => o.setName('duracao').setDescription('Duração em minutos (por omissão 60)').setMinValue(5).setMaxValue(1440))
      .addStringOption((o) => o.setName('categoria').setDescription('Categoria').setAutocomplete(true))
      .addUserOption((o) => o.setName('responsavel').setDescription('Quem é o responsável (por omissão, tu)'))
      .addIntegerOption((o) => o.setName('vagas').setDescription('Vagas para participantes (0 = sem limite)').setMinValue(0).setMaxValue(500))
      .addIntegerOption((o) => o.setName('vagas_organizadores').setDescription('Vagas para organizadores (0 = sem limite)').setMinValue(0).setMaxValue(100))
      .addChannelOption((o) =>
        o.setName('local').setDescription('Canal onde acontece').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildText),
      )
      .addStringOption((o) => o.setName('local_texto').setDescription('Local em texto (ex.: "Mapa X")').setMaxLength(100))
      .addStringOption((o) => o.setName('descricao').setDescription('Descrição').setMaxLength(1000))
  return new SlashCommandBuilder()
    .setName('atividade')
    .setDescription('Agenda de atividades do servidor')
    .addSubcommand((s) => addFields(s.setName('criar').setDescription('Cria uma atividade na agenda'), true))
    .addSubcommand((s) =>
      addFields(
        s
          .setName('editar')
          .setDescription('Edita uma atividade (só os campos que preencheres)')
          .addStringOption((o) => o.setName('id').setDescription('Que atividade').setRequired(true).setAutocomplete(true)),
        false,
      ),
    )
    .addSubcommand((s) =>
      s
        .setName('cancelar')
        .setDescription('Cancela uma atividade')
        .addStringOption((o) => o.setName('id').setDescription('Que atividade').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('motivo').setDescription('Motivo (opcional)').setMaxLength(300)),
    )
    .addSubcommand((s) =>
      s
        .setName('listar')
        .setDescription('Lista as atividades (com filtros)')
        .addStringOption((o) =>
          o
            .setName('periodo')
            .setDescription('Que período (por omissão, os próximos 7 dias)')
            .addChoices({ name: 'Hoje', value: 'hoje' }, { name: 'Próximos 7 dias', value: 'semana' }, { name: 'Próximos 30 dias', value: 'mes' }),
        )
        .addStringOption((o) => o.setName('data').setDescription('Um dia específico: DD/MM'))
        .addStringOption((o) => o.setName('categoria').setDescription('Só desta categoria').setAutocomplete(true))
        .addUserOption((o) => o.setName('responsavel').setDescription('Só deste responsável')),
    )
    .addSubcommand((s) =>
      s
        .setName('ver')
        .setDescription('Mostra uma atividade (só para ti)')
        .addStringOption((o) => o.setName('id').setDescription('Que atividade').setRequired(true).setAutocomplete(true)),
    )
    .toJSON()
}

/** `DD/MM`, `DD/MM/AAAA`, `hoje`, `amanhã` → `YYYY-MM-DD` (no fuso da agenda; sem ano → o próximo). */
export function parseDateInput(raw: string, tz: string, now = new Date()): string {
  const today = zonedParts(now, tz).date
  const v = raw.trim().toLowerCase()
  if (v === 'hoje') return today
  if (v === 'amanha' || v === 'amanhã') return addDays(today, 1)
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/)
  if (!m) throw new Error('Data inválida — usa DD/MM (ex.: 06/10), DD/MM/AAAA, hoje ou amanhã.')
  const day = Number(m[1])
  const month = Number(m[2])
  let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(today.slice(0, 4))
  const pad = (n: number) => String(n).padStart(2, '0')
  let date = `${year}-${pad(month)}-${pad(day)}`
  if (!m[3] && date < today) date = `${++year}-${pad(month)}-${pad(day)}`
  const check = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(check.getTime()) || check.getUTCDate() !== day || check.getUTCMonth() + 1 !== month) throw new Error('Essa data não existe.')
  return date
}

export function parseTimeInput(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})(?:[:hH.](\d{2})?)?$/)
  if (!m || Number(m[1]) > 23 || Number(m[2] ?? 0) > 59) throw new Error('Hora inválida — usa HH:MM (ex.: 20:30).')
  return `${m[1].padStart(2, '0')}:${(m[2] ?? '00').padStart(2, '0')}`
}

function isManager(member: GuildMember | null, settings: CalendarSettings): boolean {
  if (!member) return false
  if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) return true
  return settings.managerRoleIds.some((id) => member.roles.cache.has(id))
}

function matchCategory(settings: CalendarSettings, raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  return settings.categories.find((c) => c.id === raw || c.name.toLowerCase() === v)?.id ?? null
}

export async function handleActivityCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'atividade') return false
  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este comando só funciona dentro de um servidor.', flags: MessageFlags.Ephemeral })
    return true
  }
  const settings = store.getCalendarSettings(guild.id)
  const sub = interaction.options.getSubcommand()
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const member = await guild.members.fetch(interaction.user.id).catch(() => null)
  const reply = (content: string) => interaction.editReply({ content: content.slice(0, 1900), allowedMentions: { parse: [] } })

  try {
    if (sub === 'listar') {
      await interaction.editReply({ content: '', ...listPayload(guild, settings, interaction) })
      return true
    }
    if (sub === 'ver') {
      const a = store.getActivity(guild.id, interaction.options.getString('id', true))
      if (!a) {
        await reply('❌ Não encontrei essa atividade.')
        return true
      }
      await interaction.editReply({ content: '', ...cardPayload(guild, settings, a, false) })
      return true
    }

    const existing = sub === 'criar' ? null : store.getActivity(guild.id, interaction.options.getString('id', true))
    if (sub !== 'criar' && !existing) {
      await reply('❌ Não encontrei essa atividade.')
      return true
    }
    const canManage = isManager(member, settings) || (existing && existing.responsibleId === interaction.user.id)
    if (!canManage) {
      await reply(settings.replyNoPermission)
      return true
    }

    if (sub === 'cancelar') {
      await cancelActivity(guild, existing!, interaction.options.getString('motivo') ?? undefined)
      await reply(`✖️ **${existing!.title}** (#${existing!.number}) foi cancelada.`)
      return true
    }

    const o = interaction.options
    const tz = settings.timezone
    const current = existing ? zonedParts(existing.startAt, tz) : null
    const rawCategory = o.getString('categoria')
    const category = matchCategory(settings, rawCategory)
    if (rawCategory && !category) {
      await reply(`❌ Não há a categoria "${rawCategory}". Categorias: ${settings.categories.map((c) => c.name).join(', ')}.`)
      return true
    }
    const input: ActivityInput = {
      id: existing?.id,
      title: o.getString('titulo') ?? existing?.title ?? '',
      description: o.getString('descricao') ?? existing?.description ?? '',
      categoryId: category ?? existing?.categoryId ?? settings.categories[0]?.id ?? 'geral',
      date: o.getString('data') ? parseDateInput(o.getString('data')!, tz) : current!.date,
      time: o.getString('hora') ? parseTimeInput(o.getString('hora')!) : current!.time,
      durationMinutes: o.getInteger('duracao') ?? existing?.durationMinutes ?? 60,
      locationChannelId: o.getChannel('local')?.id ?? existing?.locationChannelId ?? null,
      locationText: o.getString('local_texto') ?? existing?.locationText ?? '',
      responsibleId: o.getUser('responsavel')?.id ?? existing?.responsibleId ?? interaction.user.id,
      participantSlots: o.getInteger('vagas') ?? existing?.participantSlots ?? 0,
      organizerSlots: o.getInteger('vagas_organizadores') ?? existing?.organizerSlots ?? 0,
    }
    const saved = await saveActivity(guild, input, interaction.user.tag)
    const link = saved.messageId && settings.channelId ? `https://discord.com/channels/${guild.id}/${settings.channelId}/${saved.messageId}` : null
    await reply(`${existing ? '✏️ Atividade atualizada' : '✅ Atividade criada'}: **${saved.title}** (#${saved.number})${link ? ` — ${link}` : ''}`)
  } catch (err) {
    await reply(`❌ ${errText(err)}`)
  }
  return true
}

function listPayload(guild: Guild, settings: CalendarSettings, interaction: ChatInputCommandInteraction) {
  const o = interaction.options
  const tz = settings.timezone
  const today = zonedParts(new Date(), tz).date
  const day = o.getString('data') ? parseDateInput(o.getString('data')!, tz) : null
  const period = o.getString('periodo') ?? 'semana'
  const category = matchCategory(settings, o.getString('categoria'))
  const responsible = o.getUser('responsavel')
  const until = day ?? addDays(today, period === 'hoje' ? 0 : period === 'mes' ? 30 : 7)
  const from = day ?? today
  const list = store
    .listActivities(guild.id)
    .filter((a) => a.status !== 'cancelled' && activityEnd(a) > Date.now() - (day ? 86_400_000 : 0))
    .filter((a) => {
      const d = zonedParts(a.startAt, tz).date
      return d >= from && d <= until
    })
    .filter((a) => !category || a.categoryId === category)
    .filter((a) => !responsible || a.responsibleId === responsible.id)
  const filters = [
    day ? `📅 ${shortDate(day)}` : period === 'hoje' ? '📅 Hoje' : period === 'mes' ? '📅 Próximos 30 dias' : '📅 Próximos 7 dias',
    category ? `🏷️ ${categoryOf(settings, category).name}` : null,
    responsible ? `👑 <@${responsible.id}>` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  let embed = buildEmbedFromDraft(
    getTemplate(guild.id, 'activityList'),
    {
      lista: groupedAgenda(settings, list.slice(0, MAX_LIST), 'discord') + (list.length > MAX_LIST ? `\n-# … e mais ${list.length - MAX_LIST}` : ''),
      total: String(list.length),
      filtros: filters,
      servidor: guild.name,
    },
    { separators: 'keep' },
  )
  if (!embedHasContent(embed)) embed = embed.setDescription(groupedAgenda(settings, list.slice(0, MAX_LIST), 'discord'))
  return { flags: MessageFlags.IsComponentsV2 as const, components: [embedToContainer(embed)], allowedMentions: { parse: [] as [] } }
}

export async function handleActivityAutocomplete(interaction: AutocompleteInteraction): Promise<boolean> {
  if (interaction.commandName !== 'atividade' || !interaction.guild) return false
  const settings = store.getCalendarSettings(interaction.guild.id)
  const focused = interaction.options.getFocused(true)
  const q = String(focused.value).toLowerCase()
  if (focused.name === 'categoria') {
    await interaction.respond(
      settings.categories
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice(0, 25)
        .map((c) => ({ name: `${c.emoji} ${c.name}`.slice(0, 100), value: c.id })),
    )
    return true
  }
  if (focused.name === 'id') {
    const list = store
      .listActivities(interaction.guild.id)
      .filter((a) => a.status === 'scheduled' && activityEnd(a) > Date.now())
      .filter((a) => `#${a.number} ${a.title}`.toLowerCase().includes(q.replace(/^#/, '')) || String(a.number) === q.replace(/^#/, ''))
      .slice(0, 25)
    await interaction.respond(
      list.map((a) => {
        const p = zonedParts(a.startAt, settings.timezone)
        return { name: `#${a.number} · ${a.title} · ${shortDate(p.date)} ${p.time}`.slice(0, 100), value: a.id }
      }),
    )
    return true
  }
  await interaction.respond([])
  return true
}

// ==========================================================================
// Mensagem de cada atividade
// ==========================================================================

function hexToInt(hex: string): number | null {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return Number.isFinite(n) ? n : null
}

function cardPayload(guild: Guild, settings: CalendarSettings, a: Activity, withButtons: boolean, withEmoji = true) {
  const values = activityPlaceholders(settings, a, 'discord', guild.name)
  let embed = buildEmbedFromDraft(getTemplate(guild.id, 'activityCard'), values, { separators: 'keep' })
  if (!embedHasContent(embed)) embed = embed.setDescription(`**${a.title}** — ${values.inicio}`)
  const color = hexToInt(categoryOf(settings, a.categoryId).color)
  if (color !== null) embed.setColor(color)

  const closed = a.status !== 'scheduled' || activityEnd(a) <= Date.now()
  const buttons: ButtonBuilder[] = []
  const add = (id: string, b: CustomButton, fallback: string, disabled: boolean) => {
    if (b.show) buttons.push(customButton(`${id}${a.id}`, b, fallback, withEmoji).setDisabled(disabled))
  }
  add(BTN.join, settings.joinButton, 'Confirmar presença', closed || isFull(a))
  add(BTN.unav, settings.unavailableButton, 'Indisponível', closed)
  add(BTN.org, settings.organizeButton, 'Quero organizar', closed || (a.organizerSlots > 0 && a.organizers.length >= a.organizerSlots))
  add(BTN.leave, settings.leaveButton, 'Sair', closed)
  const rows = withButtons && buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : []
  return { flags: MessageFlags.IsComponentsV2 as const, components: [embedToContainer(embed, rows)], allowedMentions: { parse: [] as [] } }
}

/** Publica ou atualiza a mensagem de uma atividade no canal da agenda. */
export async function postActivityMessage(guild: Guild, activity: Activity): Promise<void> {
  const settings = store.getCalendarSettings(guild.id)
  if (!settings.channelId) return
  const channel = await guild.channels.fetch(settings.channelId).catch(() => null)
  if (!channel?.isTextBased()) return
  const existing = activity.messageId ? await channel.messages.fetch(activity.messageId).catch(() => null) : null
  if (activity.status === 'cancelled' && settings.deleteOnCancel) {
    if (existing) await existing.delete().catch(() => undefined)
    store.updateActivity(guild.id, activity.id, (a) => (a.messageId = null))
    return
  }
  const send = async (withEmoji: boolean) => {
    const payload = cardPayload(guild, settings, activity, true, withEmoji)
    if (existing && existing.flags.has(MessageFlags.IsComponentsV2)) return (await existing.edit(payload)).id
    if (existing) await existing.delete().catch(() => undefined)
    return (await channel.send(payload)).id
  }
  const id = await send(true).catch(() => send(false))
  if (id !== activity.messageId) store.updateActivity(guild.id, activity.id, (a) => (a.messageId = id))
}

// ==========================================================================
// Painel (agenda dos próximos dias)
// ==========================================================================

export async function refreshBoard(guild: Guild): Promise<void> {
  const settings = store.getCalendarSettings(guild.id)
  lastBoardRefresh.set(guild.id, Date.now())
  const channelId = settings.boardChannelId ?? settings.channelId
  if (!settings.boardEnabled || !channelId) return
  const channel = await guild.channels.fetch(channelId).catch(() => null)
  if (!channel?.isTextBased()) return
  const today = zonedParts(new Date(), settings.timezone).date
  const until = addDays(today, Math.max(1, settings.boardDays) - 1)
  const list = store.listActivities(guild.id).filter((a) => {
    if (a.status === 'cancelled' || activityEnd(a) <= Date.now()) return false
    const d = zonedParts(a.startAt, settings.timezone).date
    return d >= today && d <= until
  })
  let embed = buildEmbedFromDraft(
    getTemplate(guild.id, 'activityBoard'),
    {
      agenda: groupedAgenda(settings, list.slice(0, MAX_LIST), 'discord'),
      dias: String(settings.boardDays),
      total: String(list.length),
      atualizado: `<t:${Math.floor(Date.now() / 1000)}:R>`,
      servidor: guild.name,
    },
    { separators: 'keep' },
  )
  if (!embedHasContent(embed)) embed = embed.setDescription(groupedAgenda(settings, list, 'discord'))
  const payload = { flags: MessageFlags.IsComponentsV2 as const, components: [embedToContainer(embed)], allowedMentions: { parse: [] as [] } }
  const existing = settings.boardMessageId ? await channel.messages.fetch(settings.boardMessageId).catch(() => null) : null
  if (existing && existing.flags.has(MessageFlags.IsComponentsV2)) {
    await existing.edit(payload).catch(() => undefined)
    return
  }
  if (existing) await existing.delete().catch(() => undefined)
  const sent = await channel.send(payload).catch(() => null)
  if (sent) store.setBoardMessageId(guild.id, sent.id)
}

/** Atualiza o painel daqui a pouco (junta vários cliques seguidos numa só edição). */
function scheduleBoard(guild: Guild): void {
  clearTimeout(boardTimers.get(guild.id))
  boardTimers.set(
    guild.id,
    setTimeout(() => {
      boardTimers.delete(guild.id)
      void refreshBoard(guild).catch((err) => console.error('[agenda] painel:', errText(err)))
    }, 3_000),
  )
}

// ==========================================================================
// Criar / editar / cancelar (app e comando)
// ==========================================================================

export async function saveActivity(guild: Guild, input: ActivityInput, actorTag: string): Promise<Activity> {
  const settings = store.getCalendarSettings(guild.id)
  const title = (input.title ?? '').trim().slice(0, 100)
  if (!title) throw new Error('Dá um nome à atividade.')
  const startAt = zonedToUtc(input.date, input.time, settings.timezone).toISOString()
  const durationMinutes = Math.round(Number(input.durationMinutes))
  if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 1440) throw new Error('A duração tem de ser entre 5 minutos e 24 horas.')
  const existing = input.id ? store.getActivity(guild.id, input.id) : null
  if (input.id && !existing) throw new Error('Essa atividade já não existe.')
  if (!existing && new Date(startAt).getTime() < Date.now() - 60_000) throw new Error('Essa data/hora já passou.')
  const categoryId = settings.categories.some((c) => c.id === input.categoryId) ? input.categoryId : (settings.categories[0]?.id ?? 'geral')
  const slots = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)))

  let responsibleTag: string | null = null
  if (input.responsibleId) {
    const m = await guild.members.fetch(input.responsibleId).catch(() => null)
    if (!m) throw new Error('O responsável não está no servidor.')
    responsibleTag = m.displayName
  }
  const fields = {
    title,
    description: (input.description ?? '').trim().slice(0, 1000),
    categoryId,
    startAt,
    durationMinutes,
    locationChannelId: input.locationChannelId || null,
    locationText: (input.locationText ?? '').trim().slice(0, 100),
    responsibleId: input.responsibleId || null,
    responsibleTag,
    participantSlots: slots(input.participantSlots, 500),
    organizerSlots: slots(input.organizerSlots, 100),
  }

  if (!input.force) {
    const conflicts = findConflicts({ id: existing?.id ?? '', ...fields }, store.listActivities(guild.id), settings.conflictMode)
    if (conflicts.length > 0) {
      const tz = settings.timezone
      throw new Error(
        `Conflito de horário com: ${conflicts
          .slice(0, 3)
          .map((c) => {
            const p = zonedParts(c.startAt, tz)
            return `#${c.number} ${c.title} (${shortDate(p.date)} ${p.time})`
          })
          .join(', ')}. Muda a hora, o local ou o responsável${' '}— ou grava na mesma pela app.`,
      )
    }
  }

  let saved: Activity
  if (existing) {
    const moved = existing.startAt !== startAt || existing.durationMinutes !== durationMinutes
    saved = store.updateActivity(guild.id, existing.id, (a) => {
      Object.assign(a, fields)
      if (moved) {
        a.remindersSent = []
        if (a.status === 'done' && activityEnd(a) > Date.now()) a.status = 'scheduled'
      }
    })!
  } else {
    saved = store.createActivity(guild.id, {
      ...fields,
      participants: [],
      organizers: [],
      unavailable: [],
      status: 'scheduled',
      messageId: null,
      remindersSent: [],
      createdByTag: actorTag,
    })
  }
  await postActivityMessage(guild, saved).catch((err) => console.error('[agenda] mensagem:', errText(err)))
  scheduleBoard(guild)
  return store.getActivity(guild.id, saved.id) ?? saved
}

export async function cancelActivity(guild: Guild, activity: Activity, reason?: string): Promise<void> {
  const updated = store.updateActivity(guild.id, activity.id, (a) => {
    a.status = 'cancelled'
    a.cancelReason = reason?.slice(0, 300)
  })
  if (updated) await postActivityMessage(guild, updated).catch(() => undefined)
  scheduleBoard(guild)
}

// ==========================================================================
// Botões da atividade
// ==========================================================================

export async function handleActivityButtons(interaction: Interaction): Promise<boolean> {
  if (!interaction.isButton() || !interaction.customId.startsWith('act:') || !interaction.guild) return false
  const [, kind, id] = interaction.customId.split(':')
  await handleActivityButton(interaction, kind, id)
  return true
}

async function handleActivityButton(interaction: ButtonInteraction, kind: string, id: string): Promise<void> {
  const guild = interaction.guild!
  const settings = store.getCalendarSettings(guild.id)
  const activity = store.getActivity(guild.id, id)
  const values = (a: Activity, extra: Record<string, string> = {}) => ({ titulo: a.title, numero: String(a.number), ...extra })
  const ephemeral = (content: string) =>
    interaction.followUp({ content: content.slice(0, 1900), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })

  if (!activity) {
    await interaction.reply({ content: 'ℹ️ Esta atividade já não existe.', flags: MessageFlags.Ephemeral })
    return
  }
  await interaction.deferUpdate()
  if (activity.status !== 'scheduled' || activityEnd(activity) <= Date.now()) {
    await ephemeral(fillTokens(settings.replyClosed, values(activity)))
    return
  }
  const member = await guild.members.fetch(interaction.user.id).catch(() => null)
  const person: ActivityPerson = { userId: interaction.user.id, tag: member?.displayName ?? interaction.user.username, at: new Date().toISOString() }
  const hasRole = (ids: string[]) =>
    ids.length === 0 || Boolean(member && (member.permissions.has(PermissionFlagsBits.Administrator) || ids.some((r) => member.roles.cache.has(r))))
  const without = (list: ActivityPerson[]) => list.filter((p) => p.userId !== person.userId)

  /** Outra atividade à mesma hora em que a pessoa já está. */
  const conflictWith = () =>
    settings.blockPersonConflicts
      ? store
          .listActivities(guild.id)
          .find(
            (o) =>
              o.id !== activity.id &&
              o.status === 'scheduled' &&
              overlaps(o, activity) &&
              [...o.participants, ...o.organizers].some((p) => p.userId === person.userId),
          )
      : undefined

  let message = ''
  if (kind === 'join' || kind === 'org') {
    const asOrganizer = kind === 'org'
    if (!hasRole(asOrganizer ? settings.organizerRoleIds : settings.participantRoleIds)) {
      await ephemeral(fillTokens(settings.replyNoPermission, values(activity)))
      return
    }
    const other = conflictWith()
    if (other) {
      await ephemeral(fillTokens(settings.replyConflict, values(activity, { outra: `${other.title} (#${other.number})` })))
      return
    }
    let full = false
    store.updateActivity(guild.id, activity.id, (a) => {
      const list = asOrganizer ? a.organizers : a.participants
      const slots = asOrganizer ? a.organizerSlots : a.participantSlots
      if (list.some((p) => p.userId === person.userId)) return
      if (slots > 0 && list.length >= slots) {
        full = true
        return
      }
      a.unavailable = without(a.unavailable)
      if (asOrganizer) {
        a.participants = without(a.participants)
        a.organizers.push(person)
      } else {
        a.organizers = without(a.organizers)
        a.participants.push(person)
      }
    })
    message = full ? settings.replyFull : asOrganizer ? settings.replyOrganizing : settings.replyJoined
  } else if (kind === 'unav') {
    store.updateActivity(guild.id, activity.id, (a) => {
      a.participants = without(a.participants)
      a.organizers = without(a.organizers)
      if (!a.unavailable.some((p) => p.userId === person.userId)) a.unavailable.push(person)
    })
    message = settings.replyUnavailable
  } else if (kind === 'leave') {
    store.updateActivity(guild.id, activity.id, (a) => {
      a.participants = without(a.participants)
      a.organizers = without(a.organizers)
      a.unavailable = without(a.unavailable)
    })
    message = settings.replyLeft
  } else {
    return
  }

  const fresh = store.getActivity(guild.id, activity.id)!
  await interaction
    .editReply(cardPayload(guild, settings, fresh, true))
    .catch(() => interaction.editReply(cardPayload(guild, settings, fresh, true, false)).catch(() => undefined))
  await ephemeral(fillTokens(message, values(fresh)))
  scheduleBoard(guild)
}

// ==========================================================================
// Lembretes e fecho
// ==========================================================================

async function sendReminder(guild: Guild, settings: CalendarSettings, a: Activity, minutes: number): Promise<void> {
  const values = activityPlaceholders(settings, a, 'discord', guild.name)
  const link = a.messageId && settings.channelId ? `https://discord.com/channels/${guild.id}/${settings.channelId}/${a.messageId}` : ''
  let embed = buildEmbedFromDraft(
    getTemplate(guild.id, 'activityReminder'),
    { ...values, minutos: String(minutes), link: link || 'https://discord.com' },
    { separators: 'keep' },
  )
  if (!embedHasContent(embed)) embed = embed.setDescription(`⏰ **${a.title}** começa ${values.relativo}`)
  const color = hexToInt(categoryOf(settings, a.categoryId).color)
  if (color !== null) embed.setColor(color)
  const people = [
    ...new Set([a.responsibleId, ...a.organizers.map((p) => p.userId), ...a.participants.map((p) => p.userId)].filter((x): x is string => Boolean(x))),
  ]

  if (settings.reminderTarget !== 'dm') {
    const channel = await guild.channels.fetch(settings.reminderChannelId ?? settings.channelId ?? '').catch(() => null)
    if (channel?.isTextBased()) {
      const mentions = [settings.reminderMentionRoleId ? `<@&${settings.reminderMentionRoleId}>` : '', ...people.map((id) => `<@${id}>`)]
        .filter(Boolean)
        .join(' ')
      await channel
        .send({
          flags: MessageFlags.IsComponentsV2,
          components: mentions ? [textLine(mentions.slice(0, 1900)), embedToContainer(embed)] : [embedToContainer(embed)],
          allowedMentions: { users: people, roles: settings.reminderMentionRoleId ? [settings.reminderMentionRoleId] : [] },
        })
        .catch((err) => console.error('[agenda] lembrete no canal:', errText(err)))
    }
  }
  if (settings.reminderTarget !== 'channel') {
    for (const id of people) {
      const user = await guild.client.users.fetch(id).catch(() => null)
      await user?.send({ flags: MessageFlags.IsComponentsV2, components: [embedToContainer(embed)], allowedMentions: { parse: [] } }).catch(() => undefined)
    }
  }
}

async function tickGuild(guild: Guild): Promise<void> {
  const settings = store.getCalendarSettings(guild.id)
  const now = Date.now()
  let changed = false
  for (const a of store.listActivities(guild.id)) {
    if (a.status !== 'scheduled') continue
    const start = new Date(a.startAt).getTime()
    if (activityEnd(a) <= now) {
      const done = store.updateActivity(guild.id, a.id, (x) => (x.status = 'done'))
      if (done) await postActivityMessage(guild, done).catch(() => undefined)
      changed = true
      continue
    }
    // Lembretes que já chegaram à hora: manda só o mais próximo do início (se o bot esteve desligado,
    // não manda vários de seguida) e marca os outros como enviados.
    const due = settings.reminderMinutes.filter((m) => !a.remindersSent.includes(m) && now >= start - m * 60_000)
    if (due.length === 0) continue
    store.updateActivity(guild.id, a.id, (x) => (x.remindersSent = [...new Set([...x.remindersSent, ...due])]))
    const closest = Math.min(...due)
    if (now <= start + 2 * 60_000) await sendReminder(guild, settings, a, closest).catch((err) => console.error('[agenda] lembrete:', errText(err)))
  }
  if (changed || now - (lastBoardRefresh.get(guild.id) ?? 0) > BOARD_REFRESH_MS) await refreshBoard(guild).catch(() => undefined)
}

export function startActivityLoop(client: Client): () => void {
  let running = false
  const tick = async () => {
    if (running || !client.isReady()) return
    running = true
    try {
      for (const id of store.listCalendarGuilds()) {
        const guild = client.guilds.cache.get(id)
        if (guild) await tickGuild(guild).catch((err) => console.error(`[agenda] ${id}:`, errText(err)))
      }
    } finally {
      running = false
    }
  }
  const interval = setInterval(() => void tick(), TICK_MS)
  void tick()
  return () => clearInterval(interval)
}

// ==========================================================================
// App
// ==========================================================================

export function getCalendarState(guildId: string): CalendarState {
  return { settings: store.getCalendarSettings(guildId), activities: store.listActivities(guildId) }
}

export async function applyCalendarSettings(guild: Guild, input: CalendarSettings): Promise<CalendarState> {
  const d = defaultCalendarSettings()
  const previous = store.getCalendarSettings(guild.id)
  await guild.roles.fetch().catch(() => undefined)
  const style = (v: unknown, fb: VerificationButtonStyle): VerificationButtonStyle =>
    v === 'success' || v === 'primary' || v === 'secondary' || v === 'danger' ? v : fb
  const txt = (v: unknown, max: number, fb: string) => (typeof v === 'string' ? v.slice(0, max).trim() || fb : fb)
  const btn = (b: CustomButton | undefined, fb: CustomButton): CustomButton => ({
    show: b?.show !== false,
    label: txt(b?.label, 80, fb.label),
    emoji: (b?.emoji ?? '').trim(),
    style: style(b?.style, fb.style),
  })
  const roles = (ids: unknown) => [...new Set(Array.isArray(ids) ? ids : [])].filter((id): id is string => typeof id === 'string' && guild.roles.cache.has(id))
  const categories: ActivityCategory[] = (Array.isArray(input.categories) ? input.categories : [])
    .filter((c) => c && typeof c.name === 'string' && c.name.trim())
    .slice(0, 25)
    .map((c, i) => ({
      id: (typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `cat${i}`).slice(0, 40),
      name: c.name.trim().slice(0, 40),
      emoji: (c.emoji ?? '').trim().slice(0, 100),
      color: /^#?[0-9a-f]{6}$/i.test(c.color ?? '') ? `#${c.color.replace('#', '').toUpperCase()}` : '#5865F2',
    }))
  if (categories.length === 0) throw new Error('Cria pelo menos uma categoria.')
  if (new Set(categories.map((c) => c.id)).size !== categories.length) throw new Error('Há categorias repetidas.')

  const next: CalendarSettings = {
    ...d,
    ...input,
    channelName: null,
    boardMessageId: previous.boardMessageId,
    timezone: safeTimeZone(String(input.timezone || d.timezone)),
    categories,
    managerRoleIds: roles(input.managerRoleIds),
    organizerRoleIds: roles(input.organizerRoleIds),
    participantRoleIds: roles(input.participantRoleIds),
    conflictMode: ['off', 'responsible', 'location', 'all'].includes(input.conflictMode) ? input.conflictMode : d.conflictMode,
    blockPersonConflicts: Boolean(input.blockPersonConflicts),
    reminderMinutes: [...new Set((input.reminderMinutes ?? []).map((m) => Math.round(Number(m))).filter((m) => Number.isFinite(m) && m >= 0 && m <= 10_080))]
      .sort((a, b) => b - a)
      .slice(0, 5),
    reminderTarget: input.reminderTarget === 'dm' || input.reminderTarget === 'both' ? input.reminderTarget : 'channel',
    reminderMentionRoleId: input.reminderMentionRoleId && guild.roles.cache.has(input.reminderMentionRoleId) ? input.reminderMentionRoleId : null,
    boardEnabled: Boolean(input.boardEnabled),
    boardDays: Math.min(31, Math.max(1, Math.round(Number(input.boardDays) || 7))),
    boardLineFormat: txt(input.boardLineFormat, 300, d.boardLineFormat),
    boardDayFormat: txt(input.boardDayFormat, 200, d.boardDayFormat),
    boardEmptyText: txt(input.boardEmptyText, 300, d.boardEmptyText),
    personLineFormat: txt(input.personLineFormat, 100, d.personLineFormat),
    emptyPeopleText: txt(input.emptyPeopleText, 200, d.emptyPeopleText),
    statusOpen: txt(input.statusOpen, 100, d.statusOpen),
    statusFull: txt(input.statusFull, 100, d.statusFull),
    statusCancelled: txt(input.statusCancelled, 100, d.statusCancelled),
    statusDone: txt(input.statusDone, 100, d.statusDone),
    statusLive: txt(input.statusLive, 100, d.statusLive),
    deleteOnCancel: Boolean(input.deleteOnCancel),
    joinButton: btn(input.joinButton, d.joinButton),
    unavailableButton: btn(input.unavailableButton, d.unavailableButton),
    organizeButton: btn(input.organizeButton, d.organizeButton),
    leaveButton: btn(input.leaveButton, d.leaveButton),
    replyJoined: txt(input.replyJoined, 500, d.replyJoined),
    replyOrganizing: txt(input.replyOrganizing, 500, d.replyOrganizing),
    replyUnavailable: txt(input.replyUnavailable, 500, d.replyUnavailable),
    replyLeft: txt(input.replyLeft, 500, d.replyLeft),
    replyFull: txt(input.replyFull, 500, d.replyFull),
    replyConflict: txt(input.replyConflict, 500, d.replyConflict),
    replyNoPermission: txt(input.replyNoPermission, 500, d.replyNoPermission),
    replyClosed: txt(input.replyClosed, 500, d.replyClosed),
  }

  const me = guild.members.me ?? (await guild.members.fetchMe())
  const checkChannel = async (id: string | null, what: string) => {
    if (!id) return null
    const ch = await guild.channels.fetch(id).catch(() => null)
    if (!ch || !ch.isTextBased() || ch.isThread()) throw new Error(`O canal ${what} tem de ser um canal de texto.`)
    if (!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      throw new Error(`O bot não consegue enviar mensagens em #${ch.name}.`)
    }
    return ch.name
  }
  next.channelName = await checkChannel(next.channelId, 'da agenda')
  await checkChannel(next.boardChannelId, 'do painel')
  await checkChannel(next.reminderChannelId, 'dos lembretes')

  // O painel mudou de canal (ou foi desligado): apaga o antigo.
  const oldBoardChannel = previous.boardChannelId ?? previous.channelId
  const newBoardChannel = next.boardEnabled ? (next.boardChannelId ?? next.channelId) : null
  if (previous.boardMessageId && oldBoardChannel && oldBoardChannel !== newBoardChannel) {
    const old = await guild.channels.fetch(oldBoardChannel).catch(() => null)
    if (old?.isTextBased()) await old.messages.delete(previous.boardMessageId).catch(() => undefined)
    next.boardMessageId = null
  }

  store.saveCalendarSettings(guild.id, next)
  // Republica as atividades futuras com os botões/textos novos (e no canal novo, se mudou).
  for (const a of store.listActivities(guild.id).filter((x) => x.status === 'scheduled' && activityEnd(x) > Date.now())) {
    if (previous.channelId !== next.channelId) store.updateActivity(guild.id, a.id, (x) => (x.messageId = null))
    await postActivityMessage(guild, store.getActivity(guild.id, a.id)!).catch(() => undefined)
  }
  await refreshBoard(guild).catch(() => undefined)
  return getCalendarState(guild.id)
}

export async function saveActivityFromApp(guild: Guild, input: ActivityInput, actor: string): Promise<CalendarState> {
  const saved = await saveActivity(guild, input, `${actor} (app)`)
  return { ...getCalendarState(guild.id), message: `${input.id ? 'Atividade atualizada' : 'Atividade criada'}: ${saved.title} (#${saved.number})` }
}

export async function applyActivityAction(guild: Guild, action: ActivityAction): Promise<CalendarState> {
  if (action.kind === 'refreshBoard') {
    await refreshBoard(guild)
    return { ...getCalendarState(guild.id), message: 'Painel atualizado.' }
  }
  const a = store.getActivity(guild.id, action.id)
  if (!a) throw new Error('Essa atividade já não existe.')
  if (action.kind === 'cancel') {
    await cancelActivity(guild, a, action.reason)
    return { ...getCalendarState(guild.id), message: `${a.title} cancelada.` }
  }
  if (action.kind === 'delete') {
    const settings = store.getCalendarSettings(guild.id)
    if (a.messageId && settings.channelId) {
      const ch = await guild.channels.fetch(settings.channelId).catch(() => null)
      if (ch?.isTextBased()) await ch.messages.delete(a.messageId).catch(() => undefined)
    }
    store.deleteActivity(guild.id, a.id)
    scheduleBoard(guild)
    return { ...getCalendarState(guild.id), message: `${a.title} apagada.` }
  }
  if (action.kind === 'repost') {
    store.updateActivity(guild.id, a.id, (x) => (x.messageId = null))
    await postActivityMessage(guild, store.getActivity(guild.id, a.id)!)
    return { ...getCalendarState(guild.id), message: `${a.title} publicada outra vez.` }
  }
  if (action.kind === 'removePerson') {
    const updated = store.updateActivity(guild.id, a.id, (x) => {
      x.participants = x.participants.filter((p) => p.userId !== action.userId)
      x.organizers = x.organizers.filter((p) => p.userId !== action.userId)
      x.unavailable = x.unavailable.filter((p) => p.userId !== action.userId)
    })
    if (updated) await postActivityMessage(guild, updated).catch(() => undefined)
    scheduleBoard(guild)
    return getCalendarState(guild.id)
  }
  throw new Error('Ação desconhecida.')
}
