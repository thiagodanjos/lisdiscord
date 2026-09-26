import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Clock3,
  Eraser,
  HardDrive,
  Layers,
  Medal,
  MessageSquarePlus,
  MessageSquareWarning,
  Server,
  Timer,
  TrendingDown,
  UserCheck,
  Users,
} from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatBytes, formatDuration, formatRelativeDate } from '../lib/format'
import { cn } from '../lib/utils'
import { Avatar, Badge, Card, EmptyState, PageHeader, StatCard, StatChip, Tabs } from '../components/ui'
import type { BackupSummary, BotEmoji, BotStatus, GuildSummary, MovPointsEntry, MovPointsLogEntry, RemoteBotConfig, ScheduleConfig } from '../../shared/types'

type Tab = 'geral' | 'movcall' | 'backups'

const QUICK_LINKS = [
  { to: '/mensagens', label: 'Mensagens', icon: MessageSquarePlus, tone: 'text-accent' },
  { to: '/pontos-mov', label: 'Pontos MOV', icon: Medal, tone: 'text-amber' },
  { to: '/horas-mov', label: 'Horas MOV', icon: Timer, tone: 'text-cyan' },
  { to: '/justificativas', label: 'Justificativas', icon: MessageSquareWarning, tone: 'text-pink' },
  { to: '/logs-limpeza', label: 'Logs de limpeza', icon: Eraser, tone: 'text-violet' },
  { to: '/backups', label: 'Backups', icon: Layers, tone: 'text-accent' },
]

