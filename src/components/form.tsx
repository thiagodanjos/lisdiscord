import type { ReactNode } from 'react'
import { Radio, type LucideIcon } from 'lucide-react'
import { Badge } from './ui'
import { inputClass } from '../lib/styles'
import type { GuildSummary, RolePickerEntry } from '../../shared/types'

// Pequenas peças de formulário partilhadas pelas páginas de configuração.

export function Label({ children }: { children: ReactNode }) {
  return <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{children}</label>
}

export function Tokens({ tokens }: { tokens: readonly string[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tokens.map((t) => (
        <code key={t} className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-accent">
          {t}
        </code>
      ))}
    </div>
  )
}

export function SectionTitle({ icon: Icon, title, subtitle, action }: { icon: LucideIcon; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon size={17} />
        </div>
        <div>
          <h3 className="text-sm font-black tracking-wide uppercase">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function GuildSelect({ guilds, value, onChange }: { guilds: GuildSummary[]; value: string; onChange: (id: string) => void }) {
  return (
    <div>
      <Label>Servidor</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`mt-1.5 block w-72 ${inputClass}`}>
        {guilds.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export function RemoteBadge({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Badge tone="cyan">
      <Radio size={11} /> A usar o bot remoto
    </Badge>
  )
}

/** Escolher vários cargos clicando nas "pílulas". */
export function RolePills({ roles, value, onChange, empty }: { roles: RolePickerEntry[]; value: string[]; onChange: (ids: string[]) => void; empty?: string }) {
  if (roles.length === 0) return <p className="text-xs text-faint">{empty ?? 'Sem cargos.'}</p>
  return (
    <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-black/20 p-2">
      {roles.map((r) => {
        const on = value.includes(r.id)
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(on ? value.filter((id) => id !== r.id) : [...value, r.id])}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:text-text'}`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: r.color === '#000000' ? '#99aab5' : r.color }} />
            {r.name}
            {on && <span>✓</span>}
          </button>
        )
      })}
    </div>
  )
}
