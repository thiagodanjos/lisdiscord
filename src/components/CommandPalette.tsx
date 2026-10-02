import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, History, Search } from 'lucide-react'
import { ALL_ITEMS, NAV, PINNED, SETTINGS_ITEM, normalize, type NavItem } from '../lib/nav'
import { useUiStore } from '../store/ui'
import { cn } from '../lib/utils'

// Pesquisa rápida (Ctrl+K): escreve parte do nome de uma página (sem acentos, tanto faz) e Enter.

function sectionOf(item: NavItem): string {
  if (PINNED.includes(item)) return 'Atalhos'
  if (item === SETTINGS_ITEM) return 'Sistema'
  return NAV.find((s) => s.items.includes(item))?.label ?? ''
}

export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const recent = useUiStore((s) => s.recent)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const results = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) {
      const recents = recent.map((p) => ALL_ITEMS.find((i) => i.to === p)).filter((i): i is NavItem => Boolean(i))
      return [...recents, ...ALL_ITEMS.filter((i) => !recents.includes(i))].slice(0, 12)
    }
    return ALL_ITEMS.map((item) => {
      const hay = normalize(`${item.label} ${sectionOf(item)} ${item.keywords ?? ''}`)
      const label = normalize(item.label)
      const score = label.startsWith(q) ? 3 : label.includes(q) ? 2 : hay.includes(q) ? 1 : 0
      return { item, score }
    })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item)
  }, [query, recent])

  if (!open) return null

  const go = (item: NavItem | undefined) => {
    if (!item) return
    setOpen(false)
    navigate(item.to)
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div className="w-full max-w-xl animate-pop overflow-hidden rounded-2xl border border-border bg-raised shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search size={16} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(results.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter') go(results[index])
            }}
            placeholder="Para onde queres ir?"
            className="h-12 flex-1 bg-transparent text-sm text-text placeholder:text-faint focus:shadow-none focus:outline-none"
          />
          <kbd className="rounded border border-border px-1.5 font-mono text-[10px] text-faint">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {!query && recent.length > 0 && (
            <p className="flex items-center gap-1.5 px-3 pt-1.5 pb-1 text-[11px] text-faint">
              <History size={11} /> Recentes primeiro
            </p>
          )}
          {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-faint">Nada encontrado para “{query}”.</p>}
          {results.map((item, i) => {
            const Icon = item.icon
            return (
              <button
                key={item.to}
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(item)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', i === index ? 'bg-accent/10 text-text' : 'text-muted')}
              >
                <Icon size={15} className={i === index ? 'text-accent' : 'text-faint'} />
                <span className="flex-1">{item.label}</span>
                <span className="text-[11px] text-faint">{sectionOf(item)}</span>
                {i === index && <CornerDownLeft size={12} className="text-faint" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
