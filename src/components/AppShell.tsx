import {
  ListOrdered,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Eraser,
  FileClock,
  Gamepad2,
  Gift,
  History,
  Home,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Medal,
  Megaphone,
  MessageSquarePlus,
  MessageSquareWarning,
  Radio,
  ScrollText,
  Server,
  Settings as SettingsIcon,
  ShieldAlert,
  Smile,
  Target,
  Timer,
  TrendingUp,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useUiStore } from '../store/ui'
import { bridge } from '../lib/bridge'
import { cn, initials } from '../lib/utils'
import { Logo, PulseDot } from './ui'
import type { AuthUser, BotStatus, RemoteBotConfig } from '../../shared/types'
import pkg from '../../package.json'
import { CREDIT_HANDLE } from '../../shared/branding'

interface NavItem {
  to: string
  label: string
  icon: typeof Home
  end?: boolean
}

interface NavSection {
  id: string
  label: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    id: 'geral',
    label: 'Geral',
    items: [
      { to: '/', label: 'Visão Geral', icon: LayoutDashboard, end: true },
      { to: '/servidores', label: 'Servidores', icon: Server },
    ],
  },
  {
    id: 'comunicacao',
    label: 'Comunicação',
    items: [
      { to: '/mensagens', label: 'Mensagens & Embeds', icon: MessageSquarePlus },
      { to: '/avisos-mov', label: 'Avisos MOV', icon: Megaphone },
      { to: '/emojis', label: 'Emojis do bot', icon: Smile },
      { to: '/sorteios', label: 'Sorteios', icon: Gift },
      { to: '/jogos', label: 'Jogos', icon: Gamepad2 },
    ],
  },
  {
    id: 'pontos',
    label: 'Mov. Call · Pontos',
    items: [
      { to: '/pontos-mov', label: 'Pontos MOV', icon: Medal },
      { to: '/logs-pontos', label: 'Logs de pontos', icon: ScrollText },
    ],
  },
  {
    id: 'horas',
    label: 'Mov. Call · Horas',
    items: [
      { to: '/horas-mov', label: 'Horas MOV', icon: Timer },
      { to: '/logs-horas', label: 'Logs de horas', icon: History },
    ],
  },
  {
    id: 'equipa',
    label: 'Equipa',
    items: [
      { to: '/listagem-mov', label: 'Listagem Mov Call', icon: ListOrdered },
      { to: '/verificacao', label: 'Verificação', icon: BadgeCheck },
      { to: '/justificativas', label: 'Justificativas', icon: MessageSquareWarning },
      { to: '/metas', label: 'Metas', icon: Target },
      { to: '/upamentos', label: 'Upamentos', icon: TrendingUp },
    ],
  },
  {
    id: 'moderacao',
    label: 'Moderação & Limpeza',
    items: [
      { to: '/moderacao', label: 'Moderação', icon: ShieldAlert },
      { to: '/logs-limpeza', label: 'Logs de limpeza', icon: Eraser },
      { to: '/canais-log', label: 'Canais de log', icon: ScrollText },
    ],
  },
  {
    id: 'backups',
    label: 'Backups',
    items: [
      { to: '/backups', label: 'Backups', icon: LayoutGrid },
      { to: '/agendamentos', label: 'Agendamentos', icon: Clock3 },
      { to: '/transcripts', label: 'Transcripts', icon: FileClock },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    items: [{ to: '/definicoes', label: 'Definições', icon: SettingsIcon }],
  },
]

const COLLAPSED_KEY = 'lisdiscord-nav-collapsed'

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function pageLabel(pathname: string): string {
  const all = NAV.flatMap((s) => s.items)
  const exact = all.find((i) => i.to === pathname)
  if (exact) return exact.label
  const prefix = all.filter((i) => i.to !== '/' && pathname.startsWith(i.to)).sort((a, b) => b.to.length - a.to.length)[0]
  return prefix?.label ?? 'Visão Geral'
}

