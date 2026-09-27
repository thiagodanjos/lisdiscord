import { X } from 'lucide-react'
import { EmojiPickerButton } from './EmojiPickerButton'
import type { BotEmoji, VerificationButtonStyle } from '../../shared/types'

// Editor de um botão da Discord: texto, emoji (normal ou da biblioteca do bot) e cor — com uma
// pré-visualização igual à da Discord.

const BUTTON_STYLE_CLASS: Record<VerificationButtonStyle, string> = {
  primary: 'bg-[#5865f2] hover:bg-[#4752c4]',
  success: 'bg-[#248046] hover:bg-[#1a6334]',
  secondary: 'bg-[#4e5058] hover:bg-[#6d6f78]',
  danger: 'bg-[#da373c] hover:bg-[#a12828]',
}

const STYLES: { value: VerificationButtonStyle; label: string; swatch: string }[] = [
  { value: 'primary', label: 'Azul', swatch: '#5865f2' },
  { value: 'success', label: 'Verde', swatch: '#248046' },
  { value: 'secondary', label: 'Cinzento', swatch: '#4e5058' },
  { value: 'danger', label: 'Vermelho', swatch: '#da373c' },
]

const CUSTOM_EMOJI = /^<(a?):(\w{2,32}):(\w+)>$/

/** Mostra um emoji de botão: imagem se for do bot (`<:nome:id>`), texto se for um emoji normal. */
export function ButtonEmoji({ value, emojis, size = 18 }: { value: string; emojis: BotEmoji[]; size?: number }) {
  const v = value.trim()
  if (!v) return null
  const custom = v.match(CUSTOM_EMOJI)
  if (custom) {
    const known = emojis.find((e) => e.id === custom[3])
    const url = known?.url ?? `https://cdn.discordapp.com/emojis/${custom[3]}.${custom[1] ? 'gif' : 'png'}`
    return <img src={url} alt={custom[2]} style={{ width: size, height: size }} className="object-contain" />
  }
  return <span style={{ fontSize: size - 2, lineHeight: 1 }}>{v}</span>
}

/** Pré-visualização de um botão da Discord. */
export function DiscordButtonPreview({
  label,
  emoji,
  style,
  emojis,
  disabled,
}: {
  label: string
  emoji: string
  style: VerificationButtonStyle
  emojis: BotEmoji[]
  disabled?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] px-4 py-[7px] text-sm font-medium text-white transition-colors ${BUTTON_STYLE_CLASS[style]} ${disabled ? 'opacity-50' : ''}`}
    >
      <ButtonEmoji value={emoji} emojis={emojis} />
      {label}
    </span>
  )
}

export function DiscordButtonEditor({
  title,
  label,
  emoji,
  style,
  fallbackLabel,
  emojis,
  onChange,
}: {
  title: string
  label: string
  emoji: string
  style: VerificationButtonStyle
  fallbackLabel: string
  emojis: BotEmoji[]
  onChange: (patch: { label?: string; emoji?: string; style?: VerificationButtonStyle }) => void
}) {
  const isCustom = CUSTOM_EMOJI.test(emoji.trim())
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-black/20 p-3">
      <p className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{title}</p>
      <div className="flex min-h-9 items-center">
        <DiscordButtonPreview label={label || fallbackLabel} emoji={emoji} style={style} emojis={emojis} />
      </div>

      <input
        value={label}
        onChange={(e) => onChange({ label: e.target.value })}
        maxLength={60}
        placeholder={fallbackLabel}
        className="w-full rounded-lg border border-border bg-black/30 px-3 py-1.5 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
      />

      <div className="flex items-center gap-1.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-black/30">
          {emoji.trim() ? <ButtonEmoji value={emoji} emojis={emojis} size={20} /> : <span className="text-[10px] text-faint">—</span>}
        </div>
        <input
          value={isCustom ? '' : emoji}
          onChange={(e) => onChange({ emoji: e.target.value })}
          placeholder={isCustom ? `emoji do bot :${emoji.match(CUSTOM_EMOJI)?.[2]}:` : 'Emoji (cola aqui, ex.: ✅)'}
          className="min-w-0 flex-1 rounded-lg border border-border bg-black/30 px-3 py-1.5 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <EmojiPickerButton emojis={emojis} onPick={(tag) => onChange({ emoji: tag })} title="Escolher um emoji do bot" />
        {emoji.trim() && (
          <button
            type="button"
            title="Sem emoji"
            onClick={() => onChange({ emoji: '' })}
            className="flex size-7 shrink-0 items-center justify-center rounded border border-border bg-raised text-faint hover:text-danger"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STYLES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange({ style: s.value })}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              style === s.value ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:text-text'
            }`}
          >
            <span className="size-2.5 rounded-full" style={{ background: s.swatch }} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
