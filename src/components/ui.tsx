import { AlertTriangle, Loader2, X } from 'lucide-react'
import { type ButtonHTMLAttributes, type ReactNode, forwardRef, useEffect } from 'react'
import { cn, initials } from '../lib/utils'

export function Logo({ size = 'md', version }: { size?: 'sm' | 'md' | 'lg'; version?: string }) {
  const text = { sm: 'text-base', md: 'text-lg', lg: 'text-3xl' }[size]
  const mark = { sm: 'size-7 text-xs', md: 'size-9 text-sm', lg: 'size-14 text-xl' }[size]
  return (
    <div className="flex items-center gap-3 select-none">
      <div
        className={cn(
          'relative flex shrink-0 items-center justify-center rounded-xl font-black text-black shadow-glow',
          'bg-gradient-to-br from-accent via-cyan to-violet',
          mark,
        )}
      >
        L
      </div>
      <div className="leading-tight">
        <p className={cn('font-extrabold tracking-tight', text)}>
          <span className="text-text">Lis</span>
          <span className="text-brand-gradient">Discord</span>
        </p>
        {version && <p className="font-mono text-[10px] text-faint">v{version}</p>}
      </div>
    </div>
  )
}

type ButtonVariant = 'primary' | 'dark' | 'ghost' | 'danger' | 'cyan'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
}

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-[#03140b] font-bold hover:bg-accent-hover shadow-[0_0_18px_rgb(34_229_132/0.28)] hover:shadow-[0_0_26px_rgb(34_229_132/0.5)]',
  dark: 'bg-white/[0.03] text-text border border-border hover:bg-white/[0.06] hover:border-border-strong',
  ghost: 'bg-transparent text-muted hover:text-text hover:bg-white/[0.04]',
  danger: 'bg-danger/10 text-danger border border-danger/35 hover:bg-danger/20 hover:shadow-[0_0_18px_rgb(244_63_94/0.25)]',
  cyan: 'bg-cyan/10 text-cyan border border-cyan/40 font-semibold hover:bg-cyan/20 hover:shadow-[0_0_18px_rgb(34_211_238/0.3)]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'primary', loading, className, children, disabled, ...rest }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none',
      buttonStyles[variant],
      className,
    )}
    {...rest}
  >
    {loading && <Loader2 size={14} className="animate-spin" />}
    {children}
  </button>
))
Button.displayName = 'Button'

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'cyan' | 'violet'

const toneStyles: Record<Tone, string> = {
  default: 'bg-white/[0.03] border-border text-muted',
  accent: 'bg-accent/10 border-accent/35 text-accent',
  success: 'bg-success/10 border-success/35 text-success',
  warning: 'bg-warning/10 border-warning/35 text-warning',
  danger: 'bg-danger/10 border-danger/35 text-danger',
  cyan: 'bg-cyan/10 border-cyan/35 text-cyan',
  violet: 'bg-violet/10 border-violet/35 text-violet',
}

export function Badge({ children, tone = 'default', pulse }: { children: ReactNode; tone?: Tone; pulse?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', toneStyles[tone])}>
      {pulse && <PulseDot />}
      {children}
    </span>
  )
}

/** Ponto de estado a "respirar" — herda a cor do texto à volta. */
export function PulseDot({ className }: { className?: string }) {
  return <span className={cn('inline-block size-1.5 shrink-0 rounded-full bg-current animate-pulse-dot', className)} />
}

export function Avatar({ name, color = '#22e584', size = 'md' }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-16 text-xl' }[size]
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ring-white/10', dims)}
      style={{ backgroundColor: `${color}22`, color, boxShadow: `0 0 14px ${color}22` }}
    >
      {initials(name)}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('glass rounded-2xl border border-border p-5 transition-colors hover:border-border-strong', className)}>{children}</div>
}

type StatTone = 'green' | 'amber' | 'pink' | 'violet' | 'cyan'

const statTones: Record<StatTone, { box: string; glow: string }> = {
  green: { box: 'text-accent border-accent/40 bg-accent/10', glow: 'rgb(34 229 132 / 0.25)' },
  amber: { box: 'text-amber border-amber/40 bg-amber/10', glow: 'rgb(245 181 61 / 0.22)' },
  pink: { box: 'text-pink border-pink/40 bg-pink/10', glow: 'rgb(244 63 126 / 0.22)' },
  violet: { box: 'text-violet border-violet/40 bg-violet/10', glow: 'rgb(168 85 247 / 0.25)' },
  cyan: { box: 'text-cyan border-cyan/40 bg-cyan/10', glow: 'rgb(34 211 238 / 0.22)' },
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'green',
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: typeof X
  tone?: StatTone
}) {
  const t = statTones[tone]
  return (
    <Card className="flex items-center gap-4 p-4">
      {Icon && (
        <div className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl border', t.box)} style={{ boxShadow: `0 0 22px ${t.glow}` }}>
          <Icon size={20} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{label}</p>
        <p className="font-mono text-2xl font-extrabold tracking-tight text-text">{value}</p>
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
      </div>
    </Card>
  )
}

/** Fila de "chips" de estado, como a barra por baixo dos cartões de estatística. */
export function StatChip({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <div className={cn('inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs', toneStyles[tone])}>
      <span className="font-medium opacity-90">{label}:</span>
      <span className="font-mono font-bold">{value}</span>
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-border bg-black/30 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'rounded-lg px-4 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase transition-all',
            value === t.id ? 'bg-white/[0.07] text-text shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]' : 'text-faint hover:text-muted',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/** Título grande de página (estilo "ANALYTICS HUB"). */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-text uppercase">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong/70 bg-white/[0.015] px-6 py-14 text-center">
      <p className="text-sm font-semibold text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        className={cn(
          'glass neon-ring flex max-h-[90vh] w-full animate-pop flex-col rounded-2xl border border-border',
          width === 'xl' ? 'max-w-6xl' : width === 'lg' ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-extrabold tracking-tight text-text">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-faint transition-colors hover:bg-white/5 hover:text-text">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  danger,
  confirmLabel = 'Confirmar',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  danger?: boolean
  confirmLabel?: string
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex gap-3">
        {danger && <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={20} />}
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="dark" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent shadow-[0_0_12px_rgb(34_229_132/0.45)]' : 'bg-border-strong',
        )}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
      </button>
      {label && <span className="text-sm text-text">{label}</span>}
    </label>
  )
}
