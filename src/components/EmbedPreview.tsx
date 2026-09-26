import type { EmbedDraft } from '../../shared/types'
import { renderDiscordMarkdown } from '../lib/discordMarkdown'

export function EmbedPreview({
  draft,
  botName,
  content,
  avatarUrl,
}: {
  draft: EmbedDraft
  botName: string
  /** Texto normal da mensagem, por cima do embed. */
  content?: string
  avatarUrl?: string
}) {
  const hasEmbed = Boolean(
    draft.title ||
      draft.description ||
      draft.fields.some((f) => f.name && f.value) ||
      draft.imageUrl ||
      draft.thumbnailUrl ||
      draft.authorName ||
      draft.footer,
  )
  const titleIsLink = Boolean(draft.title && /^https?:\/\//i.test(draft.url ?? ''))

  return (
    <div className="rounded-lg bg-raised p-4">
      <div className="flex items-start gap-3">
        {avatarUrl && /^https?:\/\//i.test(avatarUrl) ? (
          <img src={avatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" onError={hideOnError} />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
            {botName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-text">{botName}</span>
            <span className="rounded bg-accent px-1 py-px text-[9px] font-bold text-white">BOT</span>
          </div>

          {content && <p className="mt-1 text-sm whitespace-pre-wrap text-text">{renderDiscordMarkdown(content)}</p>}

          {!hasEmbed && !content && <p className="mt-1 text-sm text-faint italic">A pré-visualização aparece aqui.</p>}

          {hasEmbed && (
            <div className="mt-1.5 flex max-w-md gap-3 rounded border-l-4 bg-card p-3" style={{ borderColor: draft.color || '#5865F2' }}>
              <div className="min-w-0 flex-1">
                {(draft.authorName || draft.authorIconUrl) && (
                  <div className="mb-1 flex items-center gap-1.5">
                    {draft.authorIconUrl && <img src={draft.authorIconUrl} alt="" className="size-5 rounded-full object-cover" onError={hideOnError} />}
                    {draft.authorName && <p className="text-xs font-semibold text-text">{renderDiscordMarkdown(draft.authorName)}</p>}
                  </div>
                )}
                {draft.title && (
                  <p className={titleIsLink ? 'font-bold text-accent hover:underline' : 'font-bold text-text'}>{renderDiscordMarkdown(draft.title)}</p>
                )}
                {draft.description && <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{renderDiscordMarkdown(draft.description)}</p>}

                {draft.fields.some((f) => f.name && f.value) && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {draft.fields
                      .filter((f) => f.name && f.value)
                      .map((f, i) => (
                        <div key={i} className={f.inline ? '' : 'col-span-2'}>
                          <p className="text-xs font-semibold text-text">{renderDiscordMarkdown(f.name)}</p>
                          <p className="text-xs whitespace-pre-wrap text-muted">{renderDiscordMarkdown(f.value)}</p>
                        </div>
                      ))}
                  </div>
                )}

                {draft.imageUrl && <img src={draft.imageUrl} alt="" className="mt-2 max-h-40 w-full rounded object-cover" onError={hideOnError} />}

                {(draft.footer || draft.timestamp || draft.footerIconUrl) && (
                  <div className="mt-2 flex items-center gap-1.5">
                    {draft.footerIconUrl && <img src={draft.footerIconUrl} alt="" className="size-4 rounded-full object-cover" onError={hideOnError} />}
                    <p className="text-[11px] text-faint">
                      {draft.footer}
                      {draft.footer && draft.timestamp && ' · '}
                      {draft.timestamp && 'agora mesmo'}
                    </p>
                  </div>
                )}
              </div>
              {draft.thumbnailUrl && <img src={draft.thumbnailUrl} alt="" className="size-16 shrink-0 rounded object-cover" onError={hideOnError} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function hideOnError(e: React.SyntheticEvent<HTMLImageElement>): void {
  e.currentTarget.style.display = 'none'
}
