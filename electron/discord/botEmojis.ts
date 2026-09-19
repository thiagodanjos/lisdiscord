import type { ApplicationEmoji, Client } from 'discord.js'
import type { BotEmoji } from '../../shared/types'

const NAME_PATTERN = /^[a-zA-Z0-9_]{2,32}$/

export function validateEmojiName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error('O nome do emoji só pode ter letras, números e underscore (_), entre 2 e 32 caracteres.')
  }
}

function toBotEmoji(emoji: ApplicationEmoji): BotEmoji {
  return {
    id: emoji.id,
    name: emoji.name,
    animated: emoji.animated,
    url: emoji.imageURL({ size: 128 }),
  }
}

export async function listBotEmojis(client: Client): Promise<BotEmoji[]> {
  if (!client.application) throw new Error('O bot não está ligado.')
  const emojis = await client.application.emojis.fetch()
  return [...emojis.values()].map(toBotEmoji).sort((a, b) => a.name.localeCompare(b.name))
}

/** `attachment` é uma data URL (`data:image/png;base64,...`) — o formato que o `<input type="file">` da app produz. */
export async function addBotEmoji(client: Client, name: string, attachment: string): Promise<BotEmoji> {
  if (!client.application) throw new Error('O bot não está ligado.')
  validateEmojiName(name)
  const emoji = await client.application.emojis.create({ attachment, name })
  return toBotEmoji(emoji)
}

export async function deleteBotEmoji(client: Client, id: string): Promise<void> {
  if (!client.application) throw new Error('O bot não está ligado.')
  await client.application.emojis.delete(id)
}
