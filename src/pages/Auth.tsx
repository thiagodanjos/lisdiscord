import { useState } from 'react'
import { Database, Eye, EyeOff, Lock, PlayCircle, ShieldCheck, User } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { useUiStore } from '../store/ui'
import { cn } from '../lib/utils'
import { cleanIpcError } from '../lib/errors'
import { Button, Logo, Tabs, Toggle } from '../components/ui'
import type { AuthState } from '../../shared/types'
import pkg from '../../package.json'
import { CREDIT_HANDLE } from '../../shared/branding'

/** Fundo animado partilhado pelos ecrãs antes de entrar na app (login, ligação do bot). */
export function AuthBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-backdrop relative flex h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-32 -left-24 size-[420px] animate-float rounded-full bg-accent/15 blur-[110px]" />
      <div className="pointer-events-none absolute -right-24 bottom-[-120px] size-[460px] animate-float rounded-full bg-violet/15 blur-[120px] [animation-delay:-3s]" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 size-[280px] animate-float rounded-full bg-cyan/10 blur-[100px] [animation-delay:-5s]" />
      <div className="relative z-10 w-full max-w-md animate-pop">{children}</div>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-border bg-black/30 py-2.5 pr-3 pl-9 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

export default function Auth({ hasAccount, onAuthenticated }: { hasAccount: boolean; onAuthenticated: (state: AuthState) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>(hasAccount ? 'login' : 'register')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const setDemoMode = useUiStore((s) => s.setDemoMode)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (mode === 'register' && password !== confirm) {
      setError('As palavras-passe não coincidem.')
      return
    }
    setLoading(true)
    try {
      const state = mode === 'login' ? await bridge.login(username, password, remember) : await bridge.register(username, password, remember)
      onAuthenticated(state)
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthBackdrop>
      <div className="glass neon-ring rounded-2xl border border-border p-8">
        <div className="flex items-center justify-between">
          <Logo size="md" version={pkg.version} />
          <span className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-accent uppercase">
            <ShieldCheck size={11} />
            Local
          </span>
        </div>

        <h1 className="mt-7 text-2xl font-black tracking-tight uppercase">{mode === 'login' ? 'Bem-vindo de volta' : 'Criar conta local'}</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === 'login'
            ? 'Entra na tua conta — o bot liga-se sozinho com o token guardado.'
            : 'Cria uma conta neste computador. O token do bot fica guardado nela, encriptado, e não o voltas a colar.'}
        </p>

        {hasAccount && (
          <div className="mt-5">
            <Tabs
              tabs={[
                { id: 'login', label: 'Entrar' },
                { id: 'register', label: 'Nova conta' },
              ]}
              value={mode}
              onChange={(m) => {
                setMode(m)
                setError('')
              }}
            />
          </div>
        )}

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          <div>
            <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Utilizador</label>
            <div className="relative mt-1.5">
              <User size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ex.: thiago" autoFocus autoComplete="username" className={inputClass} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Palavra-passe</label>
            <div className="relative mt-1.5">
              <Lock size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="mínimo 6 caracteres"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className={cn(inputClass, 'pr-10')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-faint hover:text-text"
                title={showPassword ? 'Esconder' : 'Mostrar'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Confirmar palavra-passe</label>
              <div className="relative mt-1.5">
                <Lock size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div className="mt-1">
            <Toggle checked={remember} onChange={setRemember} label="Manter sessão iniciada neste computador" />
          </div>

          {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

          <Button type="submit" loading={loading} disabled={!username.trim() || !password} className="mt-1 py-2.5 tracking-wide uppercase">
            {mode === 'login' ? 'Entrar' : 'Criar conta e entrar'}
          </Button>
        </form>

        <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-border bg-black/20 p-3 text-[11px] text-faint">
          <Database size={14} className="mt-0.5 shrink-0 text-cyan" />
          <p>
            As contas ficam numa base de dados SQLite só deste computador. A palavra-passe nunca é guardada (só um hash) e o token do bot é
            encriptado pelo sistema operativo.
          </p>
        </div>

        <button
          onClick={() => setDemoMode(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 text-xs font-semibold text-muted transition-colors hover:text-text"
        >
          <PlayCircle size={14} />
          Só explorar em modo demonstração
        </button>
      </div>
      <p className="mt-4 text-center text-[11px] text-faint">
        Created by <span className="font-bold text-brand-gradient">{CREDIT_HANDLE}</span>
      </p>
    </AuthBackdrop>
  )
}

/** Ecrã de espera enquanto o bot liga com o token guardado. */
export function ConnectingScreen({ username }: { username: string }) {
  return (
    <AuthBackdrop>
      <div className="glass neon-ring flex flex-col items-center rounded-2xl border border-border p-10 text-center">
        <div className="relative flex size-20 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
          <span className="absolute inset-2 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          <Logo size="sm" />
        </div>
        <h2 className="mt-6 text-lg font-black tracking-tight uppercase">A ligar o bot…</h2>
        <p className="mt-1 text-sm text-muted">
          Olá, <span className="font-semibold text-text">{username}</span> — a usar o token guardado na tua conta.
        </p>
      </div>
    </AuthBackdrop>
  )
}
