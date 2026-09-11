import { useEffect, useState } from 'react'
import { Ban, Clock, LogOut, Lock, ScrollText, Search, ShieldOff, Unlock } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatRelativeDate } from '../lib/format'
import { Avatar, Badge, Button, Card, Modal, SectionHeading } from '../components/ui'
import type { ChannelPickerEntry, GuildSummary, MemberSearchResult, ModerationLogEntry, TimeoutDuration } from '../../shared/types'

const TIMEOUT_OPTIONS: { label: string; value: TimeoutDuration }[] = [
  { label: '1 minuto', value: 60_000 },
  { label: '5 minutos', value: 300_000 },
  { label: '10 minutos', value: 600_000 },
  { label: '1 hora', value: 3_600_000 },
  { label: '1 dia', value: 86_400_000 },
  { label: '1 semana', value: 604_800_000 },
]

export default function Moderation() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [channelId, setChannelId] = useState('')
  const [log, setLog] = useState<ModerationLogEntry[]>([])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MemberSearchResult[]>([])
  const [target, setTarget] = useState<MemberSearchResult | null>(null)
  const [action, setAction] = useState<'ban' | 'kick' | 'timeout' | null>(null)
  const [reason, setReason] = useState('')
  const [deleteDays, setDeleteDays] = useState(0)
  const [duration, setDuration] = useState<TimeoutDuration>(300_000)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    bridge.listGuilds().then((g) => {
      setGuilds(g)
      setGuildId(g[0]?.id ?? '')
    })
    loadLog()
  }, [])

  useEffect(() => {
    if (!guildId) return
    bridge.listChannels(guildId).then((c) => {
      setChannels(c)
      setChannelId(c[0]?.id ?? '')
    })
  }, [guildId])

  useEffect(() => {
    if (!guildId || !query.trim()) {
      setResults([])
      return
    }
    const timeout = setTimeout(() => {
      bridge.searchMembers(guildId, query).then(setResults)
    }, 300)
    return () => clearTimeout(timeout)
  }, [guildId, query])

  function loadLog() {
    bridge.listModerationLog().then(setLog)
  }

  function openAction(kind: 'ban' | 'kick' | 'timeout') {
    setAction(kind)
    setReason('')
    setDeleteDays(0)
    setDuration(300_000)
  }

  async function confirmAction() {
    if (!target) return
    setBusy(true)
    try {
      if (action === 'ban') await bridge.banMember(guildId, target.id, reason, deleteDays * 86_400)
      if (action === 'kick') await bridge.kickMember(guildId, target.id, reason)
      if (action === 'timeout') await bridge.timeoutMember(guildId, target.id, duration, reason)
      setAction(null)
      setTarget(null)
      setQuery('')
      setResults([])
      loadLog()
    } finally {
      setBusy(false)
    }
  }

  async function removeTimeoutNow() {
    if (!target) return
    setBusy(true)
    try {
      await bridge.removeTimeout(guildId, target.id)
      setTarget({ ...target, isTimedOut: false })
      loadLog()
    } finally {
      setBusy(false)
    }
  }

  async function toggleLock(lock: boolean) {
    if (!channelId) return
    if (lock) await bridge.lockChannel(guildId, channelId)
    else await bridge.unlockChannel(guildId, channelId)
    loadLog()
  }

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading title="Moderação" subtitle="Ações diretas no servidor: banir, expulsar, mutar e bloquear canais" />

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
        <SectionHeading title="Membros" subtitle="Pesquisa por nome de utilizador para agir sobre alguém" />
        <div className="relative max-w-md">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar membro…"
            className="w-full rounded-full border border-border bg-card py-2 pr-3 pl-9 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>

        {results.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 max-w-md">
            {results.map((m) => (
              <button
                key={m.id}
                onClick={() => setTarget(m)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:border-border-strong"
              >
                <Avatar name={m.tag} color="#5865F2" size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{m.tag}</p>
                </div>
                {m.isBot && <Badge>Bot</Badge>}
                {m.isTimedOut && <Badge tone="warning">Mutado</Badge>}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="Canais" subtitle="Bloquear impede o envio de mensagens por toda a gente (exceto administradores)" />
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <Button variant="danger" onClick={() => toggleLock(true)} disabled={!channelId}>
            <Lock size={14} />
            Bloquear
          </Button>
          <Button variant="dark" onClick={() => toggleLock(false)} disabled={!channelId}>
            <Unlock size={14} />
            Desbloquear
          </Button>
        </div>
      </section>

      <section>
        <SectionHeading title="Registo de moderação" action={<ScrollText size={16} className="text-faint" />} />
        <div className="flex flex-col gap-2">
          {log.length === 0 && <p className="text-sm text-muted">Ainda sem ações registadas.</p>}
          {log.map((entry) => (
            <Card key={entry.id} className="flex items-center gap-3 p-3">
              <ActionBadge action={entry.action} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text">
                  <span className="font-semibold">{entry.targetTag}</span> em {entry.guildName}
                </p>
                {entry.reason && <p className="text-xs text-muted">{entry.reason}</p>}
              </div>
              <span className="shrink-0 text-xs text-muted">{formatRelativeDate(entry.date)}</span>
            </Card>
          ))}
        </div>
      </section>

      <Modal open={target !== null && action === null} onClose={() => setTarget(null)} title={target?.tag ?? ''}>
        <div className="flex flex-col gap-2">
          <Button variant="danger" onClick={() => openAction('ban')}>
            <Ban size={14} />
            Banir
          </Button>
          <Button variant="dark" onClick={() => openAction('kick')}>
            <LogOut size={14} />
            Expulsar
          </Button>
          {target?.isTimedOut ? (
            <Button variant="dark" onClick={removeTimeoutNow} loading={busy}>
              <ShieldOff size={14} />
              Remover mute
            </Button>
          ) : (
            <Button variant="dark" onClick={() => openAction('timeout')}>
              <Clock size={14} />
              Mutar (timeout)
            </Button>
          )}
        </div>
      </Modal>

      <Modal open={action !== null} onClose={() => setAction(null)} title={actionTitle(action)}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Motivo (opcional)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none" />
          </div>

          {action === 'ban' && (
            <div>
              <label className="text-xs font-semibold tracking-wide text-faint uppercase">Apagar mensagens dos últimos</label>
              <select value={deleteDays} onChange={(e) => setDeleteDays(Number(e.target.value))} className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none">
                <option value={0}>Não apagar</option>
                <option value={1}>1 dia</option>
                <option value={7}>7 dias</option>
              </select>
            </div>
          )}

          {action === 'timeout' && (
            <div>
              <label className="text-xs font-semibold tracking-wide text-faint uppercase">Duração</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {TIMEOUT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setDuration(o.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      duration === o.value ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-raised text-muted hover:text-text'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="dark" onClick={() => setAction(null)}>
              Cancelar
            </Button>
            <Button variant={action === 'ban' ? 'danger' : 'primary'} onClick={confirmAction} loading={busy}>
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function actionTitle(action: 'ban' | 'kick' | 'timeout' | null): string {
  if (action === 'ban') return 'Banir membro'
  if (action === 'kick') return 'Expulsar membro'
  if (action === 'timeout') return 'Mutar membro'
  return ''
}

function ActionBadge({ action }: { action: ModerationLogEntry['action'] }) {
  const map: Record<ModerationLogEntry['action'], { label: string; tone: 'danger' | 'warning' | 'default' | 'accent' }> = {
    ban: { label: 'Banido', tone: 'danger' },
    kick: { label: 'Expulso', tone: 'warning' },
    timeout: { label: 'Mutado', tone: 'warning' },
    removeTimeout: { label: 'Mute removido', tone: 'accent' },
    lockChannel: { label: 'Canal bloqueado', tone: 'danger' },
    unlockChannel: { label: 'Canal desbloqueado', tone: 'accent' },
  }
  const { label, tone } = map[action]
  return <Badge tone={tone}>{label}</Badge>
}
