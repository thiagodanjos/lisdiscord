import { DiscordButtonEditor } from './DiscordButtonEditor'
import { Toggle } from './ui'
import type { BotEmoji, CustomButton, CustomLinkButton } from '../../shared/types'

// Botão configurável na app (mostrar ou não, texto, emoji, cor) — e a variante de link, com URL.

export function CustomButtonEditor({
  title,
  value,
  fallback,
  emojis,
  onChange,
}: {
  title: string
  value: CustomButton
  fallback: string
  emojis: BotEmoji[]
  onChange: (next: CustomButton) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Toggle checked={value.show} onChange={(show) => onChange({ ...value, show })} label={`Mostrar “${value.label || fallback}”`} />
      <div className={value.show ? '' : 'pointer-events-none opacity-40'}>
        <DiscordButtonEditor
          title={title}
          label={value.label}
          emoji={value.emoji}
          style={value.style}
          fallbackLabel={fallback}
          emojis={emojis}
          onChange={(p) => onChange({ ...value, ...(p.label !== undefined && { label: p.label }), ...(p.emoji !== undefined && { emoji: p.emoji }), ...(p.style && { style: p.style }) })}
        />
      </div>
    </div>
  )
}

export function CustomLinkButtonEditor({
  title,
  value,
  fallback,
  emojis,
  onChange,
}: {
  title: string
  value: CustomLinkButton
  fallback: string
  emojis: BotEmoji[]
  onChange: (next: CustomLinkButton) => void
}) {
  const badUrl = value.show && !/^https?:\/\/\S+$/i.test(value.url.trim())
  return (
    <div className="flex flex-col gap-2">
      <Toggle checked={value.show} onChange={(show) => onChange({ ...value, show })} label="Mostrar botão de link" />
      <div className={`flex flex-col gap-2 ${value.show ? '' : 'pointer-events-none opacity-40'}`}>
        <DiscordButtonEditor
          title={title}
          label={value.label}
          emoji={value.emoji}
          style="secondary"
          fallbackLabel={fallback}
          emojis={emojis}
          linkButton
          onChange={(p) => onChange({ ...value, ...(p.label !== undefined && { label: p.label }), ...(p.emoji !== undefined && { emoji: p.emoji }) })}
        />
        <input
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          placeholder="https://… (link que o botão abre)"
          className={`w-full rounded-lg border bg-black/30 px-3 py-1.5 text-sm text-text placeholder:text-faint focus:outline-none ${badUrl ? 'border-danger' : 'border-border focus:border-accent'}`}
        />
        {badUrl && <p className="text-[11px] text-danger">O link tem de começar por https://</p>}
      </div>
    </div>
  )
}
