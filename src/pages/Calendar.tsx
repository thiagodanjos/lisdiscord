import { useEffect, useMemo, useState } from 'react'
import { BellRing, CalendarDays, ChevronLeft, ChevronRight, Clock3, Copy, List, MapPin, Pencil, Plus, Radio, RefreshCw, RotateCcw, Save, Search, Siren, Trash2, Users, XCircle } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, PageHeader, Tabs } from '../components/ui'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import { ActivityEditor } from '../components/ActivityEditor'
import { CalendarSettingsPanel } from '../components/CalendarSettingsPanel'
import {
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  activityEnd,
  activityPlaceholders,
  addDays,
  categoryOf,
  defaultCalendarSettings,
  formatMinutes,
  groupedAgenda,
  inputFromActivity,
  shortDate,
  slotsText,
  statusText,
  zonedParts,
} from '../../shared/calendar'
import {
  ACTIVITY_BOARD_PLACEHOLDERS,
  ACTIVITY_CARD_PLACEHOLDERS,
  ACTIVITY_LIST_PLACEHOLDERS,
  ACTIVITY_REMINDER_PLACEHOLDERS,
  ACTIVITY_COVER_PLACEHOLDERS,
  type Activity,
  type ActivityCover,
  type ActivityAction,
  type ActivityInput,
  type BotEmoji,
  type CalendarSettings,
  type CalendarState,
  type ChannelPickerEntry,
  type EmbedTemplateKind,
  type GuildSummary,
  type RemoteBotConfig,
  type RolePickerEntry,
} from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }

const COVER_STATE: Record<ActivityCover['state'], { label: string; tone: 'default' | 'success' | 'warning' | 'danger' | 'cyan' }> = {
  asked: { label: '📨 À espera do dono', tone: 'cyan' },
  confirmed: { label: '✅ Dono confirmou', tone: 'success' },
  searching: { label: '🚨 À procura de supervisor', tone: 'warning' },
  covered: { label: '🙋 Assumida por supervisor', tone: 'success' },
  uncovered: { label: '⚠️ Começou sem supervisor', tone: 'danger' },
}
const POLL_MS = 20_000
const inputClass = 'rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

type Tab = 'calendar' | 'settings'
type View = 'week' | 'list'
type StatusFilter = 'upcoming' | 'all' | 'cancelled' | 'done'

/** Segunda-feira da semana de `date` (YYYY-MM-DD). */
function mondayOf(date: string): string {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay()
  return addDays(date, wd === 0 ? -6 : 1 - wd)
}

