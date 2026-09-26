import { type Guild, type GuildTextBasedChannel, PartialGroupDMChannel, type Webhook } from 'discord.js'
import type { EmbedDraft, SendMessageOptions, SendMessageResult } from '../../shared/types'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'

const WEBHOOK_NAME = 'LisDiscord'

/**
 * Envia um embed (e/ou texto) para um canal. Com `options.webhook`, envia por uma webhook do bot
 * nesse canal, com o nome e ícone escolhidos — se o bot não tiver permissão para gerir webhooks,
 * envia como mensagem normal do bot e devolve um aviso em vez de falhar.
 */
export async function sendEmbedMessage(
  guild: Guild,
  channelId: string,
  draft: EmbedDraft,
  options: SendMessageOptions = {},
): Promise<SendMessageResult> {
  const channel = await guild.channels.fetch(channelId).catch(() => null)
  if (!channel || !channel.isTextBased() || channel instanceof PartialGroupDMChannel) {
    throw new Error('Este canal não aceita mensagens.')
  }

  const content = (options.content ?? '').trim()
  if (content.length > 2000) throw new Error('O texto da mensagem passa do limite de 2000 caracteres da Discord.')

  const embed = buildEmbedFromDraft(draft)
  const embeds = embedHasContent(embed) ? [embed] : []
  if (!content && embeds.length === 0) throw new Error('A mensagem está vazia — escreve um texto ou preenche o embed.')

  if (options.webhook) {
    const name = options.webhook.name.trim()
    if (/discord|clyde/i.test(name)) throw new Error('A Discord não deixa usar "discord" nem "clyde" no nome da webhook.')
    try {
      const webhook = await getOrCreateWebhook(guild, channel)
      const sent = await webhook.send({
        content: content || undefined,
        embeds,
        username: name.slice(0, 80) || undefined,
        avatarURL: /^https?:\/\//i.test(options.webhook.avatarUrl.trim()) ? options.webhook.avatarUrl.trim() : undefined,
      })
      return { url: `https://discord.com/channels/${guild.id}/${channel.id}/${sent.id}`, viaWebhook: true }
    } catch (err) {
      console.error('[messaging] Falha ao enviar por webhook, a enviar como mensagem normal do bot:', err)
      const sent = await channel.send({ content: content || undefined, embeds })
      return {
        url: sent.url,
        viaWebhook: false,
        warning: 'Não consegui usar a webhook (o bot precisa da permissão "Gerir Webhooks" nesse canal) — foi enviada como mensagem normal do bot.',
      }
    }
  }

  const sent = await channel.send({ content: content || undefined, embeds })
  return { url: sent.url, viaWebhook: false }
}

async function getOrCreateWebhook(guild: Guild, channel: GuildTextBasedChannel): Promise<Webhook> {
  if (!('fetchWebhooks' in channel) || !('createWebhook' in channel)) {
    throw new Error('Este tipo de canal não suporta webhooks.')
  }
  const botId = guild.client.user.id
  const existing = (await channel.fetchWebhooks()).find((w) => w.owner?.id === botId && w.token)
  if (existing) return existing
  return channel.createWebhook({ name: WEBHOOK_NAME, avatar: guild.client.user.displayAvatarURL() })
}
