import type { Guild } from 'discord.js'
import type { EmbedDraft } from '../../shared/types'
import { buildEmbedFromDraft } from './embedTemplate'

export async function sendEmbedMessage(guild: Guild, channelId: string, draft: EmbedDraft): Promise<void> {
  const channel = await guild.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) {
    throw new Error('Este canal não aceita mensagens.')
  }

  await channel.send({ embeds: [buildEmbedFromDraft(draft)] })
}
