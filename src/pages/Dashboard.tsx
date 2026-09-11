import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock3, HardDrive, Layers, Server } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatBytes, formatRelativeDate } from '../lib/format'
import { Badge, Card, SectionHeading, StatCard } from '../components/ui'
import type { BackupSummary, GuildSummary, ScheduleConfig } from '../../shared/types'

export default function Dashboard() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [backups, setBackups] = useState<BackupSummary[]>([])
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([bridge.listGuilds(), bridge.listBackups(), bridge.listSchedules()]).then(([g, b, s]) => {
      setGuilds(g)
      setBackups(b)
      setSchedules(s)
      setLoading(false)
    })
  }, [])

  const totalSize = backups.reduce((sum, b) => sum + b.sizeBytes, 0)
  const nextRun = schedules
    .filter((s) => s.enabled && s.nextRunAt)
    .sort((a, b) => (a.nextRunAt! < b.nextRunAt! ? -1 : 1))[0]

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading title="Painel" subtitle="Visão geral dos teus servidores e backups" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Servidores" value={loading ? '—' : guilds.length} hint="com o bot ligado" />
        <StatCard label="Backups guardados" value={loading ? '—' : backups.length} hint={formatBytes(totalSize)} />
        <StatCard
          label="Agendamentos ativos"
          value={loading ? '—' : schedules.filter((s) => s.enabled).length}
          hint={nextRun ? `próximo ${formatRelativeDate(nextRun.nextRunAt as string)}` : 'nenhum agendado'}
        />
        <StatCard label="Backups automáticos" value={loading ? '—' : backups.filter((b) => b.origin === 'scheduled').length} hint="feitos por agendamento" />
      </div>

      <section>
        <SectionHeading
          title="Servidores"
          action={
            <Link to="/servidores" className="text-xs font-semibold text-accent hover:text-accent-hover">
              Ver todos →
            </Link>
          }
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {guilds.slice(0, 4).map((g) => (
            <Card key={g.id} className="flex items-center gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Server size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{g.name}</p>
                <p className="text-xs text-muted">{g.memberCount} membros</p>
              </div>
              {g.botIsAdmin ? <Badge tone="success">Admin</Badge> : <Badge tone="warning">Sem admin</Badge>}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          title="Backups recentes"
          action={
            <Link to="/backups" className="text-xs font-semibold text-accent hover:text-accent-hover">
              Ver todos →
            </Link>
          }
        />
        <div className="flex flex-col gap-2">
          {backups.slice(0, 5).map((b) => (
            <Card key={b.id} className="flex items-center gap-3 p-3.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Layers size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{b.guildName}</p>
                <p className="text-xs text-muted">
                  {b.channelCount} canais · {b.roleCount} cargos · {formatBytes(b.sizeBytes)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {b.origin === 'scheduled' && (
                  <Badge tone="accent">
                    <Clock3 size={10} className="mr-1 inline" />
                    Auto
                  </Badge>
                )}
                <span className="text-xs text-muted">{formatRelativeDate(b.createdAt)}</span>
              </div>
            </Card>
          ))}
          {!loading && backups.length === 0 && (
            <Card className="flex items-center gap-3 p-6 text-sm text-muted">
              <HardDrive size={18} className="text-faint" />
              Ainda não tens backups. Vai a Servidores e cria o primeiro.
            </Card>
          )}
        </div>
      </section>
    </div>
  )
}
