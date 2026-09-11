import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Code2, Hash, Megaphone, RotateCcw, Smile, Users, Volume2 } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatDateTime } from '../lib/format'
import { Badge, Button, Card, SectionHeading } from '../components/ui'
import { RestoreModal } from '../components/RestoreModal'
import type { BackupData, ChannelBackup } from '../../shared/types'

const CHANNEL_ICON: Record<ChannelBackup['kind'], typeof Hash> = {
  category: Hash,
  text: Hash,
  announcement: Megaphone,
  voice: Volume2,
  stage: Volume2,
  forum: Hash,
}

export default function BackupDetail() {
  const { id = '' } = useParams()
  const [backup, setBackup] = useState<BackupData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showJson, setShowJson] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)

  useEffect(() => {
    bridge.getBackup(id).then((b) => {
      setBackup(b)
      setLoading(false)
    })
  }, [id])

  if (!loading && !backup) return <Navigate to="/backups" replace />
  if (!backup) return null

  const categories = backup.channels.filter((c) => c.kind === 'category')
  const orphanChannels = backup.channels.filter((c) => c.kind !== 'category' && !c.parentName)

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title={backup.guildName}
        subtitle={`Backup de ${formatDateTime(backup.createdAt)}`}
        action={
          <div className="flex gap-2">
            <Button variant="dark" onClick={() => setShowJson((v) => !v)}>
              <Code2 size={14} />
              {showJson ? 'Ver resumo' : 'Ver JSON'}
            </Button>
            <Button onClick={() => setRestoreOpen(true)}>
              <RotateCcw size={14} />
              Restaurar
            </Button>
          </div>
        }
      />

      {showJson ? (
        <Card className="overflow-x-auto">
          <pre className="text-xs text-muted">{JSON.stringify(backup, null, 2)}</pre>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text">
              <Users size={15} className="text-accent" />
              Cargos ({backup.roles.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {backup.roles.map((r) => (
                <span
                  key={r.id}
                  className="rounded-full border border-border px-2.5 py-1 text-xs font-medium"
                  style={{ color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : undefined }}
                >
                  {r.name}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text">
              <Smile size={15} className="text-accent" />
              Emojis ({backup.emojis.length})
            </h3>
            {backup.emojis.length === 0 ? (
              <p className="text-sm text-muted">Sem emojis personalizados.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {backup.emojis.map((e) => (
                  <Badge key={e.id}>:{e.name}:</Badge>
                ))}
              </div>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <h3 className="mb-3 text-sm font-bold text-text">Canais ({backup.channels.filter((c) => c.kind !== 'category').length})</h3>
            <div className="flex flex-col gap-4">
              {categories.map((cat) => (
                <div key={cat.id}>
                  <p className="mb-1.5 text-xs font-bold tracking-wide text-faint uppercase">{cat.name}</p>
                  <div className="flex flex-col gap-1 border-l border-border pl-3">
                    {backup.channels
                      .filter((c) => c.parentName === cat.name)
                      .map((c) => (
                        <ChannelRow key={c.id} channel={c} />
                      ))}
                  </div>
                </div>
              ))}
              {orphanChannels.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wide text-faint uppercase">Sem categoria</p>
                  <div className="flex flex-col gap-1 border-l border-border pl-3">
                    {orphanChannels.map((c) => (
                      <ChannelRow key={c.id} channel={c} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {backup.bans.length > 0 && (
            <Card className="lg:col-span-2">
              <h3 className="mb-3 text-sm font-bold text-text">Banimentos ({backup.bans.length})</h3>
              <div className="flex flex-col gap-1.5">
                {backup.bans.map((b) => (
                  <div key={b.userId} className="flex items-center justify-between text-sm">
                    <span className="text-text">{b.userTag}</span>
                    <span className="text-xs text-muted">{b.reason ?? 'sem motivo indicado'}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <RestoreModal open={restoreOpen} onClose={() => setRestoreOpen(false)} backup={backup} />
    </div>
  )
}

function ChannelRow({ channel }: { channel: ChannelBackup }) {
  const Icon = CHANNEL_ICON[channel.kind]
  return (
    <div className="flex items-center gap-2 py-0.5 text-sm text-muted">
      <Icon size={13} className="shrink-0" />
      <span className="text-text">{channel.name}</span>
      {channel.nsfw && <Badge tone="danger">NSFW</Badge>}
    </div>
  )
}