/** Intervalos livres de um dia, dentro do horário útil (em minutos desde 00:00). */
function freeSlots(dayActs: Activity[], tz: string, from: number, to: number): [number, number][] {
  const busy = dayActs
    .filter((a) => a.status !== 'cancelled')
    .map((a) => {
      const s = zonedParts(a.startAt, tz)
      const start = s.hour * 60 + s.minute
      return [start, Math.min(24 * 60, start + a.durationMinutes)] as [number, number]
    })
    .sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  let cursor = from
  for (const [s, e] of busy) {
    if (s - cursor >= 60) out.push([cursor, Math.min(s, to)])
    cursor = Math.max(cursor, e)
    if (cursor >= to) break
  }
  if (to - cursor >= 60) out.push([cursor, to])
  return out.filter(([s, e]) => e - s >= 60)
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function SlotBar({ taken, slots, color }: { taken: number; slots: number; color: string }) {
  if (slots <= 0) return <span className="text-[10px] text-faint">{taken} · sem limite</span>
  const pct = Math.min(100, (taken / slots) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#ED4245' : color }} />
      </div>
      <span className="font-mono text-[10px] text-muted">{slotsText(taken, slots)}</span>
    </div>
  )
}

export default function Calendar() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [roles, setRoles] = useState<RolePickerEntry[]>([])
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [state, setState] = useState<CalendarState | null>(null)
  const [draft, setDraft] = useState<CalendarSettings>(defaultCalendarSettings())
  const [tab, setTab] = useState<Tab>('calendar')
  const [view, setView] = useState<View>('week')
  const [weekStart, setWeekStart] = useState('')
  const [category, setCategory] = useState('')
  const [responsible, setResponsible] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('upcoming')
  const [query, setQuery] = useState('')
  const [dayFrom, setDayFrom] = useState(8)
  const [dayTo, setDayTo] = useState(24)
  const [editing, setEditing] = useState<{ input: ActivityInput; tag: string | null } | null>(null)
  const [detail, setDetail] = useState<Activity | null>(null)
  const [confirm, setConfirm] = useState<{ action: ActivityAction; title: string; text: string } | null>(null)
  const [template, setTemplate] = useState<EmbedTemplateKind | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const isRemote = Boolean(remoteConfig.url && remoteConfig.hasApiKey)
  const guildName = guilds.find((g) => g.id === guildId)?.name ?? 'este servidor'
  const settings = state?.settings ?? draft
  const tz = settings.timezone
  const today = zonedParts(new Date(), tz).date

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemoteConfig)
  }, [])

  useEffect(() => {
    const listGuilds = isRemote ? bridge.listRemoteGuilds : bridge.listGuilds
    listGuilds()
      .then((g) => {
        setGuilds(g)
        setGuildId(g[0]?.id ?? '')
      })
      .catch((err) => setError(cleanIpcError(err)))
    const listEmojis = isRemote ? bridge.listRemoteEmojis : bridge.listEmojis
    listEmojis().then(setEmojis).catch(() => setEmojis([]))
  }, [isRemote])

  function load(resetDraft: boolean) {
    if (!guildId) return
    const get = isRemote ? bridge.getRemoteCalendar : bridge.getCalendar
    get(guildId)
      .then((s) => {
        setState(s)
        if (resetDraft) setDraft(s.settings)
        if (resetDraft || !weekStart) setWeekStart(mondayOf(zonedParts(new Date(), s.settings.timezone).date))
      })
      .catch((err) => setError(cleanIpcError(err)))
  }

  useEffect(() => {
    if (!guildId) return
    setError('')
    const listChannels = isRemote ? bridge.listRemoteChannels : bridge.listChannels
    const listRoles = isRemote ? bridge.listRemoteRoles : bridge.listRoles
    listChannels(guildId).then(setChannels).catch(() => setChannels([]))
    listRoles(guildId).then(setRoles).catch(() => setRoles([]))
    load(true)
    const id = setInterval(() => load(false), POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  function applyState(s: CalendarState) {
    setState(s)
    if (s.message) setNote(s.message)
    if (detail) setDetail(s.activities.find((a) => a.id === detail.id) ?? null)
  }

  async function act(action: ActivityAction) {
    setError('')
    setNote('')
    try {
      const fn = isRemote ? bridge.remoteActivityAction : bridge.activityAction
      applyState(await fn(guildId, action))
    } catch (err) {
      setError(cleanIpcError(err))
    }
  }

  async function saveSettings() {
    setSaving(true)
    setError('')
    setNote('')
    try {
      const fn = isRemote ? bridge.setRemoteCalendarSettings : bridge.setCalendarSettings
      const s = await fn(guildId, draft)
      setState(s)
      setDraft(s.settings)
      setNote('Definições guardadas — atividades e painel atualizados.')
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setSaving(false)
    }
  }

  const activities = useMemo(() => state?.activities ?? [], [state])
  const responsibles = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of activities) if (a.responsibleId) map.set(a.responsibleId, a.responsibleTag ?? a.responsibleId)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [activities])

  const filtered = useMemo(() => {
    const now = Date.now()
    const q = query.trim().toLowerCase()
    return activities.filter((a) => {
      if (category && a.categoryId !== category) return false
      if (responsible && a.responsibleId !== responsible) return false
      if (q && !`${a.title} ${a.description} #${a.number}`.toLowerCase().includes(q)) return false
      const ended = a.status === 'done' || activityEnd(a) <= now
      if (statusFilter === 'upcoming') return a.status === 'scheduled' && !ended
      if (statusFilter === 'cancelled') return a.status === 'cancelled'
      if (statusFilter === 'done') return a.status !== 'cancelled' && ended
      return true
    })
  }, [activities, category, responsible, query, statusFilter])

  const weekDays = weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : []
  const byDay = useMemo(() => {
    const map = new Map<string, Activity[]>()
    for (const a of filtered) {
      const d = zonedParts(a.startAt, tz).date
      map.set(d, [...(map.get(d) ?? []), a])
    }
    return map
  }, [filtered, tz])
  const weekActsAll = (day: string) => activities.filter((a) => zonedParts(a.startAt, tz).date === day)

  const upcoming = activities.filter((a) => a.status === 'scheduled' && activityEnd(a) > Date.now())
  const openSlots = upcoming.reduce((n, a) => n + (a.participantSlots > 0 ? Math.max(0, a.participantSlots - a.participants.length) : 0), 0)
  const openOrgSlots = upcoming.reduce((n, a) => n + (a.organizerSlots > 0 ? Math.max(0, a.organizerSlots - a.organizers.length) : 0), 0)

  const openNew = (date: string, time?: string) => setEditing({ input: inputFromActivity(settings, null, date < today ? today : date, time), tag: null })
  const openEdit = (a: Activity) => setEditing({ input: inputFromActivity(settings, a, today), tag: a.responsibleTag })

  // Pré-visualizações dos embeds com uma atividade de exemplo.
  const sample: Activity = upcoming[0] ?? {
    id: 'x',
    guildId,
    number: 12,
    title: 'Mov Call da noite',
    description: 'Traz o microfone!',
    categoryId: settings.categories[0]?.id ?? 'geral',
    startAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    durationMinutes: 60,
    locationChannelId: null,
    locationText: 'Call principal',
    responsibleId: '1',
    responsibleTag: 'ana.dev',
    participantSlots: 10,
    organizerSlots: 2,
    participants: [{ userId: '2', tag: 'ricardo_c', at: '' }],
    organizers: [{ userId: '1', tag: 'ana.dev', at: '' }],
    unavailable: [],
    status: 'scheduled',
    messageId: null,
    remindersSent: [],
    createdByTag: 'demo',
    createdAt: '',
    updatedAt: '',
  }
  const templateInfo: Record<string, { title: string; hint: string; tokens: readonly string[]; values: Record<string, string> }> = {
    activityCard: {
      title: 'Embed de cada atividade',
      hint: 'Mensagem de cada atividade no canal da agenda, com os botões lá dentro. A cor da barra é a da categoria. {barra} faz uma divisória.',
      tokens: ACTIVITY_CARD_PLACEHOLDERS,
      values: activityPlaceholders(draft, sample, 'preview', guildName),
    },
    activityBoard: {
      title: 'Embed do painel da agenda',
      hint: '{agenda} = as atividades dos próximos dias, agrupadas por dia (cabeçalho e linha configuráveis em Definições).',
      tokens: ACTIVITY_BOARD_PLACEHOLDERS,
      values: { agenda: groupedAgenda(draft, upcoming.slice(0, 12), 'preview'), dias: String(draft.boardDays), total: String(upcoming.length), atualizado: 'agora', servidor: guildName },
    },
    activityReminder: {
      title: 'Embed do lembrete',
      hint: 'Enviado antes de cada atividade. {minutos} = quantos minutos faltam; {link} = link para a mensagem da atividade.',
      tokens: ACTIVITY_REMINDER_PLACEHOLDERS,
      values: { ...activityPlaceholders(draft, sample, 'preview', guildName), minutos: '10', link: 'https://discord.com' },
    },
    ...Object.fromEntries(
      (
        [
          ['activityOwnerAsk', 'DM ao dono — "vais conseguir?"', 'Vai com os botões Vou fazer / Não vou conseguir.'],
          ['activityOwnerConfirmed', 'DM ao dono — confirmou', 'A DM do dono muda para isto quando confirma.'],
          ['activityOwnerDeclined', 'DM ao dono — não pode', 'A DM do dono muda para isto quando diz que não consegue.'],
          ['activityCoverCall', 'Chamada aos supervisores', 'DM a cada supervisor (e a mensagem geral), com o botão Eu assumo. {motivo} = porque se está à procura.'],
          ['activityCoverTaken', 'Assumida', 'Todas as mensagens da chamada mudam para isto quando alguém assume (e o dono também recebe).'],
          ['activityCoverUncovered', 'Começou sem supervisor', 'Se a mov começar sem ninguém — o botão Eu assumo continua até ao fim.'],
        ] as const
      ).map(([kind, title, hint]) => [
        kind,
        {
          title,
          hint,
          tokens: ACTIVITY_COVER_PLACEHOLDERS,
          values: {
            ...activityPlaceholders(draft, sample, 'preview', guildName),
            dono: '@ana.dev',
            supervisor: '@ricardo_c',
            supervisores: '@Supervisor',
            motivo: draft.coverReasonDeclined,
            link: 'https://discord.com',
          },
        },
      ]),
    ),
    activityList: {
      title: 'Embed do /atividade listar',
      hint: '{lista} = as atividades com os filtros escolhidos no comando; {filtros} = o resumo dos filtros.',
      tokens: ACTIVITY_LIST_PLACEHOLDERS,
      values: { lista: groupedAgenda(draft, upcoming.slice(0, 12), 'preview'), total: String(upcoming.length), filtros: '📅 Próximos 7 dias', servidor: guildName },
    },
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(state?.settings ?? draft)

  const card = (a: Activity) => {
    const cat = categoryOf(settings, a.categoryId)
    const p = zonedParts(a.startAt, tz)
    const end = zonedParts(activityEnd(a), tz)
    const cancelled = a.status === 'cancelled'
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => setDetail(a)}
        className={`flex w-full flex-col gap-1 rounded-lg border border-border bg-black/30 p-2 text-left transition-colors hover:bg-white/5 ${cancelled ? 'opacity-50' : ''}`}
        style={{ borderLeft: `3px solid ${cat.color}` }}
      >
        <span className="font-mono text-[10px] text-muted">
          {p.time}–{end.time}
        </span>
        <span className={`text-xs leading-tight font-bold text-text ${cancelled ? 'line-through' : ''}`}>
          {cat.emoji} {a.title}
        </span>
        <span className="truncate text-[10px] text-faint">👑 {a.responsibleTag ?? '—'}</span>
        {a.cover && a.status === 'scheduled' && <span className="truncate text-[10px] font-semibold text-warning">{COVER_STATE[a.cover.state].label}</span>}
        <SlotBar taken={a.participants.length} slots={a.participantSlots} color={cat.color} />
        {a.organizerSlots > 0 && <span className="text-[10px] text-faint">🛠️ {slotsText(a.organizers.length, a.organizerSlots)} organizadores</span>}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agenda"
        subtitle="Calendário de atividades do servidor: vagas, responsáveis, presenças, lembretes automáticos e sem conflitos de horário"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isRemote && (
              <Badge tone="cyan">
                <Radio size={11} /> A usar o bot remoto
              </Badge>
            )}
            {tab === 'calendar' ? (
              <Button onClick={() => openNew(weekDays.includes(today) ? today : (weekDays[0] ?? today))} disabled={!guildId}>
                <Plus size={14} /> Nova atividade
              </Button>
            ) : (
              <Button onClick={saveSettings} loading={saving} disabled={!guildId || !dirty}>
                <Save size={14} /> Guardar definições
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Servidor</label>
          <select value={guildId} onChange={(e) => setGuildId(e.target.value)} className={`mt-1.5 block w-64 ${inputClass}`}>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <Tabs
          tabs={[
            { id: 'calendar', label: 'Calendário' },
            { id: 'settings', label: 'Definições' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {!settings.channelId && <span className="pb-2 text-xs text-warning">⚠️ Escolhe o canal da agenda em Definições para as atividades aparecerem no Discord.</span>}
        {note && <span className="pb-2 text-xs text-success">✅ {note}</span>}
        {error && <span className="pb-2 text-xs text-danger">❌ {error}</span>}
      </div>

      {tab === 'settings' ? (
        <CalendarSettingsPanel draft={draft} setDraft={setDraft} channels={channels} roles={roles} emojis={emojis} onEditTemplate={setTemplate} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Próximas atividades', value: upcoming.length },
              { label: 'Vagas livres (participantes)', value: openSlots },
              { label: 'Vagas livres (organizadores)', value: openOrgSlots },
              { label: 'Hoje', value: upcoming.filter((a) => zonedParts(a.startAt, tz).date === today).length },
            ].map((s) => (
              <Card key={s.label} className="flex flex-col gap-1 py-3">
                <span className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{s.label}</span>
                <span className="text-2xl font-black text-text">{s.value}</span>
              </Card>
            ))}
          </div>

          {/* ---- Barra de ferramentas ---- */}
          <Card className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5">
              <button type="button" onClick={() => setView('week')} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'week' ? 'bg-accent-soft text-text' : 'text-muted'}`}>
                <CalendarDays size={13} /> Semana
              </button>
              <button type="button" onClick={() => setView('list')} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'list' ? 'bg-accent-soft text-text' : 'text-muted'}`}>
                <List size={13} /> Lista
              </button>
            </div>
            {view === 'week' && (
              <div className="flex items-center gap-1">
                <Button variant="dark" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                  <ChevronLeft size={14} />
                </Button>
                <Button variant="dark" onClick={() => setWeekStart(mondayOf(today))}>
                  Hoje
                </Button>
                <Button variant="dark" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                  <ChevronRight size={14} />
                </Button>
                <span className="ml-2 text-sm font-bold text-text">{weekStart && `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`}</span>
              </div>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar…" className={`w-40 pl-7 ${inputClass}`} />
              </div>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                <option value="">Todas as categorias</option>
                {settings.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </select>
              <select value={responsible} onChange={(e) => setResponsible(e.target.value)} className={inputClass}>
                <option value="">Todos os responsáveis</option>
                {responsibles.map(([id, tag]) => (
                  <option key={id} value={id}>
                    @{tag}
                  </option>
                ))}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={inputClass}>
                <option value="upcoming">Próximas</option>
                <option value="all">Todas</option>
                <option value="done">Concluídas</option>
                <option value="cancelled">Canceladas</option>
              </select>
              <Button variant="dark" onClick={() => void act({ kind: 'refreshBoard' })} title="Atualizar o painel no Discord">
                <RefreshCw size={13} />
              </Button>
            </div>
          </Card>

          {view === 'week' ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px] text-faint">
                <Clock3 size={12} /> Horários livres entre
                <select value={dayFrom} onChange={(e) => setDayFrom(Number(e.target.value))} className="rounded border border-border bg-black/30 px-1 py-0.5 text-text">
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {h}h
                    </option>
                  ))}
                </select>
                e
                <select value={dayTo} onChange={(e) => setDayTo(Number(e.target.value))} className="rounded border border-border bg-black/30 px-1 py-0.5 text-text">
                  {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                    <option key={h} value={h}>
                      {h}h
                    </option>
                  ))}
                </select>
                (blocos de pelo menos 1h · clica num para marcar)
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
                {weekDays.map((day) => {
                  const list = (byDay.get(day) ?? []).sort((a, b) => a.startAt.localeCompare(b.startAt))
                  const isToday = day === today
                  const past = day < today
                  const nowP = zonedParts(new Date(), tz)
                  const startMin = isToday ? Math.max(dayFrom * 60, Math.ceil((nowP.hour * 60 + nowP.minute) / 30) * 30) : dayFrom * 60
                  const free = past ? [] : freeSlots(weekActsAll(day), tz, startMin, Math.max(dayFrom + 1, dayTo) * 60)
                  const wd = new Date(`${day}T12:00:00Z`).getUTCDay()
                  return (
                    <div key={day} className={`flex min-h-48 flex-col gap-2 rounded-xl border p-2 ${isToday ? 'border-accent bg-accent-soft/30' : 'border-border bg-white/[0.02]'} ${past ? 'opacity-60' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{WEEKDAY_SHORT[wd]}</p>
                          <p className={`text-sm font-black ${isToday ? 'text-accent' : 'text-text'}`}>{shortDate(day)}</p>
                        </div>
                        {!past && (
                          <button type="button" title="Nova atividade neste dia" onClick={() => openNew(day)} className="rounded-md p-1 text-faint hover:bg-white/5 hover:text-text">
                            <Plus size={14} />
                          </button>
                        )}
                      </div>
                      {list.map(card)}
                      {list.length === 0 && !past && <p className="text-[11px] text-faint">Dia livre</p>}
                      {free.map(([s, e]) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => openNew(day, hhmm(s))}
                          className="rounded-lg border border-dashed border-success/40 px-2 py-1 text-left text-[10px] text-success/80 hover:bg-success/10"
                        >
                          🟢 Livre {hhmm(s)}–{hhmm(e)}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState title="Sem atividades" description="Muda os filtros ou cria uma atividade nova." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-black/30 text-[10px] tracking-[0.12em] text-faint uppercase">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Hora</th>
                    <th className="px-3 py-2">Atividade</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Responsável</th>
                    <th className="px-3 py-2">Participantes</th>
                    <th className="px-3 py-2">Organizadores</th>
                    <th className="px-3 py-2">Indisp.</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const cat = categoryOf(settings, a.categoryId)
                    const p = zonedParts(a.startAt, tz)
                    return (
                      <tr key={a.id} className="border-t border-border/60 hover:bg-white/[0.02]">
                        <td className="px-3 py-2 font-mono text-muted">{a.number}</td>
                        <td className="px-3 py-2 text-text">
                          {WEEKDAY_SHORT[p.weekday]} {shortDate(p.date)}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted">
                          {p.time}–{zonedParts(activityEnd(a), tz).time}
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => setDetail(a)} className={`font-semibold text-text hover:underline ${a.status === 'cancelled' ? 'line-through opacity-60' : ''}`}>
                            {a.title}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
                            {cat.emoji} {cat.name}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted">{a.responsibleTag ? `@${a.responsibleTag}` : '—'}</td>
                        <td className="w-32 px-3 py-2">
                          <SlotBar taken={a.participants.length} slots={a.participantSlots} color={cat.color} />
                        </td>
                        <td className="px-3 py-2 font-mono text-muted">{slotsText(a.organizers.length, a.organizerSlots)}</td>
                        <td className="px-3 py-2 font-mono text-muted">{a.unavailable.length}</td>
                        <td className="px-3 py-2 text-muted">{statusText(settings, a)}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <button type="button" title="Editar" onClick={() => openEdit(a)} className="rounded border border-border p-1 text-muted hover:text-text">
                              <Pencil size={12} />
                            </button>
                            {a.status === 'scheduled' && (
                              <button
                                type="button"
                                title="Cancelar"
                                onClick={() => setConfirm({ action: { kind: 'cancel', id: a.id }, title: `Cancelar "${a.title}"?`, text: 'A mensagem no Discord fica marcada como cancelada e os botões desligam-se.' })}
                                className="rounded border border-border p-1 text-muted hover:text-warning"
                              >
                                <XCircle size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ---- Detalhe ---- */}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`#${detail.number} · ${detail.title}`} width="lg">
          {(() => {
            const a = detail
            const cat = categoryOf(settings, a.categoryId)
            const p = zonedParts(a.startAt, tz)
            const people = (title: string, list: Activity['participants'], slots?: number) => (
              <div>
                <p className="mb-1.5 text-[10px] font-bold tracking-[0.14em] text-faint uppercase">
                  {title} {slots !== undefined && `(${slotsText(list.length, slots)})`}
                </p>
                {list.length === 0 ? (
                  <p className="text-xs text-faint">ninguém</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((x) => (
                      <span key={x.userId} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                        @{x.tag}
                        <button type="button" title="Tirar" onClick={() => void act({ kind: 'removePerson', id: a.id, userId: x.userId })} className="hover:text-danger">
                          <XCircle size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
            return (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone="default">
                    <span className="h-2 w-2 rounded-full" style={{ background: cat.color }} /> {cat.emoji} {cat.name}
                  </Badge>
                  <Badge tone={a.status === 'cancelled' ? 'default' : 'success'}>{statusText(settings, a)}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p className="text-muted">
                    🗓️ <span className="text-text">{WEEKDAY_LONG[p.weekday]}, {shortDate(p.date)}</span> · {p.time}–{zonedParts(activityEnd(a), tz).time} ({formatMinutes(a.durationMinutes)})
                  </p>
                  <p className="text-muted">👑 Responsável: <span className="text-text">{a.responsibleTag ? `@${a.responsibleTag}` : '—'}</span></p>
                  <p className="flex items-center gap-1 text-muted">
                    <MapPin size={13} /> {[a.locationChannelId ? `#${channels.find((c) => c.id === a.locationChannelId)?.name ?? 'canal'}` : '', a.locationText].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="flex items-center gap-1 text-muted">
                    <Users size={13} /> criada por {a.createdByTag}
                  </p>
                </div>
                {(settings.coverEnabled || a.cover) && a.status === 'scheduled' && (
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-black/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Dono + supervisores</p>
                      {a.cover ? <Badge tone={COVER_STATE[a.cover.state].tone}>{COVER_STATE[a.cover.state].label}</Badge> : <Badge>Ainda não perguntado</Badge>}
                      {a.cover?.coveredBy && <span className="text-xs text-muted">por @{a.cover.coveredBy.tag}</span>}
                      {a.cover && a.cover.notified > 0 && <span className="text-xs text-faint">{a.cover.notified} supervisor(es) avisados</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="dark" onClick={() => void act({ kind: 'coverAsk', id: a.id })} disabled={!a.responsibleId}>
                        <BellRing size={13} /> Perguntar ao dono agora
                      </Button>
                      <Button variant="dark" onClick={() => void act({ kind: 'coverEscalate', id: a.id })}>
                        <Siren size={13} /> Chamar supervisores agora
                      </Button>
                      {a.cover && (
                        <Button variant="ghost" onClick={() => void act({ kind: 'coverReset', id: a.id })}>
                          <RotateCcw size={13} /> Repor
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {a.description && <p className="rounded-lg border border-border bg-black/20 p-3 text-sm whitespace-pre-wrap text-muted">{a.description}</p>}
                {a.cancelReason && <p className="text-xs text-warning">Motivo do cancelamento: {a.cancelReason}</p>}
                {people('✅ Participantes', a.participants, a.participantSlots)}
                {people('🛠️ Organizadores', a.organizers, a.organizerSlots)}
                {people('❌ Indisponíveis', a.unavailable)}
                <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                  <Button
                    variant="dark"
                    onClick={() => {
                      const copy = inputFromActivity(settings, a, today)
                      setEditing({ input: { ...copy, id: undefined, date: addDays(copy.date, 7) }, tag: a.responsibleTag })
                      setDetail(null)
                    }}
                  >
                    <Copy size={13} /> Duplicar (+7 dias)
                  </Button>
                  <Button variant="dark" onClick={() => void act({ kind: 'repost', id: a.id })}>
                    <RefreshCw size={13} /> Publicar outra vez
                  </Button>
                  <Button
                    variant="dark"
                    onClick={() => setConfirm({ action: { kind: 'delete', id: a.id }, title: `Apagar "${a.title}"?`, text: 'Apaga a atividade e a mensagem no Discord. Não dá para desfazer.' })}
                  >
                    <Trash2 size={13} /> Apagar
                  </Button>
                  {a.status === 'scheduled' && (
                    <Button
                      variant="dark"
                      onClick={() => setConfirm({ action: { kind: 'cancel', id: a.id }, title: `Cancelar "${a.title}"?`, text: 'A mensagem no Discord fica marcada como cancelada e os botões desligam-se.' })}
                    >
                      <XCircle size={13} /> Cancelar
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      openEdit(a)
                      setDetail(null)
                    }}
                  >
                    <Pencil size={13} /> Editar
                  </Button>
                </div>
              </div>
            )
          })()}
        </Modal>
      )}

      {editing && state && (
        <ActivityEditor
          open
          onClose={() => setEditing(null)}
          initial={editing.input}
          initialResponsibleTag={editing.tag}
          settings={state.settings}
          activities={activities}
          channels={channels}
          guildId={guildId}
          isRemote={isRemote}
          onSaved={applyState}
        />
      )}

      {template && (
        <TemplateEditorModal
          open
          onClose={() => setTemplate(null)}
          kind={template}
          guildId={guildId}
          isRemote={isRemote}
          title={templateInfo[template].title}
          hint={templateInfo[template].hint}
          tokens={templateInfo[template].tokens}
          previewPlaceholders={templateInfo[template].values}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) void act(confirm.action)
          if (confirm?.action.kind === 'delete') setDetail(null)
        }}
        title={confirm?.title ?? ''}
        description={confirm?.text ?? ''}
        confirmLabel="Confirmar"
        danger
      />
    </div>
  )
}
