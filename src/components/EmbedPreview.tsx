import type { EmbedDraft } from '../../shared/types'

export function EmbedPreview({ draft, botName }: { draft: EmbedDraft; botName: string }) {
  const hasContent = draft.title || draft.description || draft.fields.some((f) => f.name && f.value)

  return (
    <div className="rounded-lg bg-raised p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
          {botName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-text">{botName}</span>
            <span className="rounded bg-accent px-1 py-px text-[9px] font-bold text-white">BOT</span>
          </div>

          {!hasContent && <p className="mt-1 text-sm text-faint italic">A pré-visualização aparece aqui.</p>}

          {hasContent && (
            <div
              className="mt-1.5 max-w-md rounded border-l-4 bg-card p-3"
              style={{ borderColor: draft.color || '#5865F2' }}
            >
              {draft.authorName && <p className="mb-1 text-xs font-semibold text-text">{draft.authorName}</p>}
              {draft.title && <p className="font-bold text-text">{draft.title}</p>}
              {draft.description && <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{draft.description}</p>}

              {draft.fields.some((f) => f.name && f.value) && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {draft.fields
                    .filter((f) => f.name && f.value)
                    .map((f, i) => (
                      <div key={i} className={f.inline ? '' : 'col-span-2'}>
                        <p className="text-xs font-semibold text-text">{f.name}</p>
                        <p className="text-xs text-muted">{f.value}</p>
                      </div>
                    ))}
                </div>
              )}

              {draft.imageUrl && (
                <img src={draft.imageUrl} alt="" className="mt-2 max-h-40 w-full rounded object-cover" onError={hideOnError} />
              )}

              {(draft.footer || draft.timestamp) && (
                <p className="mt-2 text-[11px] text-faint">
                  {draft.footer}
                  {draft.footer && draft.timestamp && ' · '}
                  {draft.timestamp && 'agora mesmo'}
                </p>
              )}
            </div>
          )}
        </div>
        {draft.thumbnailUrl && (
          <img src={draft.thumbnailUrl} alt="" className="size-16 shrink-0 rounded object-cover" onError={hideOnError} />
        )}
      </div>
    </div>
  )
}

function hideOnError(e: React.SyntheticEvent<HTMLImageElement>): void {
  e.currentTarget.style.display = 'none'
}
