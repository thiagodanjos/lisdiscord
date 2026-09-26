import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock3, Minus, Plus, Radio, ScrollText, Search, Timer, Users } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatDuration } from '../lib/format'
import { cn } from '../lib/utils'
import { Avatar, Badge, Button, Card, EmptyState, Modal, PageHeader, SectionHeading, StatCard } from '../components/ui'
import type { GuildSummary, MovPointsEntry, RemoteBotConfig } from '../../shared/types'

const POLL_INTERVAL_MS = 8_000
const INACTIVE_THRESHOLD_SECONDS = 5 * 3600
const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const QUICK_AMOUNTS = [
  { label: '+15m', seconds: 15 * 60 },
  { label: '+30m', seconds: 30 * 60 },
  { label: '+1h', seconds: 3600 },
  { label: '+2h', seconds: 2 * 3600 },
]

interface Target {
  userId: string
  tag: string
  totalSeconds: number
}

export default function MovHours() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [leaderboard, setLeaderboard] = useState<MovPointsEntry[]>([])
  const [loadError, setLoadError] = useState('')
  const [filter, setFilter] = useState('')
  const [target, setTarget] = useState<Target | null>(null)
  const navigate = useNavigate()

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
    loadLeaderboard()
    const interval = setInterval(loadLeaderboard, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  function loadLeaderboard() {
    if (!guildId) return
    const listMovPoints = isRemote ? bridge.listRemoteMovPoints : bridge.listMovPoints
    listMovPoints(guildId)
      .then((entries) => {
        setLeaderboard(entries)
        setLoadError('')
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Não consegui carregar as horas.'))
  }

  const byHours = useMemo(() => [...leaderboard].sort((a, b) => b.totalSeconds - a.totalSeconds || b.points - a.points), [leaderboard])
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? byHours.filter((e) => e.tag.toLowerCase().includes(q)) : byHours
  }, [byHours, filter])

  const totalSeconds = leaderboard.reduce((sum, e) => sum + e.totalSeconds, 0)
  const belowThreshold = leaderboard.filter((e) => e.totalSeconds < INACTIVE_THRESHOLD_SECONDS).length
  const maxSeconds = byHours[0]?.totalSeconds ?? 0

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Horas de MOV. Call"
        subtitle="Adiciona ou remove horas de cada membro — também dá pelo Discord, com /movhoras adicionar e /movhoras remover"
        action={
          <div className="flex items-center gap-3">
            {isRemote && (
              <Badge tone="success">
                <Radio size={11} className="mr-1 inline" /> A usar o bot remoto
              </Badge>
            )}
            <Button variant="dark" className="!px-3 !py-1.5 text-xs" onClick={() => navigate('/logs-horas')}>
              <ScrollText size={13} />
              Ver logs de horas
            </Button>
          </div>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Horas no total" value={formatDuration(totalSeconds)} hint="Somando todos os membros" />
        <StatCard label="Membros" value={leaderboard.length} hint="Sem bots e sem quem escondeste" />
        <StatCard label="Abaixo de 5h" value={belowThreshold} hint="Contam como inativos no /inativos" />
      </div>

      <section>
        <SectionHeading
          title="Membros"
          subtitle="Clica em Ajustar para adicionar ou remover horas a alguém"
          action={<Clock3 size={16} className="text-faint" />}
        />
        <div className="relative mb-4 max-w-md">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar membros…"
            className="w-full rounded-full border border-border bg-card py-2 pr-3 pl-9 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title={leaderboard.length === 0 ? 'Ainda sem membros' : 'Ninguém encontrado'}
            description={
              leaderboard.length === 0
                ? 'Assim que o bot conseguir ver membros deste servidor, eles aparecem aqui automaticamente.'
                : 'Nenhum membro corresponde a esse filtro.'
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((entry) => {
              const rank = byHours.indexOf(entry) + 1
              const pct = maxSeconds > 0 ? Math.max(2, Math.round((entry.totalSeconds / maxSeconds) * 100)) : 0
              const inactive = entry.totalSeconds < INACTIVE_THRESHOLD_SECONDS
              return (
                <Card key={entry.userId} className="flex items-center gap-4 p-4">
                  <span className="w-8 shrink-0 text-center text-sm font-bold text-faint">{rank}.</span>
                  <Avatar name={entry.tag} color="#5865F2" size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-text">{entry.tag}</p>
                      {inactive && <Badge tone="warning">&lt; 5h</Badge>}
                    </div>
                    <div className="mt-1.5 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-raised">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-text">
                    <Timer size={14} className="text-accent" /> {formatDuration(entry.totalSeconds)}
                  </span>
                  <Button
                    variant="dark"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => setTarget({ userId: entry.userId, tag: entry.tag, totalSeconds: entry.totalSeconds })}
                  >
                    Ajustar
                  </Button>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <AdjustHoursModal
        target={target}
        guildId={guildId}
        isRemote={isRemote}
        onClose={() => setTarget(null)}
        onApplied={(updated) => {
          setLeaderboard(updated)
          setTarget(null)
        }}
      />
    </div>
  )
}

function AdjustHoursModal({
  target,
  guildId,
  isRemote,
  onClose,
  onApplied,
}: {
  target: Target | null
  guildId: string
  isRemote: boolean
  onClose: () => void
  onApplied: (updated: MovPointsEntry[]) => void
}) {
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [busy, setBusy] = useState<'add' | 'remove' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setHours('')
    setMinutes('')
    setSeconds('')
    setError('')
    setBusy(null)
  }, [target?.userId])

  const amount = toInt(hours) * 3600 + toInt(minutes) * 60 + toInt(seconds)
  const current = target?.totalSeconds ?? 0
  const afterAdd = current + amount
  const afterRemove = Math.max(0, current - amount)

  function addQuick(extra: number) {
    const total = amount + extra
    setHours(String(Math.floor(total / 3600)))
    setMinutes(String(Math.floor((total % 3600) / 60)))
    setSeconds(String(total % 60))
  }

  async function apply(direction: 'add' | 'remove') {
    if (!target || amount <= 0) return
    setBusy(direction)
    setError('')
    try {
      const fn =
        direction === 'add'
          ? isRemote
            ? bridge.addRemoteMovHours
            : bridge.addMovHours
          : isRemote
            ? bridge.removeRemoteMovHours
            : bridge.removeMovHours
      onApplied(await fn(guildId, target.userId, amount))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={target !== null} onClose={onClose} title="Ajustar horas de Mov. Call" width="lg">
      {target && (
        <div className="flex flex-col gap-5 py-1">
          <div className="flex items-center gap-3 rounded-xl bg-card/60 p-4">
            <Avatar name={target.tag} color="#5865F2" size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-text">{target.tag}</p>
              <p className="text-sm text-muted">
                Total atual: <span className="font-semibold text-text">{formatDuration(current)}</span>
              </p>
            </div>
            <Users size={18} className="text-faint" />
          </div>

          <div>
            <label className="text-sm font-semibold tracking-wide text-faint uppercase">Quanto tempo</label>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <TimeInput value={hours} onChange={setHours} unit="horas" />
              <TimeInput value={minutes} onChange={setMinutes} unit="minutos" max={59} />
              <TimeInput value={seconds} onChange={setSeconds} unit="segundos" max={59} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => addQuick(q.seconds)}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {q.label}
                </button>
              ))}
              {amount > 0 && (
                <button
                  type="button"
                  onClick={() => addQuick(-amount)}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-faint hover:text-danger"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={cn('rounded-xl border p-3', amount > 0 ? 'border-success/40 bg-success/5' : 'border-border')}>
              <p className="text-xs font-semibold text-faint uppercase">Se adicionares</p>
              <p className="mt-1 text-lg font-bold text-text">{formatDuration(afterAdd)}</p>
            </div>
            <div className={cn('rounded-xl border p-3', amount > 0 ? 'border-danger/40 bg-danger/5' : 'border-border')}>
              <p className="text-xs font-semibold text-faint uppercase">Se removeres</p>
              <p className="mt-1 text-lg font-bold text-text">{formatDuration(afterRemove)}</p>
              {amount > current && current > 0 && <p className="mt-0.5 text-[11px] text-warning">Remove mais do que tem — fica em 0.</p>}
            </div>
          </div>

          {error && <p className="text-xs text-danger">❌ {error}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="dark" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" onClick={() => apply('remove')} loading={busy === 'remove'} disabled={amount <= 0 || busy !== null}>
              <Minus size={14} />
              Remover {amount > 0 ? formatDuration(amount) : ''}
            </Button>
            <Button type="button" onClick={() => apply('add')} loading={busy === 'add'} disabled={amount <= 0 || busy !== null}>
              <Plus size={14} />
              Adicionar {amount > 0 ? formatDuration(amount) : ''}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function TimeInput({ value, onChange, unit, max }: { value: string; onChange: (v: string) => void; unit: string; max?: number }) {
  return (
    <div>
      <input
        inputMode="numeric"
        value={value}
        placeholder="0"
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 5)
          const n = digits === '' ? '' : String(max !== undefined ? Math.min(max, Number(digits)) : Number(digits))
          onChange(n)
        }}
        className="w-full rounded-lg border border-border bg-raised px-3 py-3 text-center text-lg font-semibold text-text placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <p className="mt-1 text-center text-xs text-faint">{unit}</p>
    </div>
  )
}

function toInt(v: string): number {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}
