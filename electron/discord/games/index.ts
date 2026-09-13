import type { Guild, Interaction, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js'
import type { GameId, GameInfo } from '../../../shared/types'
import { handleGiveawayCommand, sorteioCommandDef } from '../giveawayCommand'
import { handleMovCallCommand, movCallCommandDefs } from '../movcall'
import { blackjackCommandDef, runBlackjack } from './blackjack'
import { runDuel, duelCommandDef } from './duel'
import { economyCommandDefs, handleEconomyCommand } from './economyCommands'
import { guessNumberCommandDef, runGuessNumber } from './guessnumber'
import { hangmanCommandDef, runHangman } from './hangman'
import { raceCommandDef, runRace } from './race'
import { roletaCommandDef, runRoleta } from './roleta'
import { handleSimpleCommand, simpleCommandDefs } from './simple'
import { runSlots, slotsCommandDef } from './slots'
import { runTicTacToe, tictactoeCommandDef } from './tictactoe'
import { runTrivia, triviaCommandDef } from './trivia'
import { runUnscramble, unscrambleCommandDef } from './unscramble'

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
  { id: 'roleta', name: 'Roleta', command: '/roleta', description: 'Aposta na cor da roleta — vermelho e preto pagam 2x, verde paga 14x.' },
  { id: 'cacaniqueis', name: 'Caça-níqueis', command: '/caca-niqueis', description: 'Gira os três rolos — três 7️⃣ é o jackpot (20x).' },
  { id: 'corrida', name: 'Corrida', command: '/corrida', description: 'Aposta em qual bicho vence a corrida animada (paga 3.5x).' },
  { id: 'numero', name: 'Adivinha o Número', command: '/numero', description: 'Adivinha um número secreto entre 1 e 50 — quantas menos tentativas, mais moedas.' },
  { id: 'desembaralhar', name: 'Desembaralhar', command: '/desembaralhar', description: 'Desembaralha as letras e escreve a palavra certa antes dos outros.' },
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
    case 'roleta':
      return [roletaCommandDef()]
    case 'cacaniqueis':
      return [slotsCommandDef()]
    case 'corrida':
      return [raceCommandDef()]
    case 'numero':
      return [guessNumberCommandDef()]
    case 'desembaralhar':
      return [unscrambleCommandDef()]
    case 'economia':
      return [economyCommandDefs.saldo(), economyCommandDefs.diario(), economyCommandDefs.ranking()]
  }
}

export function buildCommandDefinitions(enabled: GameId[]): CommandDef[] {
  return [...enabled.flatMap((id) => commandDefsForGame(id)), ...movCallCommandDefs(), sorteioCommandDef()]
}

export async function registerCommandsForGuild(guild: Guild, enabled: GameId[]): Promise<void> {
  await guild.commands.set(buildCommandDefinitions(enabled))
}

export async function handleGameInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return

  if (await handleSimpleCommand(interaction)) return
  if (await handleEconomyCommand(interaction)) return
  if (await handleMovCallCommand(interaction)) return
  if (await handleGiveawayCommand(interaction)) return

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
    case 'roleta':
      await runRoleta(interaction)
      return
    case 'caca-niqueis':
      await runSlots(interaction)
      return
    case 'corrida':
      await runRace(interaction)
      return
    case 'numero':
      await runGuessNumber(interaction)
      return
    case 'desembaralhar':
      await runUnscramble(interaction)
      return
    default:
      return
  }
}
