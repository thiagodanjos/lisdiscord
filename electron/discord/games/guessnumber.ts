import { type ChatInputCommandInteraction, EmbedBuilder, PartialGroupDMChannel, SlashCommandBuilder } from 'discord.js'
import { addCoins } from '../../store/economy'

const MIN = 1
const MAX = 50
const MAX_ATTEMPTS = 8
const TIME_LIMIT_MS = 90_000

export function guessNumberCommandDef() {
  return new SlashCommandBuilder()
    .setName('numero')
    .setDescription(`Adivinha um número secreto entre ${MIN} e ${MAX} — quantas menos tentativas, mais moedas`)
    .toJSON()
}

export async function runGuessNumber(interaction: ChatInputCommandInteraction): Promise<void> {
  const secret = MIN + Math.floor(Math.random() * (MAX - MIN + 1))
  const guildId = interaction.guildId ?? 'dm'
  let attempts = 0

  const channel = interaction.channel
  if (!channel || !channel.isTextBased() || channel instanceof PartialGroupDMChannel) return

  function buildEmbed(status: string, color: number): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle('🔢 Adivinha o Número')
      .setDescription(`Escolhi um número entre **${MIN}** e **${MAX}**. Escreve a tua tentativa no chat!`)
      .addFields({ name: 'Tentativas', value: `${attempts}/${MAX_ATTEMPTS}`, inline: true })
      .setFooter({ text: status })
  }

  await interaction.reply({ embeds: [buildEmbed('Tens 90 segundos e 8 tentativas.', 0x5865f2)] })

  await new Promise<void>((resolve) => {
    const collector = channel.createMessageCollector({
      filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
      time: TIME_LIMIT_MS,
    })

    collector.on('collect', async (msg) => {
      const guess = Number(msg.content.trim())
      attempts += 1
      msg.delete().catch(() => undefined)

      if (guess === secret) {
        const reward = Math.max(10, 60 - (attempts - 1) * 6)
        addCoins(guildId, interaction.user.id, interaction.user.tag, reward)
        await interaction.editReply({
          embeds: [buildEmbed(`🎉 Acertaste em ${attempts} tentativa(s)! +${reward} moedas`, 0x3ba55c)],
        })
        collector.stop('won')
        return
      }

      if (attempts >= MAX_ATTEMPTS) {
        await interaction.editReply({ embeds: [buildEmbed(`💀 Acabaram as tentativas! O número era **${secret}**.`, 0xed4245)] })
        collector.stop('lost')
        return
      }

      const hint = guess < secret ? '📈 Mais alto!' : '📉 Mais baixo!'
      await interaction.editReply({ embeds: [buildEmbed(hint, 0x5865f2)] })
    })

    collector.on('end', (_collected, reason) => {
      if (reason !== 'won' && reason !== 'lost') {
        interaction.editReply({ embeds: [buildEmbed(`⏱️ Tempo esgotado! O número era **${secret}**.`, 0xed4245)] }).catch(() => undefined)
      }
      resolve()
    })
  })
}
