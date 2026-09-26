import { useRef } from 'react'
import { EmojiPickerButton } from './EmojiPickerButton'
import { insertAtSelection } from '../lib/textEditing'
import type { BotEmoji } from '../../shared/types'

const inputClass =
  'w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

/** Campo de uma linha com botão de emoji do bot, que insere o emoji onde está o cursor. */
export function EmojiTextInput({
  value,
  onChange,
  emojis,
  maxLength,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  emojis: BotEmoji[]
  maxLength?: number
  placeholder?: string
}) {
  const ref = useRef<HTMLInputElement>(null)

  function insert(tag: string) {
    const el = ref.current
    const sel = { start: el?.selectionStart ?? value.length, end: el?.selectionEnd ?? value.length }
    const result = insertAtSelection(value, sel, tag)
    onChange(result.value)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(result.selection.start, result.selection.end)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} maxLength={maxLength} placeholder={placeholder} />
      <EmojiPickerButton emojis={emojis} onPick={insert} />
    </div>
  )
}
