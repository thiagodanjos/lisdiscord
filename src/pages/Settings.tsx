import { useEffect, useState } from 'react'
import { CheckCircle2, FolderOpen, KeyRound, Lock, LogOut, PlayCircle, Power, ShieldCheck, UserRound, XCircle } from 'lucide-react'
import { bridge, isRealBridgeAvailable } from '../lib/bridge'
import { formatRelativeDate } from '../lib/format'
import { useUiStore } from '../store/ui'
import { Badge, Button, Card, ConfirmDialog, PageHeader, Toggle } from '../components/ui'
import { cleanIpcError } from '../lib/errors'
import type { AppSettings, AuthUser, BotStatus, LoginHistoryEntry } from '../../shared/types'

const DISCONNECTED: BotStatus = { connected: false, botTag: null, botAvatarUrl: null, guildCount: 0, messageContentEnabled: false, guildMembersEnabled: false }
const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

export default function Settings({
  status,
  onStatusChange,
  user,
  onLogout,
}: {
  status: BotStatus | null
  onStatusChange: (s: BotStatus) => void
  user: AuthUser | null
  onLogout: () => void
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [history, setHistory] = useState<LoginHistoryEntry[]>([])
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const [confirmForget, setConfirmForget] = useState(false)
  const demoMode = useUiStore((s) => s.demoMode)
  const setDemoMode = useUiStore((s) => s.setDemoMode)

  useEffect(() => {
    bridge.getSettings().then(setSettings)
    bridge.listLoginHistory().then(setHistory).catch(() => setHistory([]))
  }, [demoMode])

  async function disconnect() {
    await bridge.disconnectBot()
    onStatusChange(DISCONNECTED)
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setSavingPassword(true)
    setPasswordMsg(null)
    try {
      await bridge.changePassword(currentPassword, newPassword)
      setPasswordMsg({ ok: true, text: 'Palavra-passe alterada.' })
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setPasswordMsg({ ok: false, text: cleanIpcError(err) })
    } finally {
      setSavingPassword(false)
    }
  }

  async function forgetToken() {
    await bridge.forgetBotToken()
    onStatusChange(DISCONNECTED)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Definições" subtitle="Conta local, ligação ao bot e dados guardados neste computador" />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-text">
              <UserRound size={15} className="text-accent" />
              Conta
            </h3>
            <Badge tone="accent">
              <ShieldCheck size={11} />
              SQLite local
            </Badge>
          </div>
          <div>
            <p className="text-lg font-black text-text">{demoMode ? 'demonstração' : (user?.username ?? '—')}</p>
            {user && <p className="text-xs text-muted">Conta criada {formatRelativeDate(user.createdAt)}</p>}
          </div>
          {!demoMode && user && (
            <Button variant="danger" onClick={onLogout} className="self-start">
              <LogOut size={14} />
              Terminar sessão
            </Button>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            <Power size={15} className="text-accent" />
            Ligação ao bot
          </h3>
          {status?.connected ? (
            <>
              <div>
                <p className="font-mono text-sm font-semibold text-text">{status.botTag}</p>
                <p className="text-xs text-muted">
                  {status.guildCount} servidores
                  {!status.messageContentEnabled && ' · sem Message Content Intent'}
                  {!status.guildMembersEnabled && ' · sem Server Members Intent'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="dark" onClick={disconnect}>
                  <Power size={14} />
                  Desligar
                </Button>
                {!demoMode && (
                  <Button variant="danger" onClick={() => setConfirmForget(true)}>
                    <KeyRound size={14} />
                    Esquecer token
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">O bot não está ligado neste computador.</p>
          )}
        </Card>
      </div>

      {!demoMode && user && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <h3 className="flex items-center gap-2 text-sm font-bold text-text">
              <Lock size={15} className="text-accent" />
              Alterar palavra-passe
            </h3>
            <form onSubmit={changePassword} className="mt-4 flex flex-col gap-2.5">
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Palavra-passe atual" className={inputClass} />
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nova palavra-passe (mín. 6)" className={inputClass} />
              {passwordMsg && <p className={passwordMsg.ok ? 'text-xs text-success' : 'text-xs text-danger'}>{passwordMsg.text}</p>}
              <Button type="submit" loading={savingPassword} disabled={!currentPassword || newPassword.length < 6} className="self-start">
                Guardar
              </Button>
            </form>
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-text">Últimas entradas</h3>
            <div className="mt-3 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
              {history.length === 0 && <p className="text-xs text-muted">Sem registos.</p>}
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-1.5 text-xs">
                  <span className="flex items-center gap-2">
                    {h.success ? <CheckCircle2 size={13} className="text-success" /> : <XCircle size={13} className="text-danger" />}
                    {h.success ? 'Entrada' : 'Palavra-passe errada'}
                  </span>
                  <span className="text-faint">{formatRelativeDate(h.date)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Card className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            <PlayCircle size={15} className="text-accent" />
            Modo demonstração
          </h3>
          <p className="mt-1 text-xs text-muted">
            {isRealBridgeAvailable()
              ? 'Navega a app com dados fictícios, sem tocar no bot nem nos teus servidores reais.'
              : 'Estás a correr a interface fora do Electron — o modo demonstração fica sempre ativo.'}
          </p>
        </div>
        <Toggle checked={demoMode} onChange={setDemoMode} />
        {!isRealBridgeAvailable() && <Badge tone="warning">Forçado</Badge>}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-text">Dados guardados localmente</h3>
        <p className="font-mono text-xs break-all text-muted">{settings?.dataDir}</p>
        <p className="text-xs text-faint">Inclui a base de dados das contas (lisdiscord.sqlite), backups, transcripts e configurações.</p>
        <Button variant="dark" onClick={() => bridge.openDataDir()} className="self-start">
          <FolderOpen size={14} />
          Abrir pasta
        </Button>
      </Card>

      <ConfirmDialog
        open={confirmForget}
        onClose={() => setConfirmForget(false)}
        onConfirm={forgetToken}
        title="Esquecer o token do bot"
        description="O bot desliga e o token é apagado desta conta — da próxima vez vais ter de o colar outra vez."
        danger
        confirmLabel="Esquecer token"
      />
    </div>
  )
}