export function AppShell({
  children,
  status,
  user,
  onLogout,
}: {
  children: ReactNode
  status: BotStatus | null
  user: AuthUser | null
  onLogout: () => void
}) {
  const demoMode = useUiStore((s) => s.demoMode)
  const location = useLocation()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed)
  const [remote, setRemote] = useState<RemoteBotConfig | null>(null)
  const [startedAt] = useState(() => Date.now())
  const [uptime, setUptime] = useState('00:00:00')

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemote).catch(() => setRemote(null))
  }, [demoMode, location.pathname])

  useEffect(() => {
    const tick = () => {
      const s = Math.floor((Date.now() - startedAt) / 1000)
      setUptime([Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':'))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
      } catch {
        // sem localStorage — fica só nesta sessão
      }
      return next
    })
  }

  const isRemote = Boolean(remote?.url && remote.hasApiKey)
  const connected = demoMode || Boolean(status?.connected)
  const accountName = demoMode ? 'demonstração' : (user?.username ?? 'sem conta')

  return (
    <div className="app-backdrop flex h-screen overflow-hidden">
      <aside className="relative z-10 flex w-64 shrink-0 flex-col border-r border-border bg-sidebar/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-5 pt-6 pb-5">
          <Logo version={pkg.version} />
          <span className={cn('size-2 rounded-full', connected ? 'text-accent' : 'text-danger')}>
            <PulseDot className="size-2" />
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((section) => {
            const isCollapsed = collapsed[section.id]
            const hasActive = section.items.some((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))
            return (
              <div key={section.id} className="mb-3">
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-faint uppercase transition-colors hover:text-muted"
                >
                  <span className={cn(hasActive && 'text-accent/80')}>{section.label}</span>
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
                {!isCollapsed && (
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {section.items.map(({ to, label, icon: Icon, end }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={end}
                        className={({ isActive }) =>
                          cn(
                            'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all',
                            isActive
                              ? 'bg-gradient-to-r from-accent/[0.14] to-transparent text-text shadow-[inset_0_0_0_1px_rgb(34_229_132/0.18)]'
                              : 'text-muted hover:bg-white/[0.035] hover:text-text',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-accent shadow-glow" />}
                            <Icon size={16} className={cn('shrink-0 transition-colors', isActive ? 'text-accent' : 'text-faint group-hover:text-muted')} />
                            <span className="truncate">{label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="glass flex items-center gap-3 rounded-xl border border-border p-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/30 to-violet/30 text-xs font-black text-text ring-1 ring-white/10">
              {initials(accountName) || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-text">{accountName}</p>
              <p
                className={cn(
                  'flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase',
                  demoMode ? 'text-warning' : status?.connected ? 'text-accent' : isRemote ? 'text-cyan' : 'text-danger',
                )}
              >
                <PulseDot />
                {demoMode ? 'Demonstração' : status?.connected ? 'Online' : isRemote ? 'Bot remoto' : 'Parado'}
              </p>
            </div>
            {!demoMode && user && (
              <button onClick={onLogout} title="Terminar sessão" className="rounded-md p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger">
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-bg/60 px-8 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Home size={15} className="shrink-0 text-faint" />
            <ChevronRight size={13} className="shrink-0 text-faint" />
            <span className="truncate font-semibold text-text">{pageLabel(location.pathname)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isRemote && (
              <span className="flex items-center gap-1.5 rounded-full border border-cyan/35 bg-cyan/10 px-3 py-1 text-[10px] font-bold tracking-wider text-cyan uppercase">
                <Radio size={11} />
                Bot remoto
              </span>
            )}
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold tracking-wider uppercase',
                connected ? 'border-accent/35 bg-accent/10 text-accent' : 'border-danger/35 bg-danger/10 text-danger',
              )}
            >
              <PulseDot />
              {connected ? 'Tempo real' : 'Desligado'}
            </span>
            {status?.connected && status.botTag && (
              <span className="hidden rounded-full border border-border bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-muted xl:inline">{status.botTag}</span>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div key={location.pathname} className="mx-auto max-w-[1400px] animate-fade-up">
            {children}
          </div>
        </main>

        <footer className="flex h-9 shrink-0 items-center justify-between border-t border-border bg-bg/60 px-8 text-[11px] text-faint backdrop-blur-xl">
          <span>
            LisDiscord • v{pkg.version} © {new Date().getFullYear()} ·{' '}
            <span className="font-semibold text-muted">
              Created by <span className="text-brand-gradient">{CREDIT_HANDLE}</span>
            </span>
          </span>
          <span className="font-mono">Tempo de atividade: {uptime}</span>
        </footer>
      </div>
    </div>
  )
}
