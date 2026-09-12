import { type ChatInputCommandInteraction, EmbedBuilder, PartialGroupDMChannel, SlashCommandBuilder } from 'discord.js'
import { addCoins } from '../../store/economy'

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
const TIME_LIMIT_MS = 120_000
const LETTER_REGEX = /^[a-zA-ZÀ-ÿ]$/

export function hangmanCommandDef() {
  return new SlashCommandBuilder().setName('forca').setDescription('Joga ao jogo da forca — adivinha a palavra letra a letra').toJSON()
}

export async function runHangman(interaction: ChatInputCommandInteraction): Promise<void> {
  const entry = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]
  const word = entry.word
  const guessed = new Set<string>()
  let wrongCount = 0

  const channel = interaction.channel
  if (!channel || !channel.isTextBased() || channel instanceof PartialGroupDMChannel) return

  function masked(): string {
    return word
      .split('')
      .map((ch) => (guessed.has(normalize(ch)) ? ch : '＿'))
      .join(' ')
  }

  function buildEmbed(status?: string): EmbedBuilder {
    const wrongLetters = [...guessed].filter((l) => !word.includes(l))
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🪢 Forca — ${entry.category}`)
      .setDescription(`${GALLOWS[wrongCount]}\n**Palavra:** ${masked()}\n\n💡 Dica: ${entry.hint}`)
      .addFields(
        { name: 'Letras erradas', value: wrongLetters.length ? wrongLetters.join(', ').toUpperCase() : '—', inline: true },
        { name: 'Tentativas', value: `${MAX_WRONG - wrongCount} restantes`, inline: true },
      )
      .setFooter({ text: status ?? `Escreve uma letra no chat! Tens ${TIME_LIMIT_MS / 1000}s no total.` })
  }

  await interaction.reply({ embeds: [buildEmbed()] })

  await new Promise<void>((resolve) => {
    const collector = channel.createMessageCollector({
      filter: (m) => m.author.id === interaction.user.id && LETTER_REGEX.test(m.content.trim()),
      time: TIME_LIMIT_MS,
    })

    collector.on('collect', async (msg) => {
      const letter = normalize(msg.content.trim())
      msg.delete().catch(() => undefined)
      if (guessed.has(letter)) return

      guessed.add(letter)
      if (!word.includes(letter)) wrongCount += 1

      const wordDone = word.split('').every((ch) => guessed.has(normalize(ch)))
      const lost = wrongCount >= MAX_WRONG

      if (wordDone) {
        const reward = 60 + entry.word.length * 5
        addCoins(interaction.guildId ?? 'dm', interaction.user.id, interaction.user.tag, reward)
        await interaction.editReply({
          embeds: [buildEmbed(`🎉 ${msg.author.username} acertou a palavra! +${reward} moedas`).setColor(0x3ba55c)],
        })
        collector.stop('won')
        return
      }

      if (lost) {
        await interaction.editReply({
          embeds: [buildEmbed(`💀 Sem tentativas! A palavra era **${word}**.`).setColor(0xed4245)],
        })
        collector.stop('lost')
        return
      }

      await interaction.editReply({ embeds: [buildEmbed()] })
    })

    collector.on('end', (_collected, reason) => {
      if (reason !== 'won' && reason !== 'lost') {
        interaction
          .editReply({ embeds: [buildEmbed(`⏱️ Tempo esgotado! A palavra era **${word}**.`).setColor(0xed4245)] })
          .catch(() => undefined)
      }
      resolve()
    })
  })
}

function normalize(ch: string): string {
  return ch.toUpperCase()
}
