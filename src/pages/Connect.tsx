import { ExternalLink, KeyRound, LogOut, Radio } from 'lucide-react'
import { useEffect, useState } from 'react'
import { bridge } from '../lib/bridge'
import { Button, Logo } from '../components/ui'
import { AuthBackdrop } from './Auth'
import { cleanIpcError } from '../lib/errors'
import type { BotStatus, RemoteBotConfig } from '../../shared/types'

export default function Connect({
  username,
  initialError,
  onConnected,
  onSkip,
  onLogout,
}: {
  username: string | null
  initialError?: string
  onConnected: (status: BotStatus) => void
  onSkip: () => void
  onLogout: () => void
}) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [remote, setRemote] = useState<RemoteBotConfig | null>(null)

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemote).catch(() => setRemote(null))
  }, [])

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    setLoading(true)
    setError(null)
    try {
      onConnected(await bridge.connectBot(token.trim()))
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setLoading(false)
    }
  }

  const hasRemote = Boolean(remote?.url && remote.hasApiKey)

  return (
    <AuthBackdrop>
      <div className="glass neon-ring rounded-2xl border border-border p-8">
        <div className="flex items-center justify-between">
          <Logo />
          <button onClick={onLogout} className="flex items-center gap-1.5 text-xs font-semibold text-faint transition-colors hover:text-danger">
            <LogOut size={13} />
            Sair
          </button>
        </div>

        <h1 className="mt-7 text-2xl font-black tracking-tight uppercase">Ligar o bot</h1>
        <p className="mt-1 text-sm text-muted">
          {username ? (
            <>
              Olá, <span className="font-semibold text-text">{username}</span>. Cola o token do teu bot uma vez — fica guardado nesta conta, encriptado,
              e das próximas vezes a app liga sozinha.
            </>
          ) : (
            'Cola o token do teu bot para ligar.'
          )}
        </p>

        <form onSubmit={connect} className="mt-6 flex flex-col gap-3">
          <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Token do bot</label>
          <div className="relative">
            <KeyRound size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Cola aqui o token do teu bot"
              autoComplete="off"
              autoFocus
              className="w-full rounded-lg border border-border bg-black/30 py-2.5 pr-3 pl-9 font-mono text-sm text-text placeholder:font-sans placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>

          {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

          <Button type="submit" loading={loading} disabled={!token.trim()} className="py-2.5 tracking-wide uppercase">
            Ligar e guardar
          </Button>
        </form>

        <a
          href="https://discord.com/developers/applications"
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-muted hover:text-text"
        >
          Como criar um bot e obter o token
          <ExternalLink size={12} />
        </a>

        {hasRemote && (
          <div className="mt-6 border-t border-border pt-5">
            <Button variant="cyan" onClick={onSkip} className="w-full">
              <Radio size={14} />
              Continuar só com o bot remoto
            </Button>
            <p className="mt-2 text-center text-[11px] text-faint">Tens um bot remoto configurado ({remote?.url}) — as páginas que o usam funcionam sem ligar o bot aqui.</p>
          </div>
        )}
      </div>
    </AuthBackdrop>
  )
}
