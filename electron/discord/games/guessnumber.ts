import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Message,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { addCoins } from '../../store/economy'
import { updateFromModal } from './interactionUtils'

const MIN = 1
const MAX = 50
const MAX_ATTEMPTS = 8
const TIME_LIMIT_MS = 5 * 60_000
const MODAL_TIMEOUT_MS = 120_000

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
  let errorText = ''

  function buildEmbed(status: string, color: number): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle('🔢 Adivinha o Número')
      .setDescription(`Escolhi um número entre **${MIN}** e **${MAX}**. Clica em **Tentar palpite** para arriscar.`)
      .addFields({ name: 'Tentativas', value: `${attempts}/${MAX_ATTEMPTS}`, inline: true })
      .setFooter({ text: status })
  }

  function buildRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('numero:guess').setLabel('Tentar palpite').setStyle(ButtonStyle.Primary).setEmoji('🎯'),
      new ButtonBuilder().setCustomId('numero:giveup').setLabel('Desistir').setStyle(ButtonStyle.Danger),
    )
  }

  function errorEmbed(): EmbedBuilder {
    return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Palpite inválido').setDescription(errorText)
  }

  const reply = await interaction.reply({
    embeds: [buildEmbed(`Tens ${MAX_ATTEMPTS} tentativas.`, 0x5865f2)],
    components: [buildRow()],
    withResponse: true,
  })
  const message = reply.resource?.message
  if (!message) {
    await interaction.editReply({ content: '⚠️ Ocorreu um erro ao iniciar o jogo — tenta outra vez.' }).catch(() => undefined)
    return
  }

  await loop(message)

  async function loop(msg: Message): Promise<void> {
    let click
    try {
      click = await msg.awaitMessageComponent({ time: TIME_LIMIT_MS, filter: (i) => i.user.id === interaction.user.id })
    } catch {
      await interaction
        .editReply({ embeds: [buildEmbed(`⏱️ Tempo esgotado! O número era **${secret}**.`, 0xed4245)], components: [] })
        .catch(() => undefined)
      return
    }

    try {
      if (click.customId === 'numero:giveup') {
        await click.update({ embeds: [buildEmbed(`👋 Desististe. O número era **${secret}**.`, 0xed4245)], components: [] })
        return
      }

      const modal = new ModalBuilder()
        .setCustomId('numero:modal')
        .setTitle('O teu palpite')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('palpite')
              .setLabel(`Um número entre ${MIN} e ${MAX}`)
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        )
      await click.showModal(modal)

      try {
        const submitted = await click.awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })
        const raw = submitted.fields.getTextInputValue('palpite').trim()
        const guess = Number(raw)

        if (!/^\d+$/.test(raw) || guess < MIN || guess > MAX) {
          errorText = `Escreve um número entre ${MIN} e ${MAX}.`
          await updateFromModal(submitted, interaction, { embeds: [errorEmbed()], components: [buildRow()] })
          await loop(msg)
          return
        }

        attempts += 1

        if (guess === secret) {
          const reward = Math.max(10, 60 - (attempts - 1) * 6)
          addCoins(guildId, interaction.user.id, interaction.user.tag, reward)
          await updateFromModal(submitted, interaction, {
            embeds: [buildEmbed(`🎉 Acertaste em ${attempts} tentativa(s)! +${reward} moedas`, 0x3ba55c)],
            components: [],
          })
          return
        }

        if (attempts >= MAX_ATTEMPTS) {
          await updateFromModal(submitted, interaction, {
            embeds: [buildEmbed(`💀 Acabaram as tentativas! O número era **${secret}**.`, 0xed4245)],
            components: [],
          })
          return
        }

        const hint = guess < secret ? '📈 Mais alto!' : '📉 Mais baixo!'
        await updateFromModal(submitted, interaction, { embeds: [buildEmbed(hint, 0x5865f2)], components: [buildRow()] })
        await loop(msg)
      } catch {
        await interaction.editReply({ embeds: [buildEmbed('Tentativa cancelada — tenta outra vez.', 0x5865f2)], components: [buildRow()] })
        await loop(msg)
      }
    } catch (err) {
      console.error('Erro no adivinha o número:', err)
      await interaction
        .editReply({ embeds: [buildEmbed('⚠️ Ocorreu um erro inesperado — jogo cancelado.', 0xed4245)], components: [] })
        .catch(() => undefined)
    }
  }
}
