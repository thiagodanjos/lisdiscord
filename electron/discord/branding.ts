import { ActivityType, type Client } from 'discord.js'
import { CREDIT_TEXT } from '../../shared/branding'

const ROTATE_MS = 30_000
const DESCRIPTION_LIMIT = 400

/**
 * Põe os créditos no perfil do bot: acrescenta "Created by @thiagoanjoss" ao "Sobre mim" da
 * aplicação (só se ainda lá não estiver — nunca apaga o que já foi escrito no Developer Portal) e
 * roda o estado entre o site, o /help e os créditos. Devolve uma função que para a rotação.
 */
export function applyBranding(client: Client<true>): () => void {
  void ensureCreditInDescription(client)

  const activities = [
    () => ({ name: 'https://lisfilms.pt/', type: ActivityType.Watching }),
    () => ({ name: CREDIT_TEXT, type: ActivityType.Custom, state: `✨ ${CREDIT_TEXT}` }),
    () => ({ name: `/help · ${client.guilds.cache.size} servidor(es)`, type: ActivityType.Playing }),
  ]
  let i = 0
  const apply = () => {
    client.user.setPresence({ activities: [activities[i % activities.length]()], status: 'online' })
    i += 1
  }
  apply()
  const timer = setInterval(apply, ROTATE_MS)
  return () => clearInterval(timer)
}

async function ensureCreditInDescription(client: Client<true>): Promise<void> {
  try {
    const app = await client.application.fetch()
    const current = app.description ?? ''
    if (current.includes(CREDIT_TEXT)) return
    const next = current.trim() ? `${current.trim()}\n\n${CREDIT_TEXT}` : CREDIT_TEXT
    if (next.length > DESCRIPTION_LIMIT) return
    await client.application.edit({ description: next })
  } catch (err) {
    console.error('Não consegui pôr os créditos no "Sobre mim" do bot:', err)
  }
}
