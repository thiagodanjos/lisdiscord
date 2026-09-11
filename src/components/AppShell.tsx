import { Clock3, FileClock, Gauge, LayoutGrid, Server, Settings as SettingsIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useUiStore } from '../store/ui'
import { cn } from '../lib/utils'
import { Badge, Logo } from './ui'
import type { BotStatus } from '../../shared/types'

const NAV = [
  { to: '/', label: 'Painel', icon: Gauge, end: true },
  { to: '/servidores', label: 'Servidores', icon: Server },
  { to: '/backups', label: 'Backups', icon: LayoutGrid },
  { to: '/agendamentos', label: 'Agendamentos', icon: Clock3 },
  { to: '/transcripts', label: 'Transcripts', icon: FileClock },
]

export function AppShell({ children, status }: { children: ReactNode; status: BotStatus | null }) {
  const demoMode = useUiStore((s) => s.demoMode)

  return (
    <div className="flex h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar px-4 py-6">
        <div className="mb-8 px-2">
          <Logo />
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-card hover:text-text',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <NavLink
            to="/definicoes"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-card hover:text-text',
              )
            }
          >
            <SettingsIcon size={18} />
            Definições
          </NavLink>

          <div className="rounded-lg border border-border bg-card px-3 py-2.5">
            {demoMode ? (
              <Badge tone="warning">Modo demonstração</Badge>
            ) : status?.connected ? (
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-success" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-text">{status.botTag}</p>
                  <p className="text-[11px] text-muted">{status.guildCount} servidores</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-danger" />
                <p className="text-xs font-semibold text-text">Bot desligado</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
    </div>
  )
}
