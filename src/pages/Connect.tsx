import { ExternalLink, KeyRound, PlayCircle } from 'lucide-react'
import { useState } from 'react'
import { bridge } from '../lib/bridge'
import { useUiStore } from '../store/ui'
import { Button, Logo } from '../components/ui'
import type { BotStatus } from '../../shared/types'

export default function Connect({ onConnected }: { onConnected: (status: BotStatus) => void }) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setDemoMode = useUiStore((s) => s.setDemoMode)

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    setLoading(true)
    setError(null)
    try {
      const status = await bridge.connectBot(token.trim())
      onConnected(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ligar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-card">
        <Logo size="lg" />
        <p className="mt-3 text-sm text-muted">
          Liga um bot que já administres nos teus servidores para começares a fazer backups. Nada é enviado para
          fora do teu computador.
        </p>

        <form onSubmit={connect} className="mt-6 flex flex-col gap-3">
          <label className="text-xs font-semibold tracking-wide text-faint uppercase">Token do bot</label>
          <div className="relative">
            <KeyRound size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Cola aqui o token do teu bot"
              autoComplete="off"
              className="w-full rounded-lg border border-border bg-raised py-2.5 pr-3 pl-9 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <Button type="submit" loading={loading} disabled={!token.trim()}>
            Ligar
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

        <div className="mt-6 border-t border-border pt-5">
          <button
            onClick={() => setDemoMode(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-raised px-4 py-2.5 text-sm font-semibold text-text hover:border-border-strong"
          >
            <PlayCircle size={16} />
            Só explorar em modo demonstração
          </button>
          <p className="mt-2 text-center text-[11px] text-faint">Sem bot, sem token — dados fictícios só para conheceres a app.</p>
        </div>
      </div>
    </div>
  )
}
