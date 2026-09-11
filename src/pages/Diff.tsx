import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Minus, Pencil, Plus } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Card, EmptyState, SectionHeading } from '../components/ui'
import type { DiffEntry } from '../../shared/types'

const CATEGORY_LABEL: Record<DiffEntry['category'], string> = { role: 'Cargo', channel: 'Canal', emoji: 'Emoji' }

export default function Diff() {
  const [params] = useSearchParams()
  const a = params.get('a') ?? ''
  const b = params.get('b') ?? ''
  const [entries, setEntries] = useState<DiffEntry[] | null>(null)

  useEffect(() => {
    if (!a || !b) return
    bridge.diffBackups(a, b).then(setEntries)
  }, [a, b])

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Comparar backups" subtitle="O que mudou entre os dois backups selecionados" />

      {entries === null && <p className="text-sm text-muted">A comparar…</p>}

      {entries?.length === 0 && <EmptyState title="Sem diferenças" description="Estes dois backups têm exatamente os mesmos cargos, canais e emojis." />}

      {entries && entries.length > 0 && (
        <div className="flex flex-col gap-2">
          {entries.map((entry, i) => (
            <Card key={i} className="flex items-center gap-3 p-3.5">
              <DiffIcon kind={entry.kind} />
              <span className="text-xs font-semibold tracking-wide text-faint uppercase">{CATEGORY_LABEL[entry.category]}</span>
              <span className="text-sm font-medium text-text">{entry.name}</span>
              {entry.details && <span className="text-xs text-muted">({entry.details})</span>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function DiffIcon({ kind }: { kind: DiffEntry['kind'] }) {
  if (kind === 'added') return <Plus size={16} className="shrink-0 text-success" />
  if (kind === 'removed') return <Minus size={16} className="shrink-0 text-danger" />
  return <Pencil size={16} className="shrink-0 text-warning" />
}
