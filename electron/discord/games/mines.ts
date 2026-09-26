import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import { addCoins, tryCharge } from '../../store/economy'

const ROWS = 4
const COLS = 5
const CELLS = ROWS * COLS
const HOUSE_EDGE = 0.97
const IDLE_MS = 90_000

export function minesCommandDef() {
  return new SlashCommandBuilder()
    .setName('minas')
    .setDescription('Campo minado com aposta — abre casas seguras e retira antes de encontrar uma mina')
    .addIntegerOption((o) => o.setName('aposta').setDescription('Quantas moedas apostar').setRequired(true).setMinValue(10).setMaxValue(5000))
    .addIntegerOption((o) => o.setName('minas').setDescription('Quantas minas no campo (1–10, padrão 3) — mais minas, mais lucro').setMinValue(1).setMaxValue(10))
    .toJSON()
}

/** Multiplicador justo depois de `safe` casas seguras abertas, com a margem da casa aplicada uma vez. */
export function minesMultiplier(mines: number, safe: number): number {
  let m = 1
  for (let i = 0; i < safe; i++) m *= (CELLS - i) / (CELLS - mines - i)
  return Math.floor(m * HOUSE_EDGE * 100) / 100
}

export async function runMines(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId ?? 'dm'
  const bet = interaction.options.getInteger('aposta', true)
  const mineCount = interaction.options.getInteger('minas') ?? 3

  if (!tryCharge(guildId, interaction.user.id, interaction.user.tag, bet)) {
    await interaction.reply({ content: `❌ Não tens ${bet} moedas suficientes. Usa \`/saldo\` para ver quanto tens.`, ephemeral: true })
    return
  }

  const mines = new Set<number>()
  while (mines.size < mineCount) mines.add(Math.floor(Math.random() * CELLS))
  const opened = new Set<number>()
  let over = false
  let exploded: number | null = null

  const current = () => minesMultiplier(mineCount, opened.size)
  const next = () => minesMultiplier(mineCount, opened.size + 1)

  const grid = (): ActionRowBuilder<ButtonBuilder>[] => {
    const rows: ActionRowBuilder<ButtonBuilder>[] = []
    for (let r = 0; r < ROWS; r++) {
      const row = new ActionRowBuilder<ButtonBuilder>()
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c
        const b = new ButtonBuilder().setCustomId(`minas:${i}`)
        if (opened.has(i)) b.setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true)
        else if (over && mines.has(i)) b.setEmoji(i === exploded ? '💥' : '💣').setStyle(ButtonStyle.Danger).setDisabled(true)
        else b.setEmoji(over ? '▪️' : '❔').setStyle(ButtonStyle.Secondary).setDisabled(over)
        row.addComponents(b)
      }
      rows.push(row)
    }
    if (!over) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('minas:cashout')
            .setLabel(opened.size > 0 ? `Retirar ${Math.floor(bet * current())} moedas (${current().toFixed(2)}x)` : 'Abre uma casa primeiro')
            .setEmoji('💰')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(opened.size === 0),
        ),
      )
    }
    return rows
  }

  const embed = (status: string, color = 0x22d3ee) =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('💣 Campo minado')
      .setDescription(status)
      .addFields(
        { name: 'Aposta', value: `${bet} moedas`, inline: true },
        { name: 'Minas', value: `${mineCount}`, inline: true },
        { name: 'Multiplicador', value: `${current().toFixed(2)}x → próxima ${next().toFixed(2)}x`, inline: true },
      )

  const reply = await interaction.reply({ embeds: [embed('Escolhe uma casa. Cada 💎 aumenta o prémio — um 💣 e perdes tudo.')], components: grid(), withResponse: true })
  const message = reply.resource?.message
  if (!message) return

  const finish = (payout: number) => {
    over = true
    if (payout > 0) addCoins(guildId, interaction.user.id, interaction.user.tag, payout)
  }

  const collector = message.createMessageComponentCollector({ idle: IDLE_MS })
  collector.on('collect', async (click) => {
    try {
      if (click.user.id !== interaction.user.id) {
        await click.reply({ content: 'Este campo não é teu — usa `/minas` para jogares.', ephemeral: true })
        return
      }
      if (over) return

      if (click.customId === 'minas:cashout') {
        const payout = Math.floor(bet * current())
        finish(payout)
        collector.stop('cashout')
        await click.update({ embeds: [embed(`💰 Retiraste **${payout} moedas** (${current().toFixed(2)}x)!`, 0x22e584)], components: grid() })
        return
      }

      const cell = Number(click.customId.split(':')[1])
      if (opened.has(cell)) return
      if (mines.has(cell)) {
        exploded = cell
        finish(0)
        collector.stop('boom')
        await click.update({ embeds: [embed(`💥 Mina! Perdeste a aposta de ${bet} moedas.`, 0xf43f5e)], components: grid() })
        return
      }
      opened.add(cell)
      if (opened.size === CELLS - mineCount) {
        const payout = Math.floor(bet * current())
        finish(payout)
        collector.stop('cleared')
        await click.update({ embeds: [embed(`🏆 Limpaste o campo todo! **+${payout} moedas** (${current().toFixed(2)}x).`, 0xf5b53d)], components: grid() })
        return
      }
      await click.update({ embeds: [embed(`💎 Seguro! Continua ou retira **${Math.floor(bet * current())} moedas**.`)], components: grid() })
    } catch (err) {
      console.error('[minas] Erro:', err)
    }
  })
  collector.on('end', async (_c, reason) => {
    if (reason !== 'idle' || over) return
    // Parado sem retirar: se já abriu casas, recebe o que tinha; se não abriu nenhuma, a aposta volta.
    const payout = opened.size > 0 ? Math.floor(bet * current()) : bet
    finish(payout)
    await interaction
      .editReply({ embeds: [embed(`⏱️ Tempo esgotado — recebeste **${payout} moedas** automaticamente.`, 0x99aab5)], components: grid() })
      .catch(() => undefined)
  })
}
