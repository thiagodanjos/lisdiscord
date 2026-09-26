import { useState } from 'react'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { Button, Card } from './ui'
import { EmbedPreview } from './EmbedPreview'
import { EmojiTextInput } from './EmojiTextInput'
import { RichTextField } from './RichTextField'
import { LIST_LINE_PLACEHOLDERS } from '../../shared/leaderboardFormat'
import type { BotEmoji, EmbedDraft, ListFormat } from '../../shared/types'

const inputClass = 'w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold tracking-wide text-faint uppercase">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

/** Tokens clicáveis — um clique copia o token, para colar onde quiseres. */
function TokenChips({ tokens }: { tokens: readonly string[] }) {
  const [copied, setCopied] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap gap-1.5">
      {tokens.map((t) => (
        <button
          key={t}
          type="button"
          title="Clica para copiar"
          onClick={() => {
            navigator.clipboard?.writeText(t).catch(() => undefined)
            setCopied(t)
            setTimeout(() => setCopied((c) => (c === t ? null : c)), 1200)
          }}
          className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted hover:border-accent hover:text-accent"
        >
          {copied === t ? 'copiado ✓' : t}
        </button>
      ))}
    </div>
  )
}

const LIST_ROWS: { key: keyof ListFormat; label: string }[] = [
  { key: 'first', label: '1º lugar' },
  { key: 'second', label: '2º lugar' },
  { key: 'third', label: '3º lugar' },
  { key: 'line', label: 'Restantes (4º em diante)' },
]

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
  placeholderTokens,
  listFormatDefaults,
  previewList,
  saveLabel = 'Guardar',
  saveIcon: SaveIcon = Save,
  saveDisabled,
  errorMessage,
  extraActions,
  previewContent,
  previewAvatarUrl,
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
  placeholderTokens?: readonly string[]
  /** Quando definido, mostra o editor das linhas da lista automática ({lista}). */
  listFormatDefaults?: ListFormat
  /** Monta a {lista} da pré-visualização com o formato de linhas atual. */
  previewList?: (format: ListFormat) => string
  saveLabel?: string
  saveIcon?: typeof Save
  saveDisabled?: boolean
  errorMessage?: string
  extraActions?: React.ReactNode
  previewContent?: string
  previewAvatarUrl?: string
}) {
  function updateField(index: number, patch: Partial<EmbedDraft['fields'][number]>) {
    onChange({ ...draft, fields: draft.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) })
  }

  const listFormat = listFormatDefaults ? (draft.listFormat ?? listFormatDefaults) : undefined

  function updateListLine(key: keyof ListFormat, value: string) {
    if (!listFormat) return
    onChange({ ...draft, listFormat: { ...listFormat, [key]: value } })
  }

  const placeholders = listFormat && previewList ? { ...previewPlaceholders, lista: previewList(listFormat) } : previewPlaceholders

  const previewDraft: EmbedDraft = {
    ...draft,
    title: substitute(draft.title, placeholders),
    description: substitute(draft.description, placeholders),
    footer: substitute(draft.footer, placeholders),
    authorName: substitute(draft.authorName, placeholders),
    imageUrl: substitute(draft.imageUrl, placeholders),
    thumbnailUrl: substitute(draft.thumbnailUrl, placeholders),
    authorIconUrl: substitute(draft.authorIconUrl ?? '', placeholders),
    footerIconUrl: substitute(draft.footerIconUrl ?? '', placeholders),
    fields: draft.fields.map((f) => ({ ...f, name: substitute(f.name, placeholders), value: substitute(f.value, placeholders) })),
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        {(placeholderHint || placeholderTokens) && (
          <div className="flex flex-col gap-2 rounded-lg bg-card/60 p-3">
            {placeholderHint && <p className="text-xs text-faint">{placeholderHint}</p>}
            {placeholderTokens && <TokenChips tokens={placeholderTokens} />}
          </div>
        )}

        <Field label="Título">
          <EmojiTextInput value={draft.title} onChange={(title) => onChange({ ...draft, title })} emojis={emojis} maxLength={256} />
        </Field>

        <RichTextField
          label="Descrição"
          value={draft.description}
          onChange={(description) => onChange({ ...draft, description })}
          emojis={emojis}
          rows={4}
          maxLength={4096}
        />

        {listFormat && (
          <div className="flex flex-col gap-2.5 rounded-xl border border-accent/30 bg-accent-soft/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-accent uppercase">Linhas da lista automática — {'{lista}'}</p>
              {draft.listFormat && listFormatDefaults && (
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, listFormat: listFormatDefaults })}
                  className="text-[11px] font-semibold text-faint hover:text-text"
                >
                  Repor linhas
                </button>
              )}
            </div>
            <p className="text-xs text-faint">Cada membro vira uma linha, com os dados preenchidos sozinhos. Personaliza com emojis e texto à vontade:</p>
            <TokenChips tokens={LIST_LINE_PLACEHOLDERS} />
            {LIST_ROWS.map((row) => (
              <Field key={row.key} label={row.label}>
                <EmojiTextInput value={listFormat[row.key]} onChange={(v) => updateListLine(row.key, v)} emojis={emojis} maxLength={300} />
              </Field>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cor">
            <div className="flex items-center gap-2">
              <input type="color" value={normalizeColor(draft.color)} onChange={(e) => onChange({ ...draft, color: e.target.value })} className="h-9 w-12 rounded border border-border bg-raised" />
              <input value={draft.color} onChange={(e) => onChange({ ...draft, color: e.target.value })} className={inputClass} />
            </div>
          </Field>
          <Field label="Link do título (opcional)">
            <input value={draft.url ?? ''} onChange={(e) => onChange({ ...draft, url: e.target.value })} className={inputClass} placeholder="https://…" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Autor (opcional)">
            <input value={draft.authorName} onChange={(e) => onChange({ ...draft, authorName: e.target.value })} className={inputClass} maxLength={256} />
          </Field>
          <Field label="Ícone do autor (URL)">
            <input value={draft.authorIconUrl ?? ''} onChange={(e) => onChange({ ...draft, authorIconUrl: e.target.value })} className={inputClass} placeholder="https://…" />
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Rodapé (texto simples)">
            <input value={draft.footer} onChange={(e) => onChange({ ...draft, footer: e.target.value })} className={inputClass} maxLength={2048} />
          </Field>
          <Field label="Ícone do rodapé (URL)">
            <input value={draft.footerIconUrl ?? ''} onChange={(e) => onChange({ ...draft, footerIconUrl: e.target.value })} className={inputClass} placeholder="https://…" />
          </Field>
        </div>

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
                  <div className="flex-1">
                    <EmojiTextInput value={f.name} onChange={(name) => updateField(i, { name })} emojis={emojis} maxLength={256} placeholder="Nome do campo" />
                  </div>
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
          {extraActions}
        </div>
        {errorMessage && <p className="text-xs text-danger">❌ {errorMessage}</p>}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">Pré-visualização</p>
        <Card className="lg:sticky lg:top-0">
          <EmbedPreview draft={previewDraft} botName={botName} content={previewContent} avatarUrl={previewAvatarUrl} />
        </Card>
      </div>
    </div>
  )
}

function substitute(text: string, placeholders: Record<string, string>): string {
  return Object.entries(placeholders).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(value), text)
}

/** O `<input type="color">` só aceita #rrggbb — qualquer outra coisa escrita no campo de texto fazia-o ficar preto. */
function normalizeColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : '#5865f2'
}
