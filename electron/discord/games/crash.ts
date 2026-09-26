import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import { addCoins, tryCharge } from '../../store/economy'

const TICK_MS = 1200
const GROWTH = 0.08
const MAX_CRASH = 100
const HOUSE_EDGE = 0.97

export function crashCommandDef() {
  return new SlashCommandBuilder()
    .setName('crash')
    .setDescription('O foguete sobe e o multiplicador cresce — retira antes de ele rebentar!')
    .addIntegerOption((o) => o.setName('aposta').setDescription('Quantas moedas apostar').setRequired(true).setMinValue(10).setMaxValue(5000))
    .addNumberOption((o) => o.setName('retirar_em').setDescription('Retirar sozinho neste multiplicador (ex.: 2.5)').setMinValue(1.1).setMaxValue(MAX_CRASH))
    .toJSON()
}

/** Ponto de rebentamento com a distribuição clássica do crash (a maioria cedo, raramente muito alto). */
export function rollCrashPoint(u = Math.random()): number {
  const point = Math.floor((HOUSE_EDGE / (1 - u)) * 100) / 100
  return Math.min(MAX_CRASH, Math.max(1, point))
}

export function multiplierAt(seconds: number): number {
  return Math.floor(Math.exp(GROWTH * seconds) * 100) / 100
}

export async function runCrash(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId ?? 'dm'
  const bet = interaction.options.getInteger('aposta', true)
  const autoCashout = interaction.options.getNumber('retirar_em')

  if (!tryCharge(guildId, interaction.user.id, interaction.user.tag, bet)) {
    await interaction.reply({ content: `❌ Não tens ${bet} moedas suficientes. Usa \`/saldo\` para ver quanto tens.`, ephemeral: true })
    return
  }

  const crashAt = rollCrashPoint()
  let multiplier = 1
  let cashedAt: number | null = null

  const rocket = (m: number, crashed: boolean) => {
    const bars = Math.max(1, Math.min(12, 1 + Math.floor(Math.log2(m) * 2)))
    return `${'▰'.repeat(bars)}${'▱'.repeat(12 - bars)} ${crashed ? '💥' : '🚀'}`
  }

  const embed = (status: string, color: number, crashed = false) =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🚀 Crash')
      .setDescription(`# ${multiplier.toFixed(2)}x\n${rocket(multiplier, crashed)}\n\n${status}`)
      .setFooter({ text: `Aposta: ${bet} moedas${autoCashout ? ` · retirada automática em ${autoCashout.toFixed(2)}x` : ''}` })

  const row = (disabled = false) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('crash:cashout')
        .setLabel(`Retirar ${Math.floor(bet * multiplier)} moedas`)
        .setEmoji('💰')
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
    )

  if (crashAt <= 1) {
    await interaction.reply({ embeds: [embed(`💥 Rebentou logo em **1.00x** — perdeste ${bet} moedas.`, 0xf43f5e, true)] })
    return
  }

  const reply = await interaction.reply({ embeds: [embed('A subir… carrega em **Retirar** antes que rebente!', 0x22d3ee)], components: [row()], withResponse: true })
  const message = reply.resource?.message
  if (!message) return

  const collector = message.createMessageComponentCollector({ time: 120_000 })
  collector.on('collect', async (click) => {
    if (click.user.id !== interaction.user.id) {
      await click.reply({ content: 'Esta ronda não é tua — usa `/crash` para jogares.', ephemeral: true }).catch(() => undefined)
      return
    }
    if (cashedAt === null && multiplier < crashAt) cashedAt = multiplier
    await click.deferUpdate().catch(() => undefined)
  })

  const start = Date.now()
  try {
    while (cashedAt === null) {
      await new Promise((r) => setTimeout(r, TICK_MS))
      const m = multiplierAt((Date.now() - start) / 1000)
      if (autoCashout && m >= autoCashout && autoCashout < crashAt) {
        multiplier = autoCashout
        cashedAt = autoCashout
        break
      }
      if (m >= crashAt) {
        multiplier = crashAt
        break
      }
      multiplier = m
      if (cashedAt === null) await interaction.editReply({ embeds: [embed('A subir… carrega em **Retirar** antes que rebente!', 0x22d3ee)], components: [row()] })
    }
  } finally {
    collector.stop()
  }

  if (cashedAt !== null) {
    multiplier = cashedAt
    const payout = Math.floor(bet * cashedAt)
    addCoins(guildId, interaction.user.id, interaction.user.tag, payout)
    await interaction
      .editReply({ embeds: [embed(`💰 Retiraste em **${cashedAt.toFixed(2)}x** — **+${payout} moedas**! (ia rebentar em ${crashAt.toFixed(2)}x)`, 0x22e584)], components: [] })
      .catch(() => undefined)
  } else {
    await interaction.editReply({ embeds: [embed(`💥 Rebentou em **${crashAt.toFixed(2)}x** — perdeste ${bet} moedas.`, 0xf43f5e, true)], components: [] }).catch(() => undefined)
  }
}
