import { useEffect, useState } from 'react'
import { Plus, Send, Trash2 } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Button, Card, SectionHeading } from '../components/ui'
import { EmbedPreview } from '../components/EmbedPreview'
import type { ChannelPickerEntry, EmbedDraft, GuildSummary } from '../../shared/types'

const EMPTY_DRAFT: EmbedDraft = {
  title: '',
  description: '',
  color: '#5865F2',
  imageUrl: '',
  thumbnailUrl: '',
  footer: '',
  authorName: '',
  fields: [],
  timestamp: true,
}

export default function Messaging() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [guildId, setGuildId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [draft, setDraft] = useState<EmbedDraft>(EMPTY_DRAFT)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    bridge.listGuilds().then((g) => {
      setGuilds(g)
      setGuildId(g[0]?.id ?? '')
    })
  }, [])

  useEffect(() => {
    if (!guildId) return
    bridge.listChannels(guildId).then((c) => {
      setChannels(c)
      setChannelId(c[0]?.id ?? '')
    })
  }, [guildId])

  function updateField(index: number, patch: Partial<EmbedDraft['fields'][number]>) {
    setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) }))
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!channelId) return
    setSending(true)
    try {
      await bridge.sendEmbed(guildId, channelId, draft)
      setSent(true)
      setTimeout(() => setSent(false), 3000)
      setDraft(EMPTY_DRAFT)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Mensagens" subtitle="Envia uma mensagem com embed, bonita e formatada, para um canal" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={send} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
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
          </div>

          <Card className="flex flex-col gap-3">
            <Field label="Título">
              <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={inputClass} maxLength={256} />
            </Field>
            <Field label="Descrição">
              <textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={3}
                className={`${inputClass} resize-none`}
                maxLength={2000}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cor">
                <div className="flex items-center gap-2">
                  <input type="color" value={draft.color} onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))} className="h-9 w-12 rounded border border-border bg-raised" />
                  <input value={draft.color} onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))} className={inputClass} />
                </div>
              </Field>
              <Field label="Autor (opcional)">
                <input value={draft.authorName} onChange={(e) => setDraft((d) => ({ ...d, authorName: e.target.value }))} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Imagem (URL)">
                <input value={draft.imageUrl} onChange={(e) => setDraft((d) => ({ ...d, imageUrl: e.target.value }))} className={inputClass} placeholder="https://…" />
              </Field>
              <Field label="Miniatura (URL)">
                <input value={draft.thumbnailUrl} onChange={(e) => setDraft((d) => ({ ...d, thumbnailUrl: e.target.value }))} className={inputClass} placeholder="https://…" />
              </Field>
            </div>
            <Field label="Rodapé">
              <input value={draft.footer} onChange={(e) => setDraft((d) => ({ ...d, footer: e.target.value }))} className={inputClass} maxLength={2048} />
            </Field>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold tracking-wide text-faint uppercase">Campos</label>
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, fields: [...d.fields, { name: '', value: '', inline: true }] }))}
                  className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover"
                >
                  <Plus size={12} />
                  Adicionar
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {draft.fields.map((f, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={f.name} onChange={(e) => updateField(i, { name: e.target.value })} placeholder="Nome" className={`${inputClass} w-1/3`} />
                    <input value={f.value} onChange={(e) => updateField(i, { value: e.target.value })} placeholder="Valor" className={inputClass} />
                    <button type="button" onClick={() => setDraft((d) => ({ ...d, fields: d.fields.filter((_, idx) => idx !== i) }))} className="shrink-0 text-faint hover:text-danger">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={draft.timestamp} onChange={(e) => setDraft((d) => ({ ...d, timestamp: e.target.checked }))} className="accent-accent" />
              Mostrar hora de envio
            </label>
          </Card>

          <Button type="submit" loading={sending} disabled={!channelId}>
            <Send size={14} />
            {sent ? 'Enviado ✓' : 'Enviar mensagem'}
          </Button>
        </form>

        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">Pré-visualização</p>
          <Card>
            <EmbedPreview draft={draft} botName="LisDiscord Bot" />
          </Card>
        </div>
      </div>
    </div>
  )
}

const inputClass = 'w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold tracking-wide text-faint uppercase">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}
