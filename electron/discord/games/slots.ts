import { type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import { addCoins, tryCharge } from '../../store/economy'

const SYMBOLS = ['🍒', '🍋', '🍇', '🔔', '⭐', '7️⃣']
const JACKPOT_MULTIPLIER = 20
const TRIPLE_MULTIPLIER = 8
const DOUBLE_MULTIPLIER = 2

export function slotsCommandDef() {
  return new SlashCommandBuilder()
    .setName('caca-niqueis')
    .setDescription('Gira os três rolos — três 7️⃣ é o jackpot!')
    .addIntegerOption((o) => o.setName('aposta').setDescription('Quantidade a apostar').setRequired(true).setMinValue(10).setMaxValue(5000))
    .toJSON()
}

export async function runSlots(interaction: ChatInputCommandInteraction): Promise<void> {
  const bet = interaction.options.getInteger('aposta', true)
  const guildId = interaction.guildId ?? 'dm'

  if (!tryCharge(guildId, interaction.user.id, interaction.user.tag, bet)) {
    await interaction.reply({ content: `❌ Não tens ${bet} moedas suficientes para apostar.`, ephemeral: true })
    return
  }

  try {
    await interaction.reply({ content: '🎰 | ❓ | ❓ | ❓ |' })
    const reels: string[] = []
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 550))
      reels.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)])
      const revealed = [...reels, ...Array(3 - reels.length).fill('❓')]
      await interaction.editReply({ content: `🎰 | ${revealed.join(' | ')} |` })
    }

    const [a, b, c] = reels
    let multiplier = 0
    if (a === b && b === c) multiplier = a === '7️⃣' ? JACKPOT_MULTIPLIER : TRIPLE_MULTIPLIER
    else if (a === b || b === c || a === c) multiplier = DOUBLE_MULTIPLIER

    const prize = bet * multiplier
    if (prize > 0) addCoins(guildId, interaction.user.id, interaction.user.tag, prize)

    const footer =
      multiplier === JACKPOT_MULTIPLIER
        ? `💰 JACKPOT! +${prize} moedas!`
        : multiplier > 0
          ? `🎉 Ganhaste! +${prize} moedas.`
          : `Perdeste a aposta de ${bet} moedas.`

    const embed = new EmbedBuilder()
      .setColor(multiplier > 0 ? 0x3ba55c : 0xed4245)
      .setTitle('🎰 Caça-níqueis')
      .setDescription(`| ${reels.join(' | ')} |`)
      .setFooter({ text: footer })

    await interaction.editReply({ content: '', embeds: [embed] })
  } catch (err) {
    console.error('Erro no caça-níqueis:', err)
    addCoins(guildId, interaction.user.id, interaction.user.tag, bet)
    await interaction
      .editReply({ content: '⚠️ Ocorreu um erro inesperado — a tua aposta foi devolvida.', embeds: [] })
      .catch(() => undefined)
  }
}
