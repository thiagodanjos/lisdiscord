import { useRef } from 'react'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { Button, Card } from './ui'
import { EmbedPreview } from './EmbedPreview'
import { EmojiPickerButton } from './EmojiPickerButton'
import { RichTextField } from './RichTextField'
import { insertAtSelection, type TextSelection } from '../lib/textEditing'
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
  saveLabel = 'Guardar',
  saveIcon: SaveIcon = Save,
  saveDisabled,
  errorMessage,
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
  saveLabel?: string
  saveIcon?: typeof Save
  saveDisabled?: boolean
  errorMessage?: string
}) {
  const titleRef = useRef<HTMLInputElement>(null)

  function updateField(index: number, patch: Partial<EmbedDraft['fields'][number]>) {
    onChange({ ...draft, fields: draft.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) })
  }

  function insertInTitle(tag: string) {
    const el = titleRef.current
    const sel: TextSelection = { start: el?.selectionStart ?? draft.title.length, end: el?.selectionEnd ?? draft.title.length }
    const result = insertAtSelection(draft.title, sel, tag)
    onChange({ ...draft, title: result.value })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(result.selection.start, result.selection.end)
    })
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

        <div>
          <label className="text-xs font-semibold tracking-wide text-faint uppercase">Título</label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              ref={titleRef}
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
              className={inputClass}
              maxLength={256}
            />
            <EmojiPickerButton emojis={emojis} onPick={insertInTitle} />
          </div>
        </div>

        <RichTextField
          label="Descrição"
          value={draft.description}
          onChange={(description) => onChange({ ...draft, description })}
          emojis={emojis}
          rows={4}
          maxLength={4096}
        />

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

        <Field label="Rodapé (sem formatação — a Discord mostra-o sempre em texto simples)">
          <input value={draft.footer} onChange={(e) => onChange({ ...draft, footer: e.target.value })} className={inputClass} maxLength={2048} />
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
              <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <input value={f.name} onChange={(e) => updateField(i, { name: e.target.value })} placeholder="Nome do campo" className={`${inputClass} flex-1`} maxLength={256} />
                  <button type="button" onClick={() => onChange({ ...draft, fields: draft.fields.filter((_, idx) => idx !== i) })} className="shrink-0 text-faint hover:text-danger">
                    <Trash2 size={15} />
                  </button>
                </div>
                <RichTextField label="Valor" value={f.value} onChange={(value) => updateField(i, { value })} emojis={emojis} rows={2} maxLength={1024} />
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={f.inline} onChange={(e) => updateField(i, { inline: e.target.checked })} className="accent-accent" />
                  Lado a lado com outros campos
                </label>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={draft.timestamp} onChange={(e) => onChange({ ...draft, timestamp: e.target.checked })} className="accent-accent" />
          Mostrar hora
        </label>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <Button onClick={onSave} loading={saving} disabled={saveDisabled}>
            <SaveIcon size={14} />
            {saveLabel}
          </Button>
          {onReset && customized && (
            <Button variant="dark" onClick={onReset} loading={resetting}>
              <RotateCcw size={14} />
              Repor original
            </Button>
          )}
        </div>
        {errorMessage && <p className="text-xs text-danger">❌ {errorMessage}</p>}
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
