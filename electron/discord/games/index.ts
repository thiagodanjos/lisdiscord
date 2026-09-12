import type { Guild, Interaction, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js'
import type { GameId, GameInfo } from '../../../shared/types'
import { handleMovCallCommand, movCallCommandDefs } from '../movcall'
import { blackjackCommandDef, runBlackjack } from './blackjack'
import { runDuel, duelCommandDef } from './duel'
import { economyCommandDefs, handleEconomyCommand } from './economyCommands'
import { hangmanCommandDef, runHangman } from './hangman'
import { handleSimpleCommand, simpleCommandDefs } from './simple'
import { runTicTacToe, tictactoeCommandDef } from './tictactoe'
import { runTrivia, triviaCommandDef } from './trivia'

export const GAMES: GameInfo[] = [
  { id: 'dado', name: 'Dado', command: '/dado', description: 'Lança um dado (padrão 6 lados, configurável).' },
  { id: 'moeda', name: 'Cara ou Coroa', command: '/moeda', description: 'Atira uma moeda ao ar.' },
  { id: 'ppt', name: 'Pedra, Papel ou Tesoura', command: '/ppt', description: 'Joga contra o bot.' },
  { id: 'oitobola', name: 'Bola 8 Mágica', command: '/oitobola', description: 'Faz uma pergunta e recebe uma resposta misteriosa.' },
  { id: 'trivia', name: 'Trivia', command: '/trivia', description: 'Responde a uma pergunta de escolha múltipla contra o relógio e ganha moedas.' },
  { id: 'forca', name: 'Forca', command: '/forca', description: 'Adivinha a palavra letra a letra antes que a forca se complete.' },
  { id: 'blackjack', name: 'Blackjack', command: '/blackjack', description: 'Joga 21 contra a casa, apostando moedas.' },
  { id: 'jogodavelha', name: 'Jogo do Galo', command: '/jogodavelha', description: 'Desafia outro membro para um jogo do galo por turnos.' },
  { id: 'duelo', name: 'Duelo', command: '/duelo', description: 'Combate por turnos contra outro membro, apostando moedas, com ataques e defesas.' },
  { id: 'economia', name: 'Economia', command: '/saldo · /diario · /ranking', description: 'Vê o teu saldo, reclama moedas diárias e consulta o ranking do servidor.' },
]

type CommandDef = RESTPostAPIChatInputApplicationCommandsJSONBody

function commandDefsForGame(id: GameId): CommandDef[] {
  switch (id) {
    case 'dado':
      return [simpleCommandDefs.dado()]
    case 'moeda':
      return [simpleCommandDefs.moeda()]
    case 'ppt':
      return [simpleCommandDefs.ppt()]
    case 'oitobola':
      return [simpleCommandDefs.oitobola()]
    case 'trivia':
      return [triviaCommandDef()]
    case 'forca':
      return [hangmanCommandDef()]
    case 'blackjack':
      return [blackjackCommandDef()]
    case 'jogodavelha':
      return [tictactoeCommandDef()]
    case 'duelo':
      return [duelCommandDef()]
    case 'economia':
      return [economyCommandDefs.saldo(), economyCommandDefs.diario(), economyCommandDefs.ranking()]
  }
}

export function buildCommandDefinitions(enabled: GameId[]): CommandDef[] {
  return [...enabled.flatMap((id) => commandDefsForGame(id)), ...movCallCommandDefs()]
}

export async function registerCommandsForGuild(guild: Guild, enabled: GameId[]): Promise<void> {
  await guild.commands.set(buildCommandDefinitions(enabled))
}

export async function handleGameInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return

  if (await handleSimpleCommand(interaction)) return
  if (await handleEconomyCommand(interaction)) return
  if (await handleMovCallCommand(interaction)) return

  switch (interaction.commandName) {
    case 'trivia':
      await runTrivia(interaction)
      return
    case 'forca':
      await runHangman(interaction)
      return
    case 'blackjack':
      await runBlackjack(interaction)
      return
    case 'jogodavelha':
      await runTicTacToe(interaction)
      return
    case 'duelo':
      await runDuel(interaction)
      return
    default:
      return
  }
}
