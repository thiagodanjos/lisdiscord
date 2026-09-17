import { useEffect, useState } from 'react'
import { Minus, Plus, RotateCcw, ScrollText, Timer } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatDuration, formatRelativeDate } from '../lib/format'
import { Avatar, Badge, Card, SectionHeading } from '../components/ui'
import type { GuildSummary, MovPointsLogAction, MovPointsLogEntry } from '../../shared/types'

export default function PointsLog() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [log, setLog] = useState<MovPointsLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    bridge.listGuilds().then((g) => {
      setGuilds(g)
      setGuildId(g[0]?.id ?? '')
    })
  }, [])

  useEffect(() => {
    if (!guildId) return
    setLoading(true)
    bridge
      .listMovPointsLog(guildId)
      .then(setLog)
      .finally(() => setLoading(false))
  }, [guildId])

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        title="Logs de pontos"
        subtitle="Histórico completo de quem adicionou, removeu ou repôs pontos e horas de Mov. Call — e quando"
      />

      <div>
        <label className="text-xs font-semibold tracking-wide text-faint uppercase">Servidor</label>
        <select
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          className="mt-1.5 w-full max-w-xs rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        >
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <section>
        <SectionHeading title="Histórico" action={<ScrollText size={16} className="text-faint" />} />
        <div className="flex flex-col gap-2">
          {!loading && log.length === 0 && <p className="text-sm text-muted">Ainda sem ações registadas neste servidor.</p>}
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
  if (entry.action === 'add_hours') {
    return `+${formatDuration(entry.amount ?? 0)} de Mov. Call${entry.newTotal !== null ? ` · total ${formatDuration(entry.newTotal)}` : ''}`
  }
  const sign = entry.action === 'add_points' ? '+' : '-'
  return `${sign}${entry.amount ?? 0} pontos${entry.newTotal !== null ? ` · saldo ${entry.newTotal}` : ''}`
}

function ActionBadge({ action }: { action: MovPointsLogAction }) {
  const map: Record<MovPointsLogAction, { label: string; tone: 'danger' | 'warning' | 'default' | 'accent'; icon: typeof Plus }> = {
    add_points: { label: 'Pontos +', tone: 'accent', icon: Plus },
    remove_points: { label: 'Pontos -', tone: 'danger', icon: Minus },
    add_hours: { label: 'Horas', tone: 'default', icon: Timer },
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
