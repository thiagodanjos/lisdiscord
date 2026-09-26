import { type Guild, type Interaction, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js'
import type { GameId } from '../../../shared/types'
import { addEmojiBotCommandDef, copyEmojiCommandDef, handleAddEmojiBotCommand, handleCopyEmojiCommand } from '../emojiCommand'
import { embedBuilderCommandDef, handleEmbedBuilderCommand } from '../embedBuilderCommand'
import { cleanCommandDef, handleCleanCommand } from '../cleanCommand'
import { handleHelpCommand, helpCommandDef } from '../helpCommand'
import { addEmoteServerCommandDef, addStickerCommandDef, handleServerAssetsCommand } from '../serverAssetsCommands'
import { handleUtilityCommand, utilityCommandDefs } from '../utilityCommands'
import { handleGiveawayCommand, sorteioCommandDef } from '../giveawayCommand'
import { handleMovCallCommand, movCallCommandDefs } from '../movcall'
import { handleVerifyCommand, verificarCommandDef } from '../verifyCommand'
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
import { runTermo, termoCommandDef } from './termo'
import { minesCommandDef, runMines } from './mines'
import { crashCommandDef, runCrash } from './crash'
import { memoryCommandDef, runMemory } from './memory'
import { runShip, shipCommandDef } from './ship'


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
    case 'termo':
      return [termoCommandDef()]
    case 'minas':
      return [minesCommandDef()]
    case 'crash':
      return [crashCommandDef()]
    case 'memoria':
      return [memoryCommandDef()]
    case 'ship':
      return [shipCommandDef()]
    case 'economia':
      return [economyCommandDefs.saldo(), economyCommandDefs.diario(), economyCommandDefs.ranking()]
  }
}

/**
 * Comandos fixos, iguais em todos os servidores. Registados tanto por servidor (instantâneo,
 * é o que os torna utilizáveis logo a seguir a ligar o bot) como globalmente (demora até ~1h
 * a propagar-se da primeira vez, mas é o que faz a secção "Commands" aparecer no cartão de
 * perfil do bot na Discord — essa secção só lista comandos globais). Quando um comando de
 * servidor e um global têm o mesmo nome, a Discord usa o do servidor nesse servidor, por isso
 * não há duplicados nem risco de os comandos ficarem indisponíveis enquanto o global propaga.
 */
export function buildGlobalCommandDefinitions(): CommandDef[] {
  return [
    ...movCallCommandDefs(),
    sorteioCommandDef(),
    verificarCommandDef(),
    helpCommandDef(),
    addEmojiBotCommandDef(),
    copyEmojiCommandDef(),
    embedBuilderCommandDef(),
    cleanCommandDef(),
    addEmoteServerCommandDef(),
    addStickerCommandDef(),
    ...utilityCommandDefs(),
  ]
}

/** Comandos por servidor: os fixos (para ficarem disponíveis já) + os jogos que o servidor ativou. */
export function buildCommandDefinitions(enabled: GameId[]): CommandDef[] {
  return [...enabled.flatMap((id) => commandDefsForGame(id)), ...buildGlobalCommandDefinitions()]
}

export async function registerCommandsForGuild(guild: Guild, enabled: GameId[]): Promise<void> {
  await guild.commands.set(buildCommandDefinitions(enabled))
}

export async function handleGameInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return

  if (await handleHelpCommand(interaction)) return
  if (await handleSimpleCommand(interaction)) return
  if (await handleEconomyCommand(interaction)) return
  if (await handleMovCallCommand(interaction)) return
  if (await handleGiveawayCommand(interaction)) return
  if (await handleVerifyCommand(interaction)) return
  if (await handleAddEmojiBotCommand(interaction)) return
  if (await handleCopyEmojiCommand(interaction)) return
  if (await handleEmbedBuilderCommand(interaction)) return
  if (await handleCleanCommand(interaction)) return
  if (await handleServerAssetsCommand(interaction)) return
  if (await handleUtilityCommand(interaction)) return

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
    case 'termo':
      await runTermo(interaction)
      return
    case 'minas':
      await runMines(interaction)
      return
    case 'crash':
      await runCrash(interaction)
      return
    case 'memoria':
      await runMemory(interaction)
      return
    case 'ship':
      await runShip(interaction)
      return
    default:
      return
  }
}
