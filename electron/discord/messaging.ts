import { EmbedBuilder, type Guild } from 'discord.js'
import type { EmbedDraft } from '../../shared/types'

export async function sendEmbedMessage(guild: Guild, channelId: string, draft: EmbedDraft): Promise<void> {
  const channel = await guild.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) {
    throw new Error('Este canal não aceita mensagens.')
  }

  const embed = new EmbedBuilder()

  if (draft.title.trim()) embed.setTitle(draft.title.trim())
  if (draft.description.trim()) embed.setDescription(draft.description.trim())
  if (draft.color.trim()) embed.setColor(parseColor(draft.color))
  if (draft.imageUrl.trim()) embed.setImage(draft.imageUrl.trim())
  if (draft.thumbnailUrl.trim()) embed.setThumbnail(draft.thumbnailUrl.trim())
  if (draft.footer.trim()) embed.setFooter({ text: draft.footer.trim() })
  if (draft.authorName.trim()) embed.setAuthor({ name: draft.authorName.trim() })
  if (draft.timestamp) embed.setTimestamp(new Date())

  const fields = draft.fields.filter((f) => f.name.trim() && f.value.trim())
  if (fields.length > 0) {
    embed.addFields(fields.map((f) => ({ name: f.name.trim(), value: f.value.trim(), inline: f.inline })))
  }

  await channel.send({ embeds: [embed] })
}

function parseColor(hex: string): number {
  const clean = hex.trim().replace('#', '')
  const parsed = Number.parseInt(clean, 16)
  return Number.isNaN(parsed) ? 0x5865f2 : parsed
}
