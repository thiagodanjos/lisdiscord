import { ActivityType, Client, Events, GatewayIntentBits, PermissionsBitField } from 'discord.js'
import type { BotStatus, GuildSummary } from '../../shared/types'
import { enabledGameIds } from '../store/gameSettings'
import { handleGiveawayButtons } from './giveawayCommand'
import { buildGlobalCommandDefinitions, handleGameInteraction, registerCommandsForGuild } from './games'
import { handleJustificationButtons } from './justifications'

/**
 * Envolve o Client do discord.js num singleton simples: liga, desliga e dá
 * acesso ao client ativo aos outros módulos (backup, restore, transcript,
 * moderação, sorteios, jogos).
 *
 * Intents pedidos: `Guilds` (obrigatório para o cache de servidores/canais/
 * cargos funcionar) e `GuildMessages` sempre; `MessageContent` (transcripts)
 * e `GuildMembers` (lista completa de membros do servidor — usada no
 * ranking de pontos de Mov. Call, para mostrar toda a gente e não só quem
 * já tem pontos) são privilegiadas e tentadas com fallback gracioso.
 */
class DiscordManager {
  private client: Client | null = null
  private messageContentEnabled = false
  private guildMembersEnabled = false

  async connect(token: string): Promise<BotStatus> {
    if (this.client) {
      await this.disconnect()
    }

    // MessageContent e GuildMembers são intents privilegiadas — só funcionam se
    // tiveres ativado o interruptor correspondente no Developer Portal. Se não
    // tiveres, pedi-las faz o login inteiro falhar ("Used disallowed intents"),
    // não só a funcionalidade que depende delas. Por isso tentamos combinações
    // da mais completa para a mais mínima, até uma funcionar — o resto da app
    // continua a funcionar mesmo sem elas, só ficam funcionalidades específicas
    // limitadas (transcripts sem conteúdo / ranking só com quem já tem pontos).
    const attempts: Array<{ messageContent: boolean; guildMembers: boolean }> = [
      { messageContent: true, guildMembers: true },
      { messageContent: false, guildMembers: true },
      { messageContent: true, guildMembers: false },
      { messageContent: false, guildMembers: false },
    ]

    let client: Client | null = null
    let lastErr: unknown
    for (const attempt of attempts) {
      try {
        client = await this.tryLogin(token, attempt.messageContent, attempt.guildMembers)
        this.messageContentEnabled = attempt.messageContent
        this.guildMembersEnabled = attempt.guildMembers
        break
      } catch (err) {
        if (!isDisallowedIntentsError(err)) throw asFriendlyError(err)
        lastErr = err
      }
    }
    if (!client) throw asFriendlyError(lastErr)

    client.on(Events.InteractionCreate, async (interaction) => {
      // O gateway da Discord pode, raramente, reentregar o mesmo evento (ex.: depois de um
      // resume da ligação) — sem isto, a segunda entrega tentava responder a uma interação já
      // respondida e rebentava com "Interaction has already been acknowledged" (40060).
      if (wasRecentlySeen(interaction.id)) return

      if (interaction.isChatInputCommand()) {
        await handleGameInteraction(interaction).catch((err) => {
          if (isAlreadyAcknowledgedError(err)) return
          console.error('Erro a processar comando de jogo:', err)
        })
        return
      }
      if (interaction.isButton()) {
        await handleGiveawayButtons(interaction).catch((err) => {
          if (isAlreadyAcknowledgedError(err)) return
          console.error('Erro a processar botão de sorteio:', err)
        })
        await handleJustificationButtons(interaction).catch((err) => {
          if (isAlreadyAcknowledgedError(err)) return
          console.error('Erro a processar botão de justificativa:', err)
        })
      }
    })

    client.on(Events.GuildCreate, async (guild) => {
      await registerCommandsForGuild(guild, enabledGameIds(guild.id)).catch(() => undefined)
    })

    this.client = client
    client.user?.setPresence({
      activities: [{ name: '/help', type: ActivityType.Watching }],
      status: 'online',
    })
    await this.registerGlobalCommands()
    await this.registerAllCommands()
    return this.getStatus()
  }

  private async tryLogin(token: string, withMessageContent: boolean, withGuildMembers: boolean): Promise<Client> {
    const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
    if (withMessageContent) intents.push(GatewayIntentBits.MessageContent)
    if (withGuildMembers) intents.push(GatewayIntentBits.GuildMembers)
    const client = new Client({ intents })
    try {
      await client.login(token)
      // `login()` resolve assim que a ligação ao gateway é estabelecida — não
      // espera que os servidores cheguem (isso só acontece com o evento
      // 'ready'). Sem isto, listGuilds() logo a seguir podia devolver uma
      // lista vazia ou incompleta, sobretudo num servidor onde o bot acabou
      // de entrar.
      await waitForReady(client)
      return client
    } catch (err) {
      await client.destroy().catch(() => undefined)
      throw err
    }
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
      return { connected: false, botTag: null, botAvatarUrl: null, guildCount: 0, messageContentEnabled: false, guildMembersEnabled: false }
    }
    return {
      connected: true,
      botTag: this.client.user.tag,
      botAvatarUrl: this.client.user.displayAvatarURL({ size: 128 }),
      guildCount: this.client.guilds.cache.size,
      messageContentEnabled: this.messageContentEnabled,
      guildMembersEnabled: this.guildMembersEnabled,
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

  /**
   * Regista os comandos fixos (Mov. Call, sorteio, verificar, help) globalmente — uma só vez,
   * não por servidor. É isto que faz a secção "Commands" aparecer no cartão de perfil do bot
   * na Discord, que só lista comandos globais; comandos por servidor não aparecem lá.
   * Pode demorar até cerca de 1 hora a propagar-se a todos os servidores na primeira vez.
   */
  async registerGlobalCommands(): Promise<void> {
    const client = this.getClient()
    await client.application?.commands.set(buildGlobalCommandDefinitions())
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

function waitForReady(client: Client, timeoutMs = 20_000): Promise<void> {
  if (client.isReady()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off(Events.ClientReady, onReady)
      reject(new Error('A Discord demorou demasiado tempo a enviar a lista de servidores. Tenta ligar outra vez.'))
    }, timeoutMs)

    function onReady() {
      clearTimeout(timeout)
      resolve()
    }

    client.once(Events.ClientReady, onReady)
  })
}

function isDisallowedIntentsError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /disallowed intents/i.test(message)
}

/** Código 40060 da Discord: outra entrega do mesmo evento (ou outra instância do bot) já respondeu a esta interação — inofensivo. */
function isAlreadyAcknowledgedError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 40060
}

function asFriendlyError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  return new Error(`Não foi possível ligar com este token: ${message}`)
}

const SEEN_INTERACTION_TTL_MS = 60_000
const seenInteractionIds = new Set<string>()

/** Marca um id de interação como visto; devolve `true` se já o tínhamos visto nos últimos 60s. */
function wasRecentlySeen(id: string): boolean {
  if (seenInteractionIds.has(id)) return true
  seenInteractionIds.add(id)
  setTimeout(() => seenInteractionIds.delete(id), SEEN_INTERACTION_TTL_MS)
  return false
}

export const discordManager = new DiscordManager()
