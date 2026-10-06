import { useEffect, useState } from 'react'
import { Ban, Camera, DoorOpen, Server, ShieldAlert } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { inputClass } from '../lib/styles'
import { Badge, Button, Card, Modal, PageHeader, Toggle } from '../components/ui'
import { RemoteBadge } from '../components/form'
import type { GuildSummary, RemoteBotConfig } from '../../shared/types'

export default function Servers() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState<GuildSummary | null>(null)
  const [includeBans, setIncludeBans] = useState(false)
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<string | null>(null)
  const [remote, setRemote] = useState<RemoteBotConfig | null>(null)
  const [leaving, setLeaving] = useState<GuildSummary | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const isRemote = Boolean(remote?.url && remote.hasApiKey)

  useEffect(() => {
    bridge
      .getRemoteBotConfig()
      .then(setRemote)
      .catch(() => setRemote({ url: null, hasApiKey: false }))
  }, [])

  useEffect(() => {
    if (!remote) return
    ;(isRemote ? bridge.listRemoteGuilds : bridge.listGuilds)()
      .then((g) => setGuilds(g))
      .catch((err) => setError(cleanIpcError(err)))
      .finally(() => setLoading(false))
  }, [remote, isRemote])

  async function leave() {
    if (!leaving) return
    setLeaveBusy(true)
    setError('')
    try {
      const r = await bridge.leaveGuild(leaving.id, isRemote)
      setGuilds((list) => list.filter((g) => g.id !== leaving.id))
      setNote(`O bot saiu de ${r.name || leaving.name}. Para voltar, convida-o outra vez.`)
      setLeaving(null)
      setConfirmName('')
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setLeaveBusy(false)
    }
  }

  async function createBackup() {
    if (!target) return
    setCreating(true)
    try {
      await bridge.createBackup(target.id, { includeBans, origin: 'manual' })
      setJustCreated(target.id)
      setTimeout(() => setJustCreated(null), 3000)
    } finally {
      setCreating(false)
      setTarget(null)
      setIncludeBans(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Servidores" subtitle="Servidores onde o bot está presente — faz backup ou tira o bot de um servidor" action={<RemoteBadge show={isRemote} />} />
      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">❌ {error}</p>}
      {note && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">✅ {note}</p>}

      {!loading && guilds.length === 0 && (
        <Card className="p-6 text-sm text-muted">O bot ainda não está em nenhum servidor. Convida-o primeiro.</Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {guilds.map((g) => (
          <Card key={g.id} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Server size={20} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{g.name}</p>
                <p className="text-xs text-muted">{g.memberCount} membros</p>
              </div>
            </div>

            {g.botIsAdmin ? (
              <Badge tone="success">Bot com permissões de admin</Badge>
            ) : (
              <div className="flex items-start gap-1.5 text-xs text-warning">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                Sem admin — backup pode ficar incompleto
              </div>
            )}

            <div className="flex flex-col gap-2">
              {!isRemote && (
                <Button variant="dark" onClick={() => setTarget(g)}>
                  <Camera size={14} />
                  {justCreated === g.id ? 'Backup criado ✓' : 'Criar backup agora'}
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => {
                  setLeaving(g)
                  setConfirmName('')
                }}
              >
                <DoorOpen size={14} />
                Tirar o bot deste servidor
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={leaving !== null} onClose={() => setLeaving(null)} title={`Tirar o bot de ${leaving?.name ?? ''}?`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            O bot sai do servidor e deixa de responder lá (comandos, painéis, verificação, agenda…). As definições ficam guardadas: se o convidares outra vez, volta tudo como estava.
          </p>
          <p className="text-xs text-faint">
            Para confirmar, escreve o nome do servidor: <span className="font-semibold text-text">{leaving?.name}</span>
          </p>
          <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={leaving?.name} className={inputClass} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="dark" onClick={() => setLeaving(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void leave()} loading={leaveBusy} disabled={confirmName.trim() !== leaving?.name.trim()}>
              <DoorOpen size={14} /> Sair do servidor
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={target !== null} onClose={() => setTarget(null)} title={`Backup de ${target?.name ?? ''}`}>
        <p className="text-sm text-muted">Vamos guardar cargos, canais, permissões, emojis e definições deste servidor.</p>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-raised px-3.5 py-3">
          <div className="flex items-center gap-2 text-sm text-text">
            <Ban size={14} className="text-faint" />
            Incluir lista de banidos
          </div>
          <Toggle checked={includeBans} onChange={setIncludeBans} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="dark" onClick={() => setTarget(null)}>
            Cancelar
          </Button>
          <Button onClick={createBackup} loading={creating}>
            Criar backup
          </Button>
        </div>
      </Modal>
    </div>
  )
}
