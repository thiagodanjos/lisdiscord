import { useEffect, useState } from 'react'
import { Ban, Camera, Server, ShieldAlert } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Badge, Button, Card, Modal, SectionHeading, Toggle } from '../components/ui'
import type { GuildSummary } from '../../shared/types'

export default function Servers() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState<GuildSummary | null>(null)
  const [includeBans, setIncludeBans] = useState(false)
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<string | null>(null)

  useEffect(() => {
    bridge.listGuilds().then((g) => {
      setGuilds(g)
      setLoading(false)
    })
  }, [])

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
      <SectionHeading title="Servidores" subtitle="Servidores onde o bot está presente" />

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

            <Button variant="dark" onClick={() => setTarget(g)}>
              <Camera size={14} />
              {justCreated === g.id ? 'Backup criado ✓' : 'Criar backup agora'}
            </Button>
          </Card>
        ))}
      </div>

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
