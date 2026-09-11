import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Clock3, GitCompareArrows, Layers, Trash2 } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatBytes, formatRelativeDate } from '../lib/format'
import { Badge, Button, Card, ConfirmDialog, EmptyState, SectionHeading } from '../components/ui'
import type { BackupSummary } from '../../shared/types'

export default function Backups() {
  const [backups, setBackups] = useState<BackupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [toDelete, setToDelete] = useState<BackupSummary | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    load()
  }, [])

  function load() {
    bridge.listBackups().then((b) => {
      setBackups(b)
      setLoading(false)
    })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
  }

  async function confirmDelete() {
    if (!toDelete) return
    await bridge.deleteBackup(toDelete.id)
    setSelected((prev) => prev.filter((id) => id !== toDelete.id))
    load()
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Backups"
        subtitle="Seleciona dois para comparar, ou abre um para veres o conteúdo e restaurares"
        action={
          selected.length === 2 && (
            <Button onClick={() => navigate(`/backups/comparar?a=${selected[0]}&b=${selected[1]}`)}>
              <GitCompareArrows size={14} />
              Comparar seleção
            </Button>
          )
        }
      />

      {!loading && backups.length === 0 && (
        <EmptyState
          title="Ainda sem backups"
          description="Cria o primeiro em Servidores, ou define um agendamento automático."
        />
      )}

      <div className="flex flex-col gap-2">
        {backups.map((b) => (
          <Card key={b.id} className="flex items-center gap-3 p-3.5">
            <input
              type="checkbox"
              checked={selected.includes(b.id)}
              onChange={() => toggleSelect(b.id)}
              className="size-4 accent-accent"
            />
            <Link to={`/backups/${b.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Layers size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text hover:text-accent">{b.guildName}</p>
                <p className="text-xs text-muted">
                  {b.channelCount} canais · {b.roleCount} cargos · {b.emojiCount} emojis
                  {b.banCount > 0 && ` · ${b.banCount} banidos`} · {formatBytes(b.sizeBytes)}
                </p>
              </div>
            </Link>
            {b.origin === 'scheduled' && (
              <Badge tone="accent">
                <Clock3 size={10} className="mr-1 inline" />
                Auto
              </Badge>
            )}
            <span className="shrink-0 text-xs text-muted">{formatRelativeDate(b.createdAt)}</span>
            <button onClick={() => setToDelete(b)} className="shrink-0 text-faint hover:text-danger">
              <Trash2 size={15} />
            </button>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Apagar backup"
        description={`Isto apaga o backup de "${toDelete?.guildName}" para sempre. Não afeta o servidor Discord em si.`}
        confirmLabel="Apagar"
        danger
      />
    </div>
  )
}
