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

interface HangmanWord {
  word: string
  hint: string
  category: string
}

const WORD_BANK: HangmanWord[] = [
  { word: 'ELEFANTE', hint: 'Mamífero terrestre com tromba', category: 'Animais' },
  { word: 'GIRAFA', hint: 'Tem o pescoço mais comprido do reino animal', category: 'Animais' },
  { word: 'PINGUIM', hint: 'Ave que não voa e vive no frio', category: 'Animais' },
  { word: 'CROCODILO', hint: 'Réptil que vive em rios e pântanos', category: 'Animais' },
  { word: 'PORTUGAL', hint: 'País com a bandeira verde e vermelha', category: 'Geografia' },
  { word: 'MONTANHA', hint: 'Elevação natural do terreno', category: 'Geografia' },
  { word: 'ARQUIPELAGO', hint: 'Conjunto de ilhas', category: 'Geografia' },
  { word: 'COMPUTADOR', hint: 'Máquina para processar dados', category: 'Tecnologia' },
  { word: 'TECLADO', hint: 'Usa-se para escrever no computador', category: 'Tecnologia' },
  { word: 'ALGORITMO', hint: 'Sequência de passos para resolver um problema', category: 'Tecnologia' },
  { word: 'CHOCOLATE', hint: 'Doce feito de cacau', category: 'Comida' },
  { word: 'BACALHAU', hint: 'Peixe muito popular na culinária portuguesa', category: 'Comida' },
  { word: 'PASTELARIA', hint: 'Local onde se compram doces e bolos', category: 'Comida' },
  { word: 'GUITARRA', hint: 'Instrumento musical de cordas', category: 'Música' },
  { word: 'ORQUESTRA', hint: 'Grande grupo de músicos', category: 'Música' },
  { word: 'FUTEBOL', hint: 'Desporto mais popular em Portugal', category: 'Desporto' },
  { word: 'MARATONA', hint: 'Corrida de longa distância', category: 'Desporto' },
]

const GALLOWS = [
  '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========\n```',
  '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========\n```',
  '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========\n```',
  '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========\n```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========\n```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========\n```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========\n```',
]

const MAX_WRONG = GALLOWS.length - 1
const TIME_LIMIT_MS = 5 * 60_000
const MODAL_TIMEOUT_MS = 120_000
const LETTER_REGEX = /^[a-zA-ZÀ-ÿ]$/

export function hangmanCommandDef() {
  return new SlashCommandBuilder().setName('forca').setDescription('Joga ao jogo da forca — adivinha a palavra letra a letra').toJSON()
}

export async function runHangman(interaction: ChatInputCommandInteraction): Promise<void> {
  const entry = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]
  const word = entry.word
  const guessed = new Set<string>()
  let wrongCount = 0
  let errorText = ''

  function masked(): string {
    return word
      .split('')
      .map((ch) => (guessed.has(ch) ? ch : '＿'))
      .join(' ')
  }

  function buildEmbed(status?: string): EmbedBuilder {
    const wrongLetters = [...guessed].filter((l) => !word.includes(l))
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🪢 Forca — ${entry.category}`)
      .setDescription(`${GALLOWS[wrongCount]}\n**Palavra:** ${masked()}\n\n💡 Dica: ${entry.hint}`)
      .addFields(
        { name: 'Letras erradas', value: wrongLetters.length ? wrongLetters.join(', ') : '—', inline: true },
        { name: 'Tentativas', value: `${MAX_WRONG - wrongCount} restantes`, inline: true },
      )
      .setFooter({ text: status ?? 'Clica em "Adivinhar letra" para arriscar.' })
  }

  function buildRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('forca:guess').setLabel('Adivinhar letra').setStyle(ButtonStyle.Primary).setEmoji('🔤'),
      new ButtonBuilder().setCustomId('forca:giveup').setLabel('Desistir').setStyle(ButtonStyle.Danger),
    )
  }

  function errorEmbed(): EmbedBuilder {
    return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Letra inválida').setDescription(errorText)
  }

  const reply = await interaction.reply({ embeds: [buildEmbed()], components: [buildRow()], withResponse: true })
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
        .editReply({ embeds: [buildEmbed(`⏱️ Tempo esgotado! A palavra era **${word}**.`).setColor(0xed4245)], components: [] })
        .catch(() => undefined)
      return
    }

    try {
      if (click.customId === 'forca:giveup') {
        await click.update({ embeds: [buildEmbed(`👋 Desististe. A palavra era **${word}**.`).setColor(0xed4245)], components: [] })
        return
      }

      const modal = new ModalBuilder()
        .setCustomId('forca:modal')
        .setTitle('Adivinhar letra')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('letra').setLabel('Uma letra').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1),
          ),
        )
      await click.showModal(modal)

      try {
        const submitted = await click.awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })
        const raw = submitted.fields.getTextInputValue('letra').trim().toUpperCase()

        if (!LETTER_REGEX.test(raw)) {
          errorText = 'Escreve só uma letra.'
          await updateFromModal(submitted, interaction, { embeds: [errorEmbed()], components: [buildRow()] })
          await loop(msg)
          return
        }

        if (guessed.has(raw)) {
          errorText = `Já tentaste a letra **${raw}**. Escolhe outra.`
          await updateFromModal(submitted, interaction, { embeds: [errorEmbed()], components: [buildRow()] })
          await loop(msg)
          return
        }

        guessed.add(raw)
        if (!word.includes(raw)) wrongCount += 1

        const wordDone = word.split('').every((ch) => guessed.has(ch))
        const lost = wrongCount >= MAX_WRONG

        if (wordDone) {
          const reward = 60 + word.length * 5
          addCoins(interaction.guildId ?? 'dm', interaction.user.id, interaction.user.tag, reward)
          await updateFromModal(submitted, interaction, {
            embeds: [buildEmbed(`🎉 Acertaste a palavra! +${reward} moedas`).setColor(0x3ba55c)],
            components: [],
          })
          return
        }

        if (lost) {
          await updateFromModal(submitted, interaction, {
            embeds: [buildEmbed(`💀 Sem tentativas! A palavra era **${word}**.`).setColor(0xed4245)],
            components: [],
          })
          return
        }

        await updateFromModal(submitted, interaction, { embeds: [buildEmbed()], components: [buildRow()] })
        await loop(msg)
      } catch {
        // modal fechada sem submeter — mantém-se no mesmo estado
        await interaction.editReply({ embeds: [buildEmbed()], components: [buildRow()] })
        await loop(msg)
      }
    } catch (err) {
      console.error('Erro na forca:', err)
      await interaction
        .editReply({ embeds: [buildEmbed('⚠️ Ocorreu um erro inesperado — jogo cancelado.').setColor(0xed4245)], components: [] })
        .catch(() => undefined)
    }
  }
}
