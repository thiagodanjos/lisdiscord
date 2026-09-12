import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js'
import { addCoins } from '../../store/economy'

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

const TURN_SECONDS = 45
const REWARD = 80

export function tictactoeCommandDef() {
  return new SlashCommandBuilder()
    .setName('jogodavelha')
    .setDescription('Desafia outro jogador para o jogo do galo (X e O)')
    .addUserOption((o) => o.setName('adversario').setDescription('Quem vais desafiar').setRequired(true))
    .toJSON()
}

export async function runTicTacToe(interaction: ChatInputCommandInteraction): Promise<void> {
  const opponent = interaction.options.getUser('adversario', true)
  const guildId = interaction.guildId ?? 'dm'

  if (opponent.bot) {
    await interaction.reply({ content: '❌ Não podes desafiar um bot.', ephemeral: true })
    return
  }
  if (opponent.id === interaction.user.id) {
    await interaction.reply({ content: '❌ Não podes desafiar-te a ti mesmo.', ephemeral: true })
    return
  }

  const players = [interaction.user, opponent] // players[0] = X, players[1] = O
  const board: Array<'X' | 'O' | null> = Array(9).fill(null)
  let turn = 0 // index into players

  function buildRows(): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = []
    for (let r = 0; r < 3; r++) {
      const row = new ActionRowBuilder<ButtonBuilder>()
      for (let c = 0; c < 3; c++) {
        const idx = r * 3 + c
        const value = board[idx]
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ttt:${idx}`)
            .setLabel(value ?? '‎')
            .setStyle(value === 'X' ? ButtonStyle.Danger : value === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(value !== null),
        )
      }
      rows.push(row)
    }
    return rows
  }

  function buildEmbed(status: string, color: number): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle('⭕ Jogo do Galo')
      .setDescription(`❌ ${players[0].username}  **vs**  ⭕ ${players[1].username}`)
      .setFooter({ text: status })
  }

  function winner(): 'X' | 'O' | 'draw' | null {
    for (const [a, b, c] of WIN_LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]
    }
    if (board.every((cell) => cell !== null)) return 'draw'
    return null
  }

  const reply = await interaction.reply({
    embeds: [buildEmbed(`Vez de ${players[0].username} (❌)`, 0x5865f2)],
    components: buildRows(),
    withResponse: true,
  })
  const message = reply.resource?.message
  if (!message) return

  const collector = message.createMessageComponentCollector({ time: TURN_SECONDS * 1000 * 9 })

  await new Promise<void>((resolve) => {
    collector.on('collect', async (click) => {
      const currentPlayer = players[turn]
      if (click.user.id !== currentPlayer.id) {
        await click.reply({ content: `Não é a tua vez — é a vez de ${currentPlayer.username}.`, ephemeral: true })
        return
      }

      const idx = Number(click.customId.split(':')[1])
      if (board[idx] !== null) {
        await click.deferUpdate()
        return
      }

      board[idx] = turn === 0 ? 'X' : 'O'
      const result = winner()

      if (result === 'X' || result === 'O') {
        const winningPlayer = result === 'X' ? players[0] : players[1]
        addCoins(guildId, winningPlayer.id, winningPlayer.tag, REWARD)
        const finalRows = buildRows().map((row) => {
          row.components.forEach((btn) => btn.setDisabled(true))
          return row
        })
        await click.update({
          embeds: [buildEmbed(`🎉 ${winningPlayer.username} venceu! +${REWARD} moedas`, 0x3ba55c)],
          components: finalRows,
        })
        collector.stop('done')
        return
      }

      if (result === 'draw') {
        const finalRows = buildRows().map((row) => {
          row.components.forEach((btn) => btn.setDisabled(true))
          return row
        })
        await click.update({ embeds: [buildEmbed('🤝 Empate!', 0xf0b232)], components: finalRows })
        collector.stop('done')
        return
      }

      turn = turn === 0 ? 1 : 0
      const nextPlayer = players[turn]
      const mark = turn === 0 ? '❌' : '⭕'
      await click.update({ embeds: [buildEmbed(`Vez de ${nextPlayer.username} (${mark})`, 0x5865f2)], components: buildRows() })
    })

    collector.on('end', (_collected, reason) => {
      if (reason !== 'done') {
        interaction.editReply({ embeds: [buildEmbed('⏱️ Tempo esgotado — jogo cancelado.', 0xed4245)], components: [] }).catch(() => undefined)
      }
      resolve()
    })
  })
}
