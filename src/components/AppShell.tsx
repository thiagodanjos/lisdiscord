import { ChevronDown, ChevronRight, LogOut, Search } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useUiStore } from '../store/ui'
import { bridge } from '../lib/bridge'
import { cn, initials } from '../lib/utils'
import { ALL_ITEMS, NAV, PINNED, SETTINGS_ITEM, findNavItem, type NavItem } from '../lib/nav'
import { PulseDot } from './ui'
import { LisFilmsMark } from './brand'
import { TitleBar } from './TitleBar'
import { CommandPalette } from './CommandPalette'
import type { AuthUser, BotStatus, RemoteBotConfig } from '../../shared/types'
import pkg from '../../package.json'
import { CREDIT_HANDLE } from '../../shared/branding'

const COLLAPSED_KEY = 'lisdiscord-nav-collapsed'

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function isActivePath(item: NavItem, pathname: string): boolean {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/** Um link da barra lateral — completo (ícone + nome) ou compacto (só o ícone, com o nome ao passar). */
function SideLink({ item, compact }: { item: NavItem; compact: boolean }) {
  const Icon = item.icon
  const lisfilms = item.to === '/lisfilms'
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={compact ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg text-[13.5px] transition-colors',
          compact ? 'size-10 justify-center' : 'px-3 py-[7px]',
          isActive ? 'bg-white/[0.07] font-semibold text-text' : 'text-muted hover:bg-white/[0.04] hover:text-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          {lisfilms ? (
            <LisFilmsMark size={17} plain className={cn(!isActive && 'opacity-80 group-hover:opacity-100')} />
          ) : (
            <Icon size={17} className={cn('shrink-0', isActive ? 'text-accent' : 'text-faint group-hover:text-muted')} />
          )}
          {!compact && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  )
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
  const compact = useUiStore((s) => s.sidebarCollapsed)
  const recent = useUiStore((s) => s.recent)
  const pushRecent = useUiStore((s) => s.pushRecent)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const location = useLocation()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed)
  const [remote, setRemote] = useState<RemoteBotConfig | null>(null)

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemote).catch(() => setRemote(null))
  }, [demoMode, location.pathname])

  // Guarda a página nos "Recentes".
  useEffect(() => {
    const item = findNavItem(location.pathname)
    if (item) pushRecent(item.to)
  }, [location.pathname, pushRecent])

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
  const accountName = demoMode ? 'demonstração' : (user?.username ?? 'sem conta')
  const statusInfo = demoMode
    ? { label: 'Demonstração', tone: 'demo' as const }
    : status?.connected
      ? { label: status.botTag ?? 'Online', tone: 'ok' as const }
      : isRemote
        ? { label: 'Bot remoto', tone: 'remote' as const }
        : { label: 'Bot parado', tone: 'off' as const }
  const toneClass = { ok: 'text-accent', remote: 'text-cyan', off: 'text-danger', demo: 'text-warning' }[statusInfo.tone]
  const recentItems = recent
    .map((p) => ALL_ITEMS.find((i) => i.to === p))
    .filter((i): i is NavItem => Boolean(i) && !PINNED.includes(i as NavItem))
    .filter((i) => !isActivePath(i, location.pathname))
    .slice(0, 4)

  return (
    <div className="app-backdrop flex h-screen flex-col overflow-hidden">
      <TitleBar shell status={statusInfo} />
      <div className="flex min-h-0 flex-1">
        <aside className={cn('flex shrink-0 flex-col transition-[width] duration-200', compact ? 'w-[60px] items-center' : 'w-64')}>
          <div className={cn('flex flex-col gap-0.5 pt-2', compact ? 'items-center' : 'px-2.5')}>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title={compact ? 'Pesquisar (Ctrl+K)' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg text-[13.5px] text-muted transition-colors hover:bg-white/[0.04] hover:text-text',
                compact ? 'size-10 justify-center' : 'px-3 py-[7px]',
              )}
            >
              <Search size={17} className="text-faint" />
              {!compact && <span className="flex-1 text-left">Pesquisar</span>}
              {!compact && <kbd className="font-mono text-[10px] text-faint">Ctrl K</kbd>}
            </button>
            {PINNED.map((item) => (
              <SideLink key={item.to} item={item} compact={compact} />
            ))}
          </div>

          <nav className={cn('mt-3 flex-1 overflow-y-auto pb-3', compact ? 'flex flex-col items-center gap-0.5' : 'px-2.5')}>
            {compact
              ? NAV.flatMap((s) => s.items).map((item) => <SideLink key={item.to} item={item} compact />)
              : NAV.map((section) => {
                  const isCollapsed = collapsed[section.id]
                  const hasActive = section.items.some((i) => isActivePath(i, location.pathname))
                  return (
                    <div key={section.id} className="mb-2">
                      <button
                        type="button"
                        onClick={() => toggle(section.id)}
                        className="group flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[12.5px] text-faint transition-colors hover:text-muted"
                      >
                        <span className={cn(hasActive && 'text-muted')}>{section.label}</span>
                        <span className="opacity-0 transition-opacity group-hover:opacity-100">{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</span>
                      </button>
                      {!isCollapsed && (
                        <div className="flex flex-col gap-0.5">
                          {section.items.map((item) => (
                            <SideLink key={item.to} item={item} compact={false} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

            {!compact && recentItems.length > 0 && (
              <div className="mt-1 mb-2">
                <p className="px-3 py-1.5 text-[12.5px] text-faint">Recentes</p>
                <div className="flex flex-col gap-0.5">
                  {recentItems.map((item) => (
                    <SideLink key={`r-${item.to}`} item={item} compact={false} />
                  ))}
                </div>
              </div>
            )}
          </nav>

          <div className={cn('flex flex-col gap-1 pb-3', compact ? 'items-center' : 'px-2.5')}>
            <SideLink item={SETTINGS_ITEM} compact={compact} />
            {compact ? (
              <div
                title={`${accountName} · ${statusInfo.label}`}
                className="mt-1 flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-accent/35 to-cyan/30 text-xs font-black text-text ring-1 ring-white/10"
              >
                {initials(accountName) || '?'}
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/[0.04]">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/35 to-cyan/30 text-xs font-black text-text ring-1 ring-white/10">
                  {initials(accountName) || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{accountName}</p>
                  <p className={cn('flex items-center gap-1.5 text-[11px]', toneClass)}>
                    <PulseDot />
                    <span className="truncate">{statusInfo.tone === 'ok' ? 'Online' : statusInfo.label}</span>
                  </p>
                </div>
                {!demoMode && user && (
                  <button onClick={onLogout} title="Terminar sessão" className="rounded-md p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger">
                    <LogOut size={15} />
                  </button>
                )}
              </div>
            )}
            {!compact && (
              <p className="px-2 pt-1 text-[10.5px] text-faint">
                v{pkg.version} · Created by <span className="text-brand-gradient font-semibold">{CREDIT_HANDLE}</span>
              </p>
            )}
          </div>
        </aside>

        <main className="content-panel min-w-0 flex-1 overflow-y-auto rounded-tl-2xl border-t border-l border-border">
          <div key={location.pathname} className="mx-auto max-w-[1400px] animate-fade-up px-8 py-8">
            {children}
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
