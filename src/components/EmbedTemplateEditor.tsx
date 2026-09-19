import { useState } from 'react'
import { Plus, RotateCcw, Save, Smile, Trash2 } from 'lucide-react'
import { Button, Card } from './ui'
import { EmbedPreview } from './EmbedPreview'
import type { BotEmoji, EmbedDraft } from '../../shared/types'

const inputClass = 'w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold tracking-wide text-faint uppercase">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function EmojiPicker({ emojis, onPick }: { emojis: BotEmoji[]; onPick: (tag: string) => void }) {
  const [open, setOpen] = useState(false)
  if (emojis.length === 0) return null
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Inserir emoji do bot"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-raised text-faint hover:text-accent"
      >
        <Smile size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1.5 grid max-h-56 w-56 grid-cols-6 gap-1.5 overflow-y-auto rounded-lg border border-border bg-raised p-2 shadow-card">
            {emojis.map((e) => (
              <button
                key={e.id}
                type="button"
                title={`:${e.name}:`}
                onClick={() => {
                  onPick(`<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`)
                  setOpen(false)
                }}
                className="flex size-8 items-center justify-center rounded hover:bg-card"
              >
                <img src={e.url} alt={e.name} className="size-6 object-contain" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function EmbedTemplateEditor({
  draft,
  onChange,
  emojis,
  botName,
  previewPlaceholders = {},
  onSave,
  onReset,
  saving,
  resetting,
  customized,
  placeholderHint,
}: {
  draft: EmbedDraft
  onChange: (draft: EmbedDraft) => void
  emojis: BotEmoji[]
  botName: string
  previewPlaceholders?: Record<string, string>
  onSave: () => void
  onReset?: () => void
  saving: boolean
  resetting?: boolean
  customized: boolean
  placeholderHint?: string
}) {
  function updateField(index: number, patch: Partial<EmbedDraft['fields'][number]>) {
    onChange({ ...draft, fields: draft.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) })
  }

  const previewDraft: EmbedDraft = {
    ...draft,
    title: substitute(draft.title, previewPlaceholders),
    description: substitute(draft.description, previewPlaceholders),
    footer: substitute(draft.footer, previewPlaceholders),
    fields: draft.fields.map((f) => ({ ...f, value: substitute(f.value, previewPlaceholders) })),
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        {placeholderHint && <p className="text-xs text-faint">{placeholderHint}</p>}

        <Field label="Título">
          <input value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} className={inputClass} maxLength={256} />
        </Field>

        <Field label="Descrição">
          <div className="flex items-start gap-2">
            <textarea
              value={draft.description}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
              rows={4}
              className={`${inputClass} resize-none`}
              maxLength={4096}
            />
            <EmojiPicker emojis={emojis} onPick={(tag) => onChange({ ...draft, description: draft.description + tag })} />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cor">
            <div className="flex items-center gap-2">
              <input type="color" value={draft.color} onChange={(e) => onChange({ ...draft, color: e.target.value })} className="h-9 w-12 rounded border border-border bg-raised" />
              <input value={draft.color} onChange={(e) => onChange({ ...draft, color: e.target.value })} className={inputClass} />
            </div>
          </Field>
          <Field label="Autor (opcional)">
            <input value={draft.authorName} onChange={(e) => onChange({ ...draft, authorName: e.target.value })} className={inputClass} maxLength={256} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Imagem (URL)">
            <input value={draft.imageUrl} onChange={(e) => onChange({ ...draft, imageUrl: e.target.value })} className={inputClass} placeholder="https://…" />
          </Field>
          <Field label="Miniatura (URL)">
            <input value={draft.thumbnailUrl} onChange={(e) => onChange({ ...draft, thumbnailUrl: e.target.value })} className={inputClass} placeholder="https://…" />
          </Field>
        </div>

        <Field label="Rodapé">
          <div className="flex items-start gap-2">
            <input value={draft.footer} onChange={(e) => onChange({ ...draft, footer: e.target.value })} className={inputClass} maxLength={2048} />
            <EmojiPicker emojis={emojis} onPick={(tag) => onChange({ ...draft, footer: draft.footer + tag })} />
          </div>
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Campos</label>
            <button
              type="button"
              onClick={() => onChange({ ...draft, fields: [...draft.fields, { name: '', value: '', inline: true }] })}
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
                <button type="button" onClick={() => onChange({ ...draft, fields: draft.fields.filter((_, idx) => idx !== i) })} className="shrink-0 text-faint hover:text-danger">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={draft.timestamp} onChange={(e) => onChange({ ...draft, timestamp: e.target.checked })} className="accent-accent" />
          Mostrar hora
        </label>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <Button onClick={onSave} loading={saving}>
            <Save size={14} />
            Guardar
          </Button>
          {onReset && customized && (
            <Button variant="dark" onClick={onReset} loading={resetting}>
              <RotateCcw size={14} />
              Repor original
            </Button>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">Pré-visualização</p>
        <Card>
          <EmbedPreview draft={previewDraft} botName={botName} />
        </Card>
      </div>
    </div>
  )
}

function substitute(text: string, placeholders: Record<string, string>): string {
  return Object.entries(placeholders).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(value), text)
}
