import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileText, Plus, Trash2 } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatRelativeDate } from '../lib/format'
import { Button, Card, ConfirmDialog, EmptyState, Modal, SectionHeading } from '../components/ui'
import type { ChannelPickerEntry, GuildSummary, TranscriptSummary } from '../../shared/types'

export default function Transcripts() {
  const [transcripts, setTranscripts] = useState<TranscriptSummary[]>([])
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toDelete, setToDelete] = useState<TranscriptSummary | null>(null)
  const [messageContentEnabled, setMessageContentEnabled] = useState(true)

  const [guildId, setGuildId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [limit, setLimit] = useState(200)

  useEffect(() => {
    load()
    bridge.getStatus().then((s) => setMessageContentEnabled(s.messageContentEnabled))
  }, [])

  useEffect(() => {
    if (!guildId) return
    bridge.listChannels(guildId).then((c) => {
      setChannels(c)
      setChannelId(c[0]?.id ?? '')
    })
  }, [guildId])

  function load() {
    Promise.all([bridge.listTranscripts(), bridge.listGuilds()]).then(([t, g]) => {
      setTranscripts(t)
      setGuilds(g)
      setGuildId((prev) => prev || g[0]?.id || '')
      setLoading(false)
    })
  }

  async function submitExport(e: React.FormEvent) {
    e.preventDefault()
    if (!guildId || !channelId) return
    setExporting(true)
    try {
      await bridge.exportTranscript(guildId, channelId, limit)
      setCreating(false)
      load()
    } finally {
      setExporting(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    await bridge.deleteTranscript(toDelete.id)
    load()
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Transcripts"
        subtitle="Histórico de mensagens exportado em texto — só leitura, nunca reenviado para o Discord"
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus size={14} />
            Exportar canal
          </Button>
        }
      />

      {!messageContentEnabled && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3.5 py-3 text-xs text-warning">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            A Message Content Intent não está ativada no bot, por isso os transcripts saem sem o texto das mensagens
            (só autor, data e anexos). Ativa-a em Bot → Privileged Gateway Intents no Developer Portal e volta a
            ligar o bot para teres o conteúdo completo.
          </span>
        </div>
      )}

      {!loading && transcripts.length === 0 && (
        <EmptyState title="Sem transcripts" description="Exporta o histórico de um canal para arquivares ou consultares mais tarde." />
      )}

      <div className="flex flex-col gap-2">
        {transcripts.map((t) => (
          <Card key={t.id} className="flex items-center gap-3 p-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <FileText size={16} />
            </div>
            <Link to={`/transcripts/${t.id}`} className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text hover:text-accent">
                #{t.channelName} — {t.guildName}
              </p>
              <p className="text-xs text-muted">{t.messageCount} mensagens</p>
            </Link>
            <span className="shrink-0 text-xs text-muted">{formatRelativeDate(t.exportedAt)}</span>
            <button onClick={() => setToDelete(t)} className="shrink-0 text-faint hover:text-danger">
              <Trash2 size={15} />
            </button>
          </Card>
        ))}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Exportar transcript">
        <form onSubmit={submitExport} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Servidor</label>
            <select
              value={guildId}
              onChange={(e) => setGuildId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Canal</label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Nº de mensagens (máx. 1000)</label>
            <input
              type="number"
              min={10}
              max={1000}
              step={10}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="dark" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={exporting} disabled={!channelId}>
              Exportar
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Apagar transcript"
        description="Isto só apaga o ficheiro guardado localmente — não afeta as mensagens no Discord."
        confirmLabel="Apagar"
        danger
      />
    </div>
  )
}
