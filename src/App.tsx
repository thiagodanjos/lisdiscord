import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { bridge } from './lib/bridge'
import { useUiStore } from './store/ui'
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
import SettingsPage from './pages/Settings'
import type { BotStatus } from '../shared/types'

export default function App() {
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [checking, setChecking] = useState(true)
  const demoMode = useUiStore((s) => s.demoMode)

  useEffect(() => {
    bridge.getStatus().then((s) => {
      setStatus(s)
      setChecking(false)
    })
  }, [demoMode])

  if (checking) return null

  if (!demoMode && !status?.connected) {
    return <Connect onConnected={setStatus} />
  }

  return (
    <AppShell status={status}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/servidores" element={<Servers />} />
        <Route path="/backups" element={<Backups />} />
        <Route path="/backups/comparar" element={<Diff />} />
        <Route path="/backups/:id" element={<BackupDetail />} />
        <Route path="/agendamentos" element={<Scheduler />} />
        <Route path="/transcripts" element={<Transcripts />} />
        <Route path="/transcripts/:id" element={<TranscriptDetail />} />
        <Route path="/mensagens" element={<Messaging />} />
        <Route path="/moderacao" element={<Moderation />} />
        <Route path="/sorteios" element={<Giveaways />} />
        <Route path="/jogos" element={<Games />} />
        <Route path="/definicoes" element={<SettingsPage status={status} onStatusChange={setStatus} />} />
      </Routes>
    </AppShell>
  )
}
