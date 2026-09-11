import type { Guild, TextBasedChannel } from 'discord.js'
import { randomUUID } from 'node:crypto'
import type { Transcript, TranscriptMessage } from '../../shared/types'

const PAGE_SIZE = 100
const HARD_CAP = 1000 // limite de segurança para não martelar a API em canais enormes

export async function exportTranscript(
  guild: Guild,
  channel: TextBasedChannel,
  channelName: string,
  limit: number,
): Promise<Transcript> {
  const target = Math.min(limit, HARD_CAP)
  const messages: TranscriptMessage[] = []
  let before: string | undefined

  while (messages.length < target) {
    const batch = await channel.messages.fetch({ limit: Math.min(PAGE_SIZE, target - messages.length), before })
    if (batch.size === 0) break

    for (const msg of batch.values()) {
      messages.push({
        id: msg.id,
        authorTag: msg.author.tag,
        authorAvatarUrl: msg.author.displayAvatarURL({ size: 64 }),
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
        attachments: [...msg.attachments.values()].map((a) => a.url),
        editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
      })
    }

    before = batch.last()?.id
    if (batch.size < PAGE_SIZE) break
  }

  messages.reverse() // ordem cronológica, mais antiga primeiro

  return {
    channelId: channel.id,
    channelName,
    guildName: guild.name,
    exportedAt: new Date().toISOString(),
    messages,
  }
}

export function newTranscriptId(): string {
  return randomUUID()
}
