import { EmbedBuilder } from 'discord.js'
import type { EmbedDraft } from '../../shared/types'

/**
 * Constrói um embed a partir de um `EmbedDraft` — a mesma estrutura usada pela página Mensagens,
 * pelo comando /embed e pelos embeds fixos editáveis (placar, justificativas, logs). `placeholders`
 * substitui tokens como `{lista}` ou `{membro}` em todos os textos antes de aplicar os limites da
 * API da Discord.
 */
export function buildEmbedFromDraft(draft: EmbedDraft, placeholders: Record<string, string> = {}): EmbedBuilder {
  const embed = new EmbedBuilder()
  const text = (value: string | undefined, max: number) => substitute(value ?? '', placeholders).slice(0, max).trim()

  const title = text(draft.title, 256)
  const description = text(draft.description, 4096)
  const footer = text(draft.footer, 2048)
  const authorName = text(draft.authorName, 256)
  const url = safeUrl(substitute(draft.url ?? '', placeholders))
  const footerIcon = safeUrl(substitute(draft.footerIconUrl ?? '', placeholders))
  const authorIcon = safeUrl(substitute(draft.authorIconUrl ?? '', placeholders))
  const image = safeUrl(substitute(draft.imageUrl, placeholders))
  const thumbnail = safeUrl(substitute(draft.thumbnailUrl, placeholders))

  if (title) embed.setTitle(title)
  if (title && url) embed.setURL(url)
  if (description) embed.setDescription(description)
  if (draft.color.trim()) embed.setColor(parseColor(draft.color))
  if (image) embed.setImage(image)
  if (thumbnail) embed.setThumbnail(thumbnail)
  // A Discord só mostra o ícone do rodapé/autor se houver texto — sem texto, usa-se um espaço
  // invisível para o ícone não desaparecer quando alguém só quer a imagem.
  if (footer || footerIcon) embed.setFooter({ text: footer || '​', iconURL: footerIcon ?? undefined })
  if (authorName || authorIcon) embed.setAuthor({ name: authorName || '​', iconURL: authorIcon ?? undefined })
  if (draft.timestamp) embed.setTimestamp(new Date())

  const fields = draft.fields
    .map((f) => ({ name: text(f.name, 256), value: text(f.value, 1024), inline: f.inline }))
    .filter((f) => f.name && f.value)
    .slice(0, 25)
  if (fields.length > 0) embed.addFields(fields)

  return embed
}

function substitute(text: string, placeholders: Record<string, string>): string {
  return Object.entries(placeholders).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(value), text)
}

function safeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null
}

function parseColor(hex: string): number {
  const clean = hex.trim().replace('#', '')
  const parsed = Number.parseInt(clean, 16)
  return Number.isNaN(parsed) ? 0x5865f2 : Math.min(0xffffff, Math.max(0, parsed))
}

/** Um embed só com timestamp/cor é rejeitado pela Discord — isto diz se há conteúdo visível de verdade. */
export function embedHasContent(embed: EmbedBuilder): boolean {
  const d = embed.data
  return Boolean(d.title || d.description || d.fields?.length || d.image || d.thumbnail || d.author?.name?.trim() || d.footer?.text?.trim())
}
