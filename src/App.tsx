import { useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { bridge } from './lib/bridge'
import { useUiStore } from './store/ui'
import Auth, { ConnectingScreen } from './pages/Auth'
import { cleanIpcError } from './lib/errors'
import Connect from './pages/Connect'
import Dashboard from './pages/Dashboard'
import Servers from './pages/Servers'
import Backups from './pages/Backups'
import BackupDetail from './pages/BackupDetail'
import Diff from './pages/Diff'
import Scheduler from './pages/Scheduler'
import Transcripts from './pages/Transcripts'
import TranscriptDetail from './pages/TranscriptDetail'
import Messaging from './pages/Messaging'
import Moderation from './pages/Moderation'
import Giveaways from './pages/Giveaways'
import Games from './pages/Games'
import MovPoints from './pages/MovPoints'
import PointsLog from './pages/PointsLog'
import MovHours from './pages/MovHours'
import CleanLog from './pages/CleanLog'
import Justifications from './pages/Justifications'
import Emojis from './pages/Emojis'
import Goals from './pages/Goals'
import Promotions from './pages/Promotions'
import SettingsPage from './pages/Settings'
import type { AuthState, BotStatus } from '../shared/types'

type Phase = 'loading' | 'auth' | 'connecting' | 'ready'

export default function App() {
  const demoMode = useUiStore((s) => s.demoMode)
  const [phase, setPhase] = useState<Phase>('loading')
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [connectError, setConnectError] = useState<string | undefined>()
  const [skipLocalBot, setSkipLocalBot] = useState(false)

  const afterLogin = useCallback(async (state: AuthState) => {
    setAuth(state)
    const current = await bridge.getStatus()
    if (current.connected || !state.hasBotToken) {
      setStatus(current)
      setPhase('ready')
      return
    }
    setPhase('connecting')
    try {
      setStatus(await bridge.autoConnectBot())
      setConnectError(undefined)
    } catch (err) {
      setStatus(current)
      setConnectError(`Não consegui ligar com o token guardado: ${cleanIpcError(err)}`)
    }
    setPhase('ready')
  }, [])

  useEffect(() => {
    setPhase('loading')
    bridge
      .getAuthState()
      .then((state) => {
        if (!state.user) {
          setAuth(state)
          setPhase('auth')
          return
        }
        return afterLogin(state)
      })
      .catch(() => setPhase('auth'))
  }, [demoMode, afterLogin])

  async function logout() {
    await bridge.logout().catch(() => undefined)
    setStatus(null)
    setSkipLocalBot(false)
    setConnectError(undefined)
    setAuth((a) => (a ? { ...a, user: null, hasBotToken: false } : a))
    setPhase('auth')
  }

  if (phase === 'loading') return <div className="app-backdrop h-screen" />
  if (phase === 'auth') return <Auth hasAccount={auth?.hasAccount ?? false} onAuthenticated={afterLogin} />
  if (phase === 'connecting') return <ConnectingScreen username={auth?.user?.username ?? ''} />

  if (!demoMode && !status?.connected && !skipLocalBot) {
    return (
      <Connect
        username={auth?.user?.username ?? null}
        initialError={connectError}
        onConnected={(s) => {
          setConnectError(undefined)
          setStatus(s)
        }}
        onSkip={() => setSkipLocalBot(true)}
        onLogout={logout}
      />
    )
  }

  return (
    <AppShell status={status} user={auth?.user ?? null} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Dashboard status={status} />} />
        <Route path="/servidores" element={<Servers />} />
        <Route path="/backups" element={<Backups />} />
        <Route path="/backups/comparar" element={<Diff />} />
        <Route path="/backups/:id" element={<BackupDetail />} />
        <Route path="/agendamentos" element={<Scheduler />} />
        <Route path="/transcripts" element={<Transcripts />} />
        <Route path="/transcripts/:id" element={<TranscriptDetail />} />
        <Route path="/mensagens" element={<Messaging />} />
        <Route path="/moderacao" element={<Moderation />} />
        <Route path="/logs-limpeza" element={<CleanLog />} />
        <Route path="/sorteios" element={<Giveaways />} />
        <Route path="/jogos" element={<Games />} />
        <Route path="/pontos-mov" element={<MovPoints />} />
        <Route path="/logs-pontos" element={<PointsLog key="points" mode="points" />} />
        <Route path="/horas-mov" element={<MovHours />} />
        <Route path="/logs-horas" element={<PointsLog key="hours" mode="hours" />} />
        <Route path="/justificativas" element={<Justifications />} />
        <Route path="/emojis" element={<Emojis />} />
        <Route path="/upamentos" element={<Promotions />} />
        <Route path="/metas" element={<Goals />} />
        <Route path="/definicoes" element={<SettingsPage status={status} onStatusChange={setStatus} user={auth?.user ?? null} onLogout={logout} />} />
      </Routes>
    </AppShell>
  )
}
