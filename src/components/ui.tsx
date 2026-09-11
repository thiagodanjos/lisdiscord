import { AlertTriangle, Loader2, X } from 'lucide-react'
import { type ButtonHTMLAttributes, type ReactNode, forwardRef, useEffect } from 'react'
import { cn } from '../lib/utils'

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const text = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl' }[size]
  const dot = { sm: 'size-2', md: 'size-3', lg: 'size-4' }[size]
  return (
    <div className="flex items-center gap-2 select-none">
      <span className={cn('rounded-full bg-accent shadow-glow', dot)} />
      <span className={cn('font-extrabold tracking-tight leading-none', text)}>
        <span className="text-text">Lis</span>
        <span className="text-accent">Discord</span>
      </span>
    </div>
  )
}

type ButtonVariant = 'primary' | 'dark' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
}

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white font-semibold hover:bg-accent-hover hover:shadow-glow',
  dark: 'bg-card text-text border border-border hover:bg-card-hover hover:border-border-strong',
  ghost: 'bg-transparent text-muted hover:text-text hover:bg-card',
  danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        buttonStyles[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' }) {
  const styles = {
    default: 'bg-card border-border text-muted',
    accent: 'bg-accent-soft border-accent/40 text-accent',
    success: 'bg-success/10 border-success/40 text-success',
    warning: 'bg-warning/10 border-warning/40 text-warning',
    danger: 'bg-danger/10 border-danger/40 text-danger',
  }[tone]
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', styles)}>
      {children}
    </span>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border border-border bg-card p-5 shadow-card', className)}>{children}</div>
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-semibold tracking-wide text-faint uppercase">{label}</span>
      <span className="text-2xl font-extrabold text-text">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </Card>
  )
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <p className="text-sm font-semibold text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: 'md' | 'lg' }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex max-h-[85vh] w-full flex-col rounded-2xl border border-border bg-raised shadow-card',
          width === 'lg' ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-bold text-text">{title}</h3>
          <button onClick={onClose} className="text-faint hover:text-text">
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
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-border-strong')}
      >
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-white transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
      {label && <span className="text-sm text-text">{label}</span>}
    </label>
  )
}
