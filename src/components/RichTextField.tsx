import { useRef, useState } from 'react'
import { Bold, Italic, Link2, Smile, Strikethrough, Underline } from 'lucide-react'
import type { BotEmoji } from '../../shared/types'

const inputClass = 'w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

interface Selection {
  start: number
  end: number
}

function wrap(value: string, sel: Selection, before: string, after: string): { value: string; selection: Selection } {
  const selected = value.slice(sel.start, sel.end)
  const placeholder = selected || 'texto'
  const newValue = value.slice(0, sel.start) + before + placeholder + after + value.slice(sel.end)
  return { value: newValue, selection: { start: sel.start + before.length, end: sel.start + before.length + placeholder.length } }
}

function insertAt(value: string, sel: Selection, text: string): { value: string; selection: Selection } {
  const newValue = value.slice(0, sel.start) + text + value.slice(sel.end)
  const pos = sel.start + text.length
  return { value: newValue, selection: { start: pos, end: pos } }
}

/**
 * Textarea com uma barra de ferramentas — negrito/itálico/sublinhado/rasurado/link envolvem o
 * texto selecionado com a formatação Markdown da Discord (`**`, `*`, `__`, `~~`, `[texto](url)`),
 * do mesmo jeito que a própria Discord faz ao selecionar texto e usar Ctrl+B etc. Sem seleção,
 * insere os marcadores no cursor com um texto de exemplo já selecionado, pronto a substituir.
 */
export function RichTextField({
  label,
  value,
  onChange,
  emojis,
  rows = 4,
  maxLength,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  emojis: BotEmoji[]
  rows?: number
  maxLength?: number
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const linkSelection = useRef<Selection>({ start: 0, end: 0 })

  function apply(transform: (value: string, sel: Selection) => { value: string; selection: Selection }) {
    const el = ref.current
    if (!el) return
    const sel: Selection = { start: el.selectionStart ?? value.length, end: el.selectionEnd ?? value.length }
    const result = transform(value, sel)
    onChange(result.value)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(result.selection.start, result.selection.end)
    })
  }

  function openLinkPopover() {
    const el = ref.current
    linkSelection.current = { start: el?.selectionStart ?? value.length, end: el?.selectionEnd ?? value.length }
    setLinkUrl('')
    setLinkOpen(true)
  }

  function confirmLink() {
    const url = linkUrl.trim()
    setLinkOpen(false)
    if (!url) return
    apply((v) => {
      const s = linkSelection.current
      const selected = v.slice(s.start, s.end) || 'texto'
      const before = `[${selected}](${url})`
      const newValue = v.slice(0, s.start) + before + v.slice(s.end)
      return { value: newValue, selection: { start: s.start, end: s.start + before.length } }
    })
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-semibold tracking-wide text-faint uppercase">{label}</label>
        <div className="flex items-center gap-1">
          <ToolButton title="Negrito" onClick={() => apply((v, s) => wrap(v, s, '**', '**'))}>
            <Bold size={13} />
          </ToolButton>
          <ToolButton title="Itálico" onClick={() => apply((v, s) => wrap(v, s, '*', '*'))}>
            <Italic size={13} />
          </ToolButton>
          <ToolButton title="Sublinhado" onClick={() => apply((v, s) => wrap(v, s, '__', '__'))}>
            <Underline size={13} />
          </ToolButton>
          <ToolButton title="Rasurado" onClick={() => apply((v, s) => wrap(v, s, '~~', '~~'))}>
            <Strikethrough size={13} />
          </ToolButton>
          <div className="relative">
            <ToolButton title="Link" onClick={openLinkPopover}>
              <Link2 size={13} />
            </ToolButton>
            {linkOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setLinkOpen(false)} />
                <div className="absolute right-0 z-20 mt-1.5 flex w-64 flex-col gap-2 rounded-lg border border-border bg-raised p-2.5 shadow-card">
                  <input
                    autoFocus
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmLink()
                      if (e.key === 'Escape') setLinkOpen(false)
                    }}
                    placeholder="https://…"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={confirmLink}
                    disabled={!linkUrl.trim()}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Inserir link
                  </button>
                </div>
              </>
            )}
          </div>
          {emojis.length > 0 && (
            <div className="relative">
              <ToolButton title="Emoji do bot" onClick={() => setEmojiOpen((o) => !o)}>
                <Smile size={13} />
              </ToolButton>
              {emojiOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setEmojiOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1.5 grid max-h-56 w-56 grid-cols-6 gap-1.5 overflow-y-auto rounded-lg border border-border bg-raised p-2 shadow-card">
                    {emojis.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        title={`:${e.name}:`}
                        onClick={() => {
                          apply((v, s) => insertAt(v, s, `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`))
                          setEmojiOpen(false)
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
          )}
        </div>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`${inputClass} resize-none`}
      />
    </div>
  )
}

function ToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded border border-border bg-raised text-faint hover:border-border-strong hover:text-accent"
    >
      {children}
    </button>
  )
}
