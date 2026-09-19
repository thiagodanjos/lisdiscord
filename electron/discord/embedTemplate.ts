import { EmbedBuilder } from 'discord.js'
import type { EmbedDraft } from '../../shared/types'

/**
 * Constrói um embed a partir de um `EmbedDraft` — a mesma estrutura que a página Mensagens já usa
 * para embeds avulsos, reaproveitada aqui para os embeds fixos (placar de pontos, mensagens de
 * justificativas) que agora também são editáveis pela app. `placeholders` substitui tokens como
 * `{lista}` no título, descrição, rodapé e valores de campos, antes de aplicar os limites da API
 * da Discord — é assim que a parte dinâmica (ex.: a lista do ranking) continua a aparecer dentro
 * de um embed cujo resto (cor, imagem, título…) já não é código fixo.
 */
export function buildEmbedFromDraft(draft: EmbedDraft, placeholders: Record<string, string> = {}): EmbedBuilder {
  const embed = new EmbedBuilder()

  const title = substitute(draft.title, placeholders).slice(0, 256)
  const description = substitute(draft.description, placeholders).slice(0, 4096)
  const footer = substitute(draft.footer, placeholders).slice(0, 2048)
  const authorName = substitute(draft.authorName, placeholders).slice(0, 256)

  if (title.trim()) embed.setTitle(title.trim())
  if (description.trim()) embed.setDescription(description.trim())
  if (draft.color.trim()) embed.setColor(parseColor(draft.color))
  if (draft.imageUrl.trim()) embed.setImage(draft.imageUrl.trim())
  if (draft.thumbnailUrl.trim()) embed.setThumbnail(draft.thumbnailUrl.trim())
  if (footer.trim()) embed.setFooter({ text: footer.trim() })
  if (authorName.trim()) embed.setAuthor({ name: authorName.trim() })
  if (draft.timestamp) embed.setTimestamp(new Date())

  const fields = draft.fields
    .filter((f) => f.name.trim() && f.value.trim())
    .slice(0, 25)
    .map((f) => ({
      name: substitute(f.name, placeholders).slice(0, 256).trim(),
      value: substitute(f.value, placeholders).slice(0, 1024).trim(),
      inline: f.inline,
    }))
  if (fields.length > 0) embed.addFields(fields)

  return embed
}

function substitute(text: string, placeholders: Record<string, string>): string {
  return Object.entries(placeholders).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(value), text)
}

function parseColor(hex: string): number {
  const clean = hex.trim().replace('#', '')
  const parsed = Number.parseInt(clean, 16)
  return Number.isNaN(parsed) ? 0x5865f2 : parsed
}
