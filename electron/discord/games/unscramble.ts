import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { addCoins } from '../../store/economy'
import { updateFromModal } from './interactionUtils'

interface WordEntry {
  word: string
  category: string
}

const WORD_BANK: WordEntry[] = [
  { word: 'DISCORD', category: 'Tecnologia' },
  { word: 'TECLADO', category: 'Tecnologia' },
  { word: 'INTERNET', category: 'Tecnologia' },
  { word: 'MONITOR', category: 'Tecnologia' },
  { word: 'PORTUGAL', category: 'Geografia' },
  { word: 'MONTANHA', category: 'Geografia' },
  { word: 'OCEANO', category: 'Geografia' },
  { word: 'CHOCOLATE', category: 'Comida' },
  { word: 'BACALHAU', category: 'Comida' },
  { word: 'PASTELARIA', category: 'Comida' },
  { word: 'GUITARRA', category: 'Música' },
  { word: 'ORQUESTRA', category: 'Música' },
  { word: 'FUTEBOL', category: 'Desporto' },
  { word: 'MARATONA', category: 'Desporto' },
  { word: 'ELEFANTE', category: 'Animais' },
  { word: 'GIRAFA', category: 'Animais' },
  { word: 'CROCODILO', category: 'Animais' },
]

const TIME_LIMIT_MS = 45_000
const MODAL_TIMEOUT_MS = 60_000

export function unscrambleCommandDef() {
  return new SlashCommandBuilder()
    .setName('desembaralhar')
    .setDescription('Desembaralha as letras e escreve a palavra certa — quem acertar primeiro ganha moedas')
    .toJSON()
}

function scramble(word: string): string {
  const letters = word.split('')
  let attempt = word
  while (attempt === word) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[letters[i], letters[j]] = [letters[j], letters[i]]
    }
    attempt = letters.join('')
  }
  return attempt
}

export async function runUnscramble(interaction: ChatInputCommandInteraction): Promise<void> {
  const entry = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]
  const scrambled = scramble(entry.word)
  const guildId = interaction.guildId ?? 'dm'
  let finished = false

  function buildEmbed(status?: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🔀 Desembaralha a Palavra')
      .setDescription(`Categoria: **${entry.category}**\n\n# ${scrambled.split('').join(' ')}`)
      .setFooter({ text: status ?? 'Clica em "Responder" e escreve a palavra certa. Quem acertar primeiro ganha moedas.' })
  }

  function buildRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('unscramble:answer').setLabel('Responder').setStyle(ButtonStyle.Primary).setEmoji('✍️'),
    )
  }

  const reply = await interaction.reply({ embeds: [buildEmbed()], components: [buildRow()], withResponse: true })
  const message = reply.resource?.message
  if (!message) {
    await interaction.editReply({ content: '⚠️ Ocorreu um erro ao iniciar o jogo — tenta outra vez.' }).catch(() => undefined)
    return
  }

  const collector = message.createMessageComponentCollector({ time: TIME_LIMIT_MS })

  await new Promise<void>((resolve) => {
    collector.on('collect', async (click) => {
      if (finished) {
        await click.deferUpdate().catch(() => undefined)
        return
      }

      try {
        const modal = new ModalBuilder()
          .setCustomId('unscramble:modal')
          .setTitle('A tua resposta')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId('resposta').setLabel('Escreve a palavra').setStyle(TextInputStyle.Short).setRequired(true),
            ),
          )
        await click.showModal(modal)

        const submitted = await click
          .awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (i) => i.user.id === click.user.id })
          .catch(() => null)
        if (!submitted) return

        if (finished) {
          await submitted.reply({ content: 'Alguém já acertou antes de ti — mais sorte para a próxima!', ephemeral: true }).catch(() => undefined)
          return
        }

        const guess = submitted.fields.getTextInputValue('resposta').trim().toUpperCase()
        if (guess !== entry.word) {
          await submitted.reply({ content: '❌ Não é essa a palavra. Tenta outra vez!', ephemeral: true }).catch(() => undefined)
          return
        }

        finished = true
        const reward = 30 + entry.word.length * 5
        addCoins(guildId, submitted.user.id, submitted.user.tag, reward)
        await updateFromModal(submitted, interaction, {
          embeds: [buildEmbed(`🎉 **${submitted.user.username}** acertou! A palavra era **${entry.word}**. +${reward} moedas`).setColor(0x3ba55c)],
          components: [],
        })
        collector.stop('done')
      } catch (err) {
        console.error('Erro no desembaralhar:', err)
      }
    })

    collector.on('end', () => {
      if (!finished) {
        interaction
          .editReply({ embeds: [buildEmbed(`⏱️ Tempo esgotado! A palavra era **${entry.word}**.`).setColor(0xed4245)], components: [] })
          .catch(() => undefined)
      }
      resolve()
    })
  })
}
