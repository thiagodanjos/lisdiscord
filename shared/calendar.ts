import type { Activity, ActivityCategory, ActivityInput, CalendarSettings } from './types'

// Agenda de atividades — valores de fábrica, fusos horários, conflitos e formatação, partilhados entre
// o bot e a app (a app mostra exatamente o que o bot vai publicar).

export const DEFAULT_CATEGORIES: ActivityCategory[] = [
  { id: 'geral', name: 'Geral', emoji: '📌', color: '#5865F2' },
  { id: 'movcall', name: 'Mov Call', emoji: '🎙️', color: '#F43F7E' },
  { id: 'evento', name: 'Evento', emoji: '🎉', color: '#F0B232' },
  { id: 'treino', name: 'Treino', emoji: '🎯', color: '#22E584' },
  { id: 'reuniao', name: 'Reunião', emoji: '🗂️', color: '#22D3EE' },
]

export function defaultCalendarSettings(): CalendarSettings {
  return {
    channelId: null,
    channelName: null,
    timezone: 'America/Sao_Paulo',
    categories: DEFAULT_CATEGORIES,
    managerRoleIds: [],
    organizerRoleIds: [],
    participantRoleIds: [],
    conflictMode: 'location',
    blockPersonConflicts: true,
    reminderMinutes: [60, 10],
    reminderTarget: 'channel',
    reminderChannelId: null,
    reminderMentionRoleId: null,
    boardEnabled: true,
    boardChannelId: null,
    boardMessageId: null,
    boardDays: 7,
    boardLineFormat: '`{hora}` {emoji} **{titulo}** — {responsavel} · {vagas} · #{numero}',
    boardDayFormat: '**📅 {dia} · {data}**',
    boardEmptyText: '_Sem atividades marcadas._',
    personLineFormat: '{membro}',
    emptyPeopleText: '_ninguém ainda_',
    statusOpen: '🟢 Inscrições abertas',
    statusFull: '🔴 Vagas esgotadas',
    statusCancelled: '✖️ Cancelada',
    statusDone: '✅ Concluída',
    statusLive: '🔴 A decorrer',
    deleteOnCancel: false,
    joinButton: { show: true, label: 'Confirmar presença', emoji: '✅', style: 'success' },
    unavailableButton: { show: true, label: 'Indisponível', emoji: '❌', style: 'danger' },
    organizeButton: { show: true, label: 'Quero organizar', emoji: '🛠️', style: 'primary' },
    leaveButton: { show: true, label: 'Sair', emoji: '↩️', style: 'secondary' },
    replyJoined: '✅ Presença confirmada em **{titulo}** (#{numero}).',
    replyOrganizing: '🛠️ Estás como organizador de **{titulo}** (#{numero}).',
    replyUnavailable: '❌ Marcado como indisponível para **{titulo}**.',
    replyLeft: '↩️ Saíste de **{titulo}**.',
    replyFull: '🔴 Já não há vagas em **{titulo}**.',
    replyConflict: '⚠️ Já estás inscrito em **{outra}** à mesma hora — sai dessa primeiro.',
    replyNoPermission: '🔒 Não tens permissão para isto.',
    replyClosed: 'ℹ️ Esta atividade já não aceita inscrições.',
    coverEnabled: false,
    coverAskMinutes: 60,
    coverOwnerTimeoutMinutes: 20,
    coverCategoryIds: ['movcall'],
    supervisorRoleIds: [],
    coverDmSupervisors: true,
    coverChannelId: null,
    coverMentionRole: true,
    coverAlertAtStart: true,
    ownerConfirmButton: { show: true, label: 'Vou fazer', emoji: '✅', style: 'success' },
    ownerDeclineButton: { show: true, label: 'Não vou conseguir', emoji: '❌', style: 'danger' },
    supervisorTakeButton: { show: true, label: 'Eu assumo', emoji: '🙋', style: 'primary' },
    replyOwnerConfirmed: '✅ Confirmado! Ficas com **{titulo}**.',
    replyOwnerDeclined: '↪️ Ok — já avisámos os supervisores de **{titulo}**.',
    replyTaken: '🙋 Ficaste com **{titulo}** (#{numero}). Obrigado!',
    replyAlreadyTaken: 'ℹ️ **{titulo}** já foi assumida por {supervisor}.',
    replyNotSupervisor: '🔒 Só supervisores podem assumir movs.',
    replyCoverClosed: 'ℹ️ Esta atividade já terminou ou foi cancelada.',
    coverReasonDeclined: 'O dono disse que não vai conseguir.',
    coverReasonNoAnswer: 'O dono não respondeu a tempo.',
    coverReasonNoOwner: 'Esta mov ainda não tem dono.',
    coverReasonManual: 'Pedido pela gestão.',
  }
}

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
export const WEEKDAY_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const

