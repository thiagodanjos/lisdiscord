import {
  Clock3,
  FileClock,
  Gamepad2,
  Gauge,
  Gift,
  LayoutGrid,
  Medal,
  MessageSquarePlus,
  MessageSquareWarning,
  ScrollText,
  Server,
  Settings as SettingsIcon,
  ShieldAlert,
  Target,
  TrendingUp,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useUiStore } from '../store/ui'
import { cn } from '../lib/utils'
import { Badge, Logo } from './ui'
import type { BotStatus } from '../../shared/types'

const NAV_TOP = [{ to: '/', label: 'Painel', icon: Gauge, end: true }]

const NAV_BACKUPS = [
  { to: '/servidores', label: 'Servidores', icon: Server },
  { to: '/backups', label: 'Backups', icon: LayoutGrid },
  { to: '/agendamentos', label: 'Agendamentos', icon: Clock3 },
  { to: '/transcripts', label: 'Transcripts', icon: FileClock },
]

const NAV_SERVER = [
  { to: '/mensagens', label: 'Mensagens', icon: MessageSquarePlus },
  { to: '/moderacao', label: 'Moderação', icon: ShieldAlert },
  { to: '/sorteios', label: 'Sorteios', icon: Gift },
  { to: '/jogos', label: 'Jogos', icon: Gamepad2 },
  { to: '/pontos-mov', label: 'Pontos MOV', icon: Medal },
  { to: '/logs-pontos', label: 'Logs de pontos', icon: ScrollText },
  { to: '/justificativas', label: 'Justificativas', icon: MessageSquareWarning },
  { to: '/upamentos', label: 'Upamentos', icon: TrendingUp },
  { to: '/metas', label: 'Metas', icon: Target },
]

export function AppShell({ children, status }: { children: ReactNode; status: BotStatus | null }) {
  const demoMode = useUiStore((s) => s.demoMode)

  return (
    <div className="flex h-screen">
      <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar px-4 py-6">
        <div className="mb-6 px-2">
          <Logo />
        </div>

        <NavGroup items={NAV_TOP} />
        <NavGroup label="Backups" items={NAV_BACKUPS} />
        <NavGroup label="Servidor" items={NAV_SERVER} />

        <div className="mt-auto flex flex-col gap-3 pt-4">
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

interface NavItem {
  to: string
  label: string
  icon: typeof Gauge
  end?: boolean
}

function NavGroup({ label, items }: { label?: string; items: NavItem[] }) {
  return (
    <div className="mb-2">
      {label && <p className="mb-1 px-3 text-[10px] font-bold tracking-wider text-faint uppercase">{label}</p>}
      <nav className="flex flex-col gap-1">
        {items.map(({ to, label: itemLabel, icon: Icon, end }) => (
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
            {itemLabel}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
