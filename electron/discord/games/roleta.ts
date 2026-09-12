import { type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import { addCoins, tryCharge } from '../../store/economy'

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

type BetChoice = 'vermelho' | 'preto' | 'verde'

const PAYOUT_MULTIPLIER: Record<BetChoice, number> = { vermelho: 2, preto: 2, verde: 14 }

export function roletaCommandDef() {
  return new SlashCommandBuilder()
    .setName('roleta')
    .setDescription('Aposta na cor da roleta — vermelho e preto pagam 2x, verde paga 14x')
    .addIntegerOption((o) => o.setName('aposta').setDescription('Quantidade a apostar').setRequired(true).setMinValue(10).setMaxValue(5000))
    .addStringOption((o) =>
      o
        .setName('cor')
        .setDescription('Em que cor apostar')
        .setRequired(true)
        .addChoices(
          { name: 'Vermelho (2x)', value: 'vermelho' },
          { name: 'Preto (2x)', value: 'preto' },
          { name: 'Verde — só o 0 (14x)', value: 'verde' },
        ),
    )
    .toJSON()
}

export async function runRoleta(interaction: ChatInputCommandInteraction): Promise<void> {
  const bet = interaction.options.getInteger('aposta', true)
  const choice = interaction.options.getString('cor', true) as BetChoice
  const guildId = interaction.guildId ?? 'dm'

  if (!tryCharge(guildId, interaction.user.id, interaction.user.tag, bet)) {
    await interaction.reply({ content: `❌ Não tens ${bet} moedas suficientes para apostar.`, ephemeral: true })
    return
  }

  try {
    await interaction.reply({ content: '🎡 A roleta está a girar…' })
    await new Promise((r) => setTimeout(r, 1500))

    const number = Math.floor(Math.random() * 37) // 0-36
    const color: BetChoice = number === 0 ? 'verde' : RED_NUMBERS.has(number) ? 'vermelho' : 'preto'
    const colorEmoji = { vermelho: '🔴', preto: '⚫', verde: '🟢' }[color]
    const won = choice === color

    let footer: string
    if (won) {
      const prize = bet * PAYOUT_MULTIPLIER[choice]
      addCoins(guildId, interaction.user.id, interaction.user.tag, prize)
      footer = `🎉 Ganhaste! +${prize} moedas.`
    } else {
      footer = `Perdeste a aposta de ${bet} moedas.`
    }

    const embed = new EmbedBuilder()
      .setColor(won ? 0x3ba55c : 0xed4245)
      .setTitle('🎡 Roleta')
      .setDescription(`Saiu o número **${number}** ${colorEmoji}\n\nApostaste em **${choice}**.`)
      .setFooter({ text: footer })

    await interaction.editReply({ content: '', embeds: [embed] })
  } catch (err) {
    console.error('Erro na roleta:', err)
    addCoins(guildId, interaction.user.id, interaction.user.tag, bet)
    await interaction
      .editReply({ content: '⚠️ Ocorreu um erro inesperado — a tua aposta foi devolvida.', embeds: [] })
      .catch(() => undefined)
  }
}
