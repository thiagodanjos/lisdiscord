import { Client, GatewayIntentBits, PermissionsBitField } from 'discord.js'
import type { BotStatus, GuildSummary } from '../../shared/types'

/**
 * Envolve o Client do discord.js num singleton simples: liga, desliga e dá
 * acesso ao client ativo aos outros módulos (backup, restore, transcript).
 *
 * Intents pedidos de propósito ao mínimo: `Guilds` (obrigatório para o cache
 * de servidores/canais/cargos funcionar) e `GuildMessages` + `MessageContent`
 * (só usados para os transcripts). Sem `GuildMembers` — não precisamos da
 * lista de membros, só da contagem aproximada que já vem com o servidor.
 */
class DiscordManager {
  private client: Client | null = null

  async connect(token: string): Promise<BotStatus> {
    if (this.client) {
      await this.disconnect()
    }

    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    })

    try {
      await client.login(token)
    } catch (err) {
      await client.destroy().catch(() => undefined)
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Não foi possível ligar com este token: ${message}`)
    }

    this.client = client
    return this.getStatus()
  }

  async disconnect(): Promise<void> {
    if (!this.client) return
    await this.client.destroy().catch(() => undefined)
    this.client = null
  }

  getClient(): Client {
    if (!this.client) throw new Error('O bot não está ligado. Liga-o em Definições antes de continuar.')
    return this.client
  }

  isConnected(): boolean {
    return this.client !== null && this.client.isReady()
  }

  async getStatus(): Promise<BotStatus> {
    if (!this.client || !this.client.isReady() || !this.client.user) {
      return { connected: false, botTag: null, botAvatarUrl: null, guildCount: 0 }
    }
    return {
      connected: true,
      botTag: this.client.user.tag,
      botAvatarUrl: this.client.user.displayAvatarURL({ size: 128 }),
      guildCount: this.client.guilds.cache.size,
    }
  }

  async listGuilds(): Promise<GuildSummary[]> {
    const client = this.getClient()
    const guilds = [...client.guilds.cache.values()]
    const out: GuildSummary[] = []

    for (const guild of guilds) {
      const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null))
      const botIsAdmin = me?.permissions.has(PermissionsBitField.Flags.Administrator) ?? false
      out.push({
        id: guild.id,
        name: guild.name,
        iconUrl: guild.iconURL({ size: 128 }),
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
        botIsAdmin,
      })
    }

    return out.sort((a, b) => a.name.localeCompare(b.name))
  }
}

export const discordManager = new DiscordManager()
