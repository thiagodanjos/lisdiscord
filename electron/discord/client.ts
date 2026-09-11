import { Client, Events, GatewayIntentBits, PermissionsBitField } from 'discord.js'
import type { BotStatus, GuildSummary } from '../../shared/types'
import { enabledGameIds } from '../store/gameSettings'
import { handleGameInteraction, registerCommandsForGuild } from './games'

/**
 * Envolve o Client do discord.js num singleton simples: liga, desliga e dá
 * acesso ao client ativo aos outros módulos (backup, restore, transcript,
 * moderação, sorteios, jogos).
 *
 * Intents pedidos de propósito ao mínimo: `Guilds` (obrigatório para o cache
 * de servidores/canais/cargos funcionar) e `GuildMessages` + `MessageContent`
 * (só usados para os transcripts). Sem `GuildMembers` — não precisamos da
 * lista de membros, só da contagem aproximada que já vem com o servidor
 * (e a pesquisa de membros usa a REST API, que não exige este intent).
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

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return
      await handleGameInteraction(interaction).catch((err) => {
        console.error('Erro a processar comando de jogo:', err)
      })
    })

    client.on(Events.GuildCreate, async (guild) => {
      await registerCommandsForGuild(guild, enabledGameIds(guild.id)).catch(() => undefined)
    })

    try {
      await client.login(token)
    } catch (err) {
      await client.destroy().catch(() => undefined)
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Não foi possível ligar com este token: ${message}`)
    }

    this.client = client
    await this.registerAllCommands()
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

  /** Regista os slash commands (jogos) em todos os servidores, de acordo com as preferências guardadas de cada um. */
  async registerAllCommands(): Promise<void> {
    const client = this.getClient()
    for (const guild of client.guilds.cache.values()) {
      await registerCommandsForGuild(guild, enabledGameIds(guild.id)).catch((err) => {
        console.error(`Falha a registar comandos em ${guild.name}:`, err)
      })
    }
  }
}

export const discordManager = new DiscordManager()
