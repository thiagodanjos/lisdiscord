import { useState } from 'react'
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

const STYLES: {
  value: VerificationButtonStyle
  label: string
  swatch: string
}[] = [
  { value: 'primary', label: 'Azul', swatch: '#5865f2' },
  { value: 'success', label: 'Verde', swatch: '#248046' },
  { value: 'secondary', label: 'Cinzento', swatch: '#4e5058' },
  { value: 'danger', label: 'Vermelho', swatch: '#da373c' },
]

const CUSTOM_EMOJI = /^<(a?):(\w{2,32}):(\w+)>$/

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().replace('#', '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** A Discord só desenha 4 cores de botão — escolhe a mais parecida com o hexadecimal dado. */
function nearestButtonStyle(hex: string): VerificationButtonStyle | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  let best: VerificationButtonStyle = 'secondary'
  let bestDist = Infinity
  for (const s of STYLES) {
    const [r, g, b] = hexToRgb(s.swatch)!
    // Distância "redmean" — mais perto do que o olho vê do que a distância RGB simples.
    const rm = (rgb[0] + r) / 2
    const dist = (2 + rm / 256) * (rgb[0] - r) ** 2 + 4 * (rgb[1] - g) ** 2 + (2 + (255 - rm) / 256) * (rgb[2] - b) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = s.value
    }
  }
  return best
}

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
  linkButton,
}: {
  title: string
  label: string
  emoji: string
  style: VerificationButtonStyle
  fallbackLabel: string
  emojis: BotEmoji[]
  onChange: (patch: { label?: string; emoji?: string; style?: VerificationButtonStyle }) => void
  /** Botão de link (abre um canal/URL): a Discord desenha-os sempre a cinzento, sem escolha de cor. */
  linkButton?: boolean
}) {
  const isCustom = CUSTOM_EMOJI.test(emoji.trim())
  const [hex, setHex] = useState('')
  const hexStyle = nearestButtonStyle(hex)
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

      {linkButton ? (
        <p className="text-[11px] text-faint">Botões de link (abrem o ticket) são sempre cinzentos na Discord.</p>
      ) : (
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
          <div className="flex w-full items-center gap-1.5">
            <span className="size-6 shrink-0 rounded border border-border" style={{ background: hexStyle ? `#${hex.trim().replace('#', '')}` : 'transparent' }} />
            <input
              value={hex}
              onChange={(e) => {
                setHex(e.target.value)
                const next = nearestButtonStyle(e.target.value)
                if (next) onChange({ style: next })
              }}
              maxLength={7}
              placeholder="Hexadecimal, ex.: #FF66AA"
              className="w-40 rounded-lg border border-border bg-black/30 px-2.5 py-1 font-mono text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
            />
            {hexStyle && <span className="text-[10px] text-muted">→ fica {STYLES.find((st) => st.value === hexStyle)?.label.toLowerCase()} (a mais parecida)</span>}
          </div>
          <p className="w-full text-[10px] text-faint">
            A Discord só desenha estas 4 cores nos botões (nenhum bot consegue outra) — o hexadecimal escolhe a mais parecida. Para a tua cor exata, usa um emoji do
            bot colorido no botão e a cor hex na barra do embed.
          </p>
        </div>
      )}
    </div>
  )
}
