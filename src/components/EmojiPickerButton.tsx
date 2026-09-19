import { useState } from 'react'
import { Smile } from 'lucide-react'
import type { BotEmoji } from '../../shared/types'

/**
 * Botão de emoji — sempre visível (mesmo sem nenhum emoji ainda), para nunca parecer que a opção
 * desapareceu; se a biblioteca estiver vazia, o popover explica onde adicionar um em vez de o
 * botão simplesmente não aparecer.
 */
export function EmojiPickerButton({ emojis, onPick, title = 'Emoji do bot' }: { emojis: BotEmoji[]; onPick: (tag: string) => void; title?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        title={title}
        onClick={() => setOpen((o) => !o)}
        className="flex size-7 shrink-0 items-center justify-center rounded border border-border bg-raised text-faint hover:border-border-strong hover:text-accent"
      >
        <Smile size={13} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {emojis.length === 0 ? (
            <div className="absolute right-0 z-20 mt-1.5 w-56 rounded-lg border border-border bg-raised p-3 text-xs text-muted shadow-card">
              Ainda não tens emojis na biblioteca do bot. Adiciona um na página <span className="font-semibold text-text">Emojis</span>{' '}
              ou com <span className="font-semibold text-text">/addemojibot</span> na Discord.
            </div>
          ) : (
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
          )}
        </>
      )}
    </div>
  )
}
