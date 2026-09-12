import { type ChatInputCommandInteraction, EmbedBuilder, PartialGroupDMChannel, SlashCommandBuilder } from 'discord.js'
import { addCoins } from '../../store/economy'

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

const TIME_LIMIT_MS = 30_000

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

  const channel = interaction.channel
  if (!channel || !channel.isTextBased() || channel instanceof PartialGroupDMChannel) return

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔀 Desembaralha a Palavra')
    .setDescription(`Categoria: **${entry.category}**\n\n# ${scrambled.split('').join(' ')}\n\nEscreve a palavra certa no chat! Tens ${TIME_LIMIT_MS / 1000}s.`)

  await interaction.reply({ embeds: [embed] })

  await new Promise<void>((resolve) => {
    const collector = channel.createMessageCollector({
      filter: (m) => !m.author.bot && m.content.trim().toUpperCase() === entry.word,
      time: TIME_LIMIT_MS,
      max: 1,
    })

    collector.on('collect', async (msg) => {
      const reward = 30 + entry.word.length * 5
      addCoins(guildId, msg.author.id, msg.author.tag, reward)
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x3ba55c)
            .setTitle('🔀 Desembaralha a Palavra')
            .setDescription(`🎉 **${msg.author.username}** acertou! A palavra era **${entry.word}**.\n💰 +${reward} moedas`),
        ],
      })
    })

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        interaction
          .editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('🔀 Desembaralha a Palavra')
                .setDescription(`⏱️ Tempo esgotado! A palavra era **${entry.word}**.`),
            ],
          })
          .catch(() => undefined)
      }
      resolve()
    })
  })
}