export default function Dashboard({ status }: { status: BotStatus | null }) {
  const [tab, setTab] = useState<Tab>('geral')
  const [remote, setRemote] = useState<RemoteBotConfig>({ url: null, hasApiKey: false })
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [backups, setBackups] = useState<BackupSummary[]>([])
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([])
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [loading, setLoading] = useState(true)
  const [guildId, setGuildId] = useState('')
  const [leaderboard, setLeaderboard] = useState<MovPointsEntry[]>([])
  const [log, setLog] = useState<MovPointsLogEntry[]>([])

  const isRemote = Boolean(remote.url && remote.hasApiKey)

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemote).catch(() => undefined)
    Promise.all([bridge.listBackups().catch(() => []), bridge.listSchedules().catch(() => [])]).then(([b, s]) => {
      setBackups(b)
      setSchedules(s)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    const listGuilds = isRemote ? bridge.listRemoteGuilds : bridge.listGuilds
    const listEmojis = isRemote ? bridge.listRemoteEmojis : bridge.listEmojis
    listGuilds()
      .then((g) => {
        setGuilds(g)
        setGuildId((current) => current || g[0]?.id || '')
      })
      .catch(() => setGuilds([]))
      .finally(() => setLoading(false))
    listEmojis().then(setEmojis).catch(() => setEmojis([]))
  }, [isRemote])

  useEffect(() => {
    if (!guildId) return
    const listMovPoints = isRemote ? bridge.listRemoteMovPoints : bridge.listMovPoints
    const listLog = isRemote ? bridge.listRemoteMovPointsLog : bridge.listMovPointsLog
    listMovPoints(guildId).then(setLeaderboard).catch(() => setLeaderboard([]))
    listLog(guildId).then(setLog).catch(() => setLog([]))
  }, [guildId, isRemote])

  const totalMembers = guilds.reduce((sum, g) => sum + g.memberCount, 0)
  const totalSize = backups.reduce((sum, b) => sum + b.sizeBytes, 0)
  const activeSchedules = schedules.filter((s) => s.enabled)
  const nextRun = activeSchedules.filter((s) => s.nextRunAt).sort((a, b) => (a.nextRunAt! < b.nextRunAt! ? -1 : 1))[0]

  const mov = useMemo(() => {
    const points = leaderboard.reduce((s, e) => s + e.points, 0)
    const seconds = leaderboard.reduce((s, e) => s + e.totalSeconds, 0)
    const active = leaderboard.filter((e) => e.totalSeconds >= 5 * 3600).length
    return { points, seconds, active, inactive: leaderboard.length - active }
  }, [leaderboard])

  const dash = (v: number | string) => (loading ? '—' : v)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Visão Geral" subtitle="Métricas e estado dos teus servidores, do bot e dos sistemas de Mov. Call" />

      <Tabs
        tabs={[
          { id: 'geral', label: 'Geral' },
          { id: 'movcall', label: 'Mov. Call' },
          { id: 'backups', label: 'Backups' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'geral' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Servidores" value={dash(guilds.length)} hint="com o bot dentro" icon={Server} tone="green" />
            <StatCard label="Membros" value={dash(totalMembers.toLocaleString('pt-PT'))} hint="somando todos os servidores" icon={Users} tone="violet" />
            <StatCard label="Backups" value={backups.length} hint={formatBytes(totalSize)} icon={Layers} tone="amber" />
            <StatCard
              label="Agendamentos"
              value={activeSchedules.length}
              hint={nextRun ? `próximo ${formatRelativeDate(nextRun.nextRunAt as string)}` : 'nenhum ativo'}
              icon={Clock3}
              tone="pink"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <StatChip label="Bot" value={status?.connected ? 'Online' : 'Desligado'} tone={status?.connected ? 'accent' : 'danger'} />
            <StatChip label="Bot remoto" value={isRemote ? 'Ligado' : 'Não configurado'} tone={isRemote ? 'cyan' : 'default'} />
            <StatChip label="Message Content" value={status?.messageContentEnabled ? 'Sim' : 'Não'} tone={status?.messageContentEnabled ? 'accent' : 'warning'} />
            <StatChip label="Server Members" value={status?.guildMembersEnabled ? 'Sim' : 'Não'} tone={status?.guildMembersEnabled ? 'accent' : 'warning'} />
            <StatChip label="Emojis do bot" value={emojis.length} tone="violet" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="p-0 xl:col-span-2">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h3 className="text-sm font-black tracking-wide uppercase">Servidores</h3>
                  <p className="text-[11px] text-faint">{guilds.length} registos</p>
                </div>
                <Link to="/servidores" className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover">
                  Ver todos <ArrowUpRight size={13} />
                </Link>
              </div>
              {guilds.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted">{loading ? 'A carregar…' : 'Nenhum servidor encontrado.'}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-bold tracking-[0.14em] text-faint uppercase">
                      <th className="px-5 py-3">Servidor</th>
                      <th className="px-5 py-3">Membros</th>
                      <th className="px-5 py-3">Estado</th>
                      <th className="px-5 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guilds.slice(0, 6).map((g) => (
                      <tr key={g.id} className="border-t border-border/70 transition-colors hover:bg-white/[0.02]">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            {g.iconUrl ? (
                              <img src={g.iconUrl} alt="" className="size-8 rounded-full object-cover ring-1 ring-white/10" />
                            ) : (
                              <Avatar name={g.name} size="sm" />
                            )}
                            <span className="truncate font-semibold text-text">{g.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono text-muted">{g.memberCount}</td>
                        <td className="px-5 py-3">{g.botIsAdmin ? <Badge tone="success" pulse>Admin</Badge> : <Badge tone="warning">Sem admin</Badge>}</td>
                        <td className="px-5 py-3 text-right">
                          <Link to="/servidores" className="rounded-md border border-cyan/35 bg-cyan/10 px-2.5 py-1 text-xs font-semibold text-cyan hover:bg-cyan/20">
                            Backup
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card>
              <h3 className="text-sm font-black tracking-wide uppercase">Atalhos</h3>
              <p className="text-[11px] text-faint">O que mais usas, a um clique</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {QUICK_LINKS.map(({ to, label, icon: Icon, tone }) => (
                  <Link
                    key={to}
                    to={to}
                    className="group flex flex-col gap-2 rounded-xl border border-border bg-black/20 p-3 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:bg-white/[0.03]"
                  >
                    <Icon size={18} className={cn(tone, 'transition-transform group-hover:scale-110')} />
                    <span className="text-xs font-semibold text-text">{label}</span>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === 'movcall' && (
        <>
          {guilds.length > 1 && (
            <select
              value={guildId}
              onChange={(e) => setGuildId(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Pontos no total" value={mov.points.toLocaleString('pt-PT')} icon={Medal} tone="amber" />
            <StatCard label="Horas no total" value={formatDuration(mov.seconds)} icon={Timer} tone="cyan" />
            <StatCard label="Ativos (5h+)" value={mov.active} icon={UserCheck} tone="green" />
            <StatCard label="Abaixo de 5h" value={mov.inactive} icon={TrendingDown} tone="pink" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black tracking-wide uppercase">Top 5</h3>
                <Link to="/pontos-mov" className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover">
                  Ranking completo <ArrowUpRight size={13} />
                </Link>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {leaderboard.length === 0 && <p className="text-sm text-muted">Sem dados ainda.</p>}
                {leaderboard.slice(0, 5).map((e, i) => (
                  <div key={e.userId} className="flex items-center gap-3 rounded-xl border border-border bg-black/20 px-3 py-2.5">
                    <span className="w-6 text-center text-lg">{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{e.tag}</span>
                    <span className="font-mono text-xs text-muted">{formatDuration(e.totalSeconds)}</span>
                    <span className="font-mono text-sm font-bold text-amber">{e.points}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-black tracking-wide uppercase">Atividade recente</h3>
              <div className="mt-4 flex flex-col gap-2">
                {log.length === 0 && <p className="text-sm text-muted">Sem alterações registadas.</p>}
                {log.slice(0, 7).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-border bg-black/20 px-3 py-2.5 text-sm">
                    <Badge tone={entry.action.startsWith('add') ? 'success' : entry.action === 'reset' ? 'warning' : 'danger'}>
                      {entry.action.includes('hours') ? 'Horas' : entry.action === 'reset' ? 'Reset' : 'Pontos'}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-text">{entry.targetTag ?? 'Todos'}</span>
                    <span className="font-mono text-xs text-muted">
                      {entry.action === 'reset'
                        ? '—'
                        : `${entry.action.startsWith('add') ? '+' : '-'}${entry.action.includes('hours') ? formatDuration(entry.amount ?? 0) : (entry.amount ?? 0)}`}
                    </span>
                    <span className="text-[11px] text-faint">{formatRelativeDate(entry.date)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === 'backups' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Backups guardados" value={backups.length} icon={Layers} tone="amber" />
            <StatCard label="Espaço usado" value={formatBytes(totalSize)} icon={HardDrive} tone="cyan" />
            <StatCard label="Automáticos" value={backups.filter((b) => b.origin === 'scheduled').length} hint="feitos por agendamento" icon={Clock3} tone="violet" />
          </div>
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-sm font-black tracking-wide uppercase">Backups recentes</h3>
              <Link to="/backups" className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover">
                Ver todos <ArrowUpRight size={13} />
              </Link>
            </div>
            {backups.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Ainda não tens backups" description="Vai a Servidores e cria o primeiro." />
              </div>
            ) : (
              <div className="flex flex-col">
                {backups.slice(0, 8).map((b) => (
                  <div key={b.id} className="flex items-center gap-3 border-t border-border/70 px-5 py-3 first:border-t-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber/35 bg-amber/10 text-amber">
                      <Layers size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">{b.guildName}</p>
                      <p className="text-xs text-muted">
                        {b.channelCount} canais · {b.roleCount} cargos · {formatBytes(b.sizeBytes)}
                      </p>
                    </div>
                    {b.origin === 'scheduled' && <Badge tone="cyan">Auto</Badge>}
                    <span className="text-xs text-faint">{formatRelativeDate(b.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