export function fillTokens(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), template)
}

// ---- Fusos horários ----

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
  /** `YYYY-MM-DD` */
  date: string
  /** `HH:MM` */
  time: string
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    fmtCache.set(tz, f)
  }
  return f
}

export function safeTimeZone(tz: string): string {
  try {
    formatter(tz)
    return tz
  } catch {
    return 'America/Sao_Paulo'
  }
}

export function zonedParts(date: Date | string | number, tz: string): ZonedParts {
  const p = formatter(safeTimeZone(tz))
    .formatToParts(new Date(date))
    .reduce<Record<string, string>>((acc, x) => ({ ...acc, [x.type]: x.value }), {})
  const year = Number(p.year)
  const month = Number(p.month)
  const day = Number(p.day)
  const hour = Number(p.hour) % 24
  const minute = Number(p.minute)
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { year, month, day, hour, minute, weekday, date: `${year}-${pad(month)}-${pad(day)}`, time: `${pad(hour)}:${pad(minute)}` }
}

/** `YYYY-MM-DD` + `HH:MM` no fuso `tz` → instante UTC. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  if (![y, m, d, hh, mm].every(Number.isFinite)) throw new Error('Data ou hora inválida.')
  const target = Date.UTC(y, m - 1, d, hh, mm)
  let guess = target
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, tz)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    guess += target - asUtc
  }
  return new Date(guess)
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

export function shortDate(date: string): string {
  const [, m, d] = date.split('-')
  return `${d}/${m}`
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return h && m ? `${h}h ${m}min` : h ? `${h}h` : `${m}min`
}

// ---- Atividades ----

export function activityEnd(a: Pick<Activity, 'startAt' | 'durationMinutes'>): number {
  return new Date(a.startAt).getTime() + Math.max(1, a.durationMinutes) * 60_000
}

export function overlaps(a: Pick<Activity, 'startAt' | 'durationMinutes'>, b: Pick<Activity, 'startAt' | 'durationMinutes'>): boolean {
  return new Date(a.startAt).getTime() < activityEnd(b) && new Date(b.startAt).getTime() < activityEnd(a)
}

/** Atividades que chocam com `candidate` segundo o modo de conflito da agenda. */
export function findConflicts(
  candidate: Pick<Activity, 'id' | 'startAt' | 'durationMinutes' | 'responsibleId' | 'locationChannelId' | 'locationText'>,
  all: Activity[],
  mode: CalendarSettings['conflictMode'],
): Activity[] {
  if (mode === 'off') return []
  return all.filter((o) => {
    if (o.id === candidate.id || o.status === 'cancelled') return false
    if (!overlaps(candidate, o)) return false
    if (mode === 'all') return true
    if (mode === 'responsible') return Boolean(candidate.responsibleId && candidate.responsibleId === o.responsibleId)
    const sameChannel = Boolean(candidate.locationChannelId && candidate.locationChannelId === o.locationChannelId)
    const sameText = Boolean(candidate.locationText.trim() && candidate.locationText.trim().toLowerCase() === o.locationText.trim().toLowerCase())
    const sameResp = Boolean(candidate.responsibleId && candidate.responsibleId === o.responsibleId)
    return sameChannel || sameText || sameResp
  })
}

export function categoryOf(settings: CalendarSettings, id: string): ActivityCategory {
  return settings.categories.find((c) => c.id === id) ?? settings.categories[0] ?? DEFAULT_CATEGORIES[0]
}

export function isFull(a: Activity): boolean {
  return a.participantSlots > 0 && a.participants.length >= a.participantSlots
}

export function slotsText(taken: number, slots: number): string {
  return slots > 0 ? `${taken}/${slots}` : `${taken}`
}

export function statusText(settings: CalendarSettings, a: Activity, now = Date.now()): string {
  if (a.status === 'cancelled') return settings.statusCancelled
  if (a.status === 'done' || activityEnd(a) <= now) return settings.statusDone
  if (new Date(a.startAt).getTime() <= now) return settings.statusLive
  return isFull(a) ? settings.statusFull : settings.statusOpen
}

type Mention = 'discord' | 'preview'

function who(userId: string | null, tag: string | null, mention: Mention): string {
  if (!userId) return '—'
  return mention === 'discord' ? `<@${userId}>` : `@${tag ?? userId}`
}

