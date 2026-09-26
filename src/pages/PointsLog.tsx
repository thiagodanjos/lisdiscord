import { useEffect, useState } from 'react'
import { Minus, Plus, Radio, RotateCcw, ScrollText, Timer } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatDuration, formatRelativeDate } from '../lib/format'
import { Avatar, Badge, Card, PageHeader, SectionHeading } from '../components/ui'
import { HOURS_LOG_ACTIONS, type GuildSummary, type MovPointsLogAction, type MovPointsLogEntry, type RemoteBotConfig } from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }

type LogMode = 'points' | 'hours'

const COPY: Record<LogMode, { title: string; subtitle: string; empty: string }> = {
  points: {
    title: 'Logs de pontos',
    subtitle: 'Histórico de quem adicionou, removeu ou repôs pontos de Mov. Call — e quando',
    empty: 'Ainda sem alterações de pontos registadas neste servidor.',
  },
  hours: {
    title: 'Logs de horas',
    subtitle: 'Histórico de quem adicionou ou removeu horas de Mov. Call — e quando',
    empty: 'Ainda sem alterações de horas registadas neste servidor.',
  },
}

export default function PointsLog({ mode = 'points' }: { mode?: LogMode }) {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [log, setLog] = useState<MovPointsLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const isRemote = Boolean(remoteConfig.url && remoteConfig.hasApiKey)

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemoteConfig)
  }, [])

  useEffect(() => {
    setLoadError('')
    const listGuilds = isRemote ? bridge.listRemoteGuilds : bridge.listGuilds
    listGuilds()
      .then((g) => {
        setGuilds(g)
        setGuildId(g[0]?.id ?? '')
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Não consegui carregar os servidores.'))
  }, [isRemote])

  useEffect(() => {
    if (!guildId) return
    setLoading(true)
    setLoadError('')
    const listLog = isRemote ? bridge.listRemoteMovPointsLog : bridge.listMovPointsLog
    listLog(guildId)
      // A reposição apaga pontos E horas, por isso aparece nos dois históricos.
      .then((entries) => setLog(entries.filter((e) => e.action === 'reset' || (mode === 'hours') === HOURS_LOG_ACTIONS.includes(e.action))))
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Não consegui carregar o histórico.'))
      .finally(() => setLoading(false))
  }, [guildId, isRemote, mode])

  const copy = COPY[mode]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        action={
          isRemote ? (
            <Badge tone="success">
              <Radio size={11} className="mr-1 inline" /> A usar o bot remoto
            </Badge>
          ) : undefined
        }
      />

      <div>
        <label className="text-xs font-semibold tracking-wide text-faint uppercase">Servidor</label>
        <select
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          className="mt-1.5 block w-full max-w-xs rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        >
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {loadError && <p className="mt-1.5 text-xs text-danger">❌ {loadError}</p>}
      </div>

      <section>
        <SectionHeading title="Histórico" action={mode === 'hours' ? <Timer size={16} className="text-faint" /> : <ScrollText size={16} className="text-faint" />} />
        <div className="flex flex-col gap-2">
          {!loading && log.length === 0 && <p className="text-sm text-muted">{copy.empty}</p>}
          {log.map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </div>
      </section>
    </div>
  )
}

function LogRow({ entry }: { entry: MovPointsLogEntry }) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <ActionBadge action={entry.action} />
      <Avatar name={entry.targetTag ?? 'Todos'} color="#F0B232" size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text">
          <span className="font-semibold">{entry.targetTag ?? 'Todos os membros'}</span> {describeAmount(entry)}
        </p>
        <p className="text-xs text-muted">
          Por <span className="font-medium text-text">{entry.actorTag}</span>
          {entry.note ? ` · ${entry.note}` : ''}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted">{formatRelativeDate(entry.date)}</span>
    </Card>
  )
}

function describeAmount(entry: MovPointsLogEntry): string {
  if (entry.action === 'reset') return `— placar reposto (${entry.amount ?? 0} pessoa(s) afetada(s))`
  if (entry.action === 'add_hours' || entry.action === 'remove_hours') {
    const sign = entry.action === 'add_hours' ? '+' : '-'
    return `${sign}${formatDuration(entry.amount ?? 0)} de Mov. Call${entry.newTotal !== null ? ` · total ${formatDuration(entry.newTotal)}` : ''}`
  }
  const sign = entry.action === 'add_points' ? '+' : '-'
  return `${sign}${entry.amount ?? 0} pontos${entry.newTotal !== null ? ` · saldo ${entry.newTotal}` : ''}`
}

function ActionBadge({ action }: { action: MovPointsLogAction }) {
  const map: Record<MovPointsLogAction, { label: string; tone: 'danger' | 'warning' | 'default' | 'accent' | 'success'; icon: typeof Plus }> = {
    add_points: { label: 'Pontos +', tone: 'accent', icon: Plus },
    remove_points: { label: 'Pontos -', tone: 'danger', icon: Minus },
    add_hours: { label: 'Horas +', tone: 'success', icon: Timer },
    remove_hours: { label: 'Horas -', tone: 'danger', icon: Timer },
    reset: { label: 'Reposição', tone: 'warning', icon: RotateCcw },
  }
  const { label, tone, icon: Icon } = map[action]
  return (
    <Badge tone={tone}>
      <Icon size={11} className="mr-1 inline" />
      {label}
    </Badge>
  )
}