/** Uma linha do painel/lista para uma atividade. */
export function boardLine(settings: CalendarSettings, a: Activity, mention: Mention): string {
  const cat = categoryOf(settings, a.categoryId)
  const p = zonedParts(a.startAt, settings.timezone)
  return fillTokens(settings.boardLineFormat, {
    hora: p.time,
    data: shortDate(p.date),
    emoji: cat.emoji,
    titulo: a.title,
    categoria: cat.name,
    responsavel: who(a.responsibleId, a.responsibleTag, mention),
    vagas: slotsText(a.participants.length, a.participantSlots),
    numero: String(a.number),
    estado: statusText(settings, a),
  })
}

/** Agenda agrupada por dia (para o painel e o /atividade listar). */
export function groupedAgenda(settings: CalendarSettings, list: Activity[], mention: Mention): string {
  if (list.length === 0) return settings.boardEmptyText
  const byDay = new Map<string, Activity[]>()
  for (const a of [...list].sort((x, y) => x.startAt.localeCompare(y.startAt))) {
    const day = zonedParts(a.startAt, settings.timezone).date
    byDay.set(day, [...(byDay.get(day) ?? []), a])
  }
  return [...byDay.entries()]
    .map(([day, items]) => {
      const wd = new Date(`${day}T12:00:00Z`).getUTCDay()
      const header = fillTokens(settings.boardDayFormat, { dia: WEEKDAY_LONG[wd], data: shortDate(day) })
      return [header, ...items.map((a) => boardLine(settings, a, mention))].join('\n')
    })
    .join('\n\n')
}

function people(settings: CalendarSettings, list: Activity['participants'], mention: Mention): string {
  if (list.length === 0) return settings.emptyPeopleText
  return list.map((p) => fillTokens(settings.personLineFormat, { membro: who(p.userId, p.tag, mention), nome: p.tag })).join('\n')
}

/** Tokens do embed de cada atividade. */
export function activityPlaceholders(settings: CalendarSettings, a: Activity, mention: Mention, serverName: string, now = Date.now()): Record<string, string> {
  const cat = categoryOf(settings, a.categoryId)
  const start = new Date(a.startAt).getTime()
  const p = zonedParts(start, settings.timezone)
  const end = zonedParts(activityEnd(a), settings.timezone)
  const unix = Math.floor(start / 1000)
  const location = [a.locationChannelId ? (mention === 'discord' ? `<#${a.locationChannelId}>` : '#canal') : '', a.locationText].filter(Boolean).join(' · ') || '—'
  return {
    titulo: a.title,
    descricao: a.description,
    numero: String(a.number),
    categoria: cat.name,
    emoji: cat.emoji,
    data: `${WEEKDAY_LONG[p.weekday]}, ${shortDate(p.date)}`,
    hora: p.time,
    fim: end.time,
    inicio: mention === 'discord' ? `<t:${unix}:F>` : `${shortDate(p.date)} às ${p.time}`,
    relativo: mention === 'discord' ? `<t:${unix}:R>` : 'em breve',
    duracao: formatMinutes(a.durationMinutes),
    local: location,
    responsavel: who(a.responsibleId, a.responsibleTag, mention),
    participantes: people(settings, a.participants, mention),
    vagasParticipantes: slotsText(a.participants.length, a.participantSlots),
    organizadores: people(settings, a.organizers, mention),
    vagasOrganizadores: slotsText(a.organizers.length, a.organizerSlots),
    indisponiveis: people(settings, a.unavailable, mention),
    estado: statusText(settings, a, now),
    servidor: serverName,
  }
}

/** Valores iniciais do formulário: de uma atividade existente, ou vazios num dia/hora sugeridos. */
export function inputFromActivity(settings: CalendarSettings, a: Activity | null, date: string, time = '20:00'): ActivityInput {
  if (!a) {
    return {
      title: '',
      description: '',
      categoryId: settings.categories[0]?.id ?? 'geral',
      date,
      time,
      durationMinutes: 60,
      locationChannelId: null,
      locationText: '',
      responsibleId: null,
      participantSlots: 10,
      organizerSlots: 2,
    }
  }
  const p = zonedParts(a.startAt, settings.timezone)
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    categoryId: a.categoryId,
    date: p.date,
    time: p.time,
    durationMinutes: a.durationMinutes,
    locationChannelId: a.locationChannelId,
    locationText: a.locationText,
    responsibleId: a.responsibleId,
    participantSlots: a.participantSlots,
    organizerSlots: a.organizerSlots,
  }
}
