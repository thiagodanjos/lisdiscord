import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import { addCoins } from '../../store/economy'

const EMOJI_POOL = ['🍕', '🎮', '🐱', '🚀', '🎧', '🌵', '🍩', '⚽', '🦊', '🎲', '🍉', '👾', '🌙', '🔥', '🐙', '🎸']
const SIZE = 4
const HIDE_DELAY_MS = 1100
const IDLE_MS = 3 * 60_000

export function memoryCommandDef() {
  return new SlashCommandBuilder().setName('memoria').setDescription('Jogo da memória — encontra os 8 pares com o menor número de jogadas').toJSON()
}

export function memoryReward(moves: number): number {
  return Math.max(20, 180 - (moves - 8) * 10)
}

export async function runMemory(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId ?? 'dm'
  const picks = [...EMOJI_POOL].sort(() => Math.random() - 0.5).slice(0, (SIZE * SIZE) / 2)
  const cards = [...picks, ...picks].sort(() => Math.random() - 0.5)
  const matched = new Set<number>()
  let first: number | null = null
  let second: number | null = null
  let moves = 0
  let locked = false

  const rows = (disabled = false): ActionRowBuilder<ButtonBuilder>[] =>
    Array.from({ length: SIZE }, (_, r) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        Array.from({ length: SIZE }, (_, c) => {
          const i = r * SIZE + c
          const visible = matched.has(i) || i === first || i === second || disabled
          return new ButtonBuilder()
            .setCustomId(`mem:${i}`)
            .setEmoji(visible ? cards[i] : '❔')
            .setStyle(matched.has(i) ? ButtonStyle.Success : i === first || i === second ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(disabled || matched.has(i))
        }),
      ),
    )

  const embed = (status: string, color = 0xa855f7) =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🧠 Jogo da memória')
      .setDescription(status)
      .setFooter({ text: `Jogadas: ${moves} · Pares: ${matched.size / 2}/${picks.length}` })

  const reply = await interaction.reply({ embeds: [embed('Vira duas cartas de cada vez e encontra todos os pares.')], components: rows(), withResponse: true })
  const message = reply.resource?.message
  if (!message) return

  const collector = message.createMessageComponentCollector({ idle: IDLE_MS })
  collector.on('collect', async (click) => {
    try {
      if (click.user.id !== interaction.user.id) {
        await click.reply({ content: 'Este jogo não é teu — usa `/memoria` para jogares.', ephemeral: true })
        return
      }
      const i = Number(click.customId.split(':')[1])
      if (locked || matched.has(i) || i === first) {
        await click.deferUpdate()
        return
      }
      if (first === null) {
        first = i
        await click.update({ embeds: [embed('Escolhe a segunda carta…')], components: rows() })
        return
      }

      second = i
      moves += 1
      if (cards[first] === cards[second]) {
        matched.add(first).add(second)
        first = second = null
        if (matched.size === cards.length) {
          const reward = memoryReward(moves)
          addCoins(guildId, interaction.user.id, interaction.user.tag, reward)
          collector.stop('won')
          await click.update({ embeds: [embed(`🎉 Encontraste todos os pares em **${moves} jogadas**! +${reward} moedas.`, 0x22e584)], components: rows(true) })
          return
        }
        await click.update({ embeds: [embed('✨ Par encontrado!')], components: rows() })
        return
      }

      locked = true
      await click.update({ embeds: [embed('❌ Não é par…')], components: rows() })
      await new Promise((r) => setTimeout(r, HIDE_DELAY_MS))
      first = second = null
      locked = false
      await interaction.editReply({ embeds: [embed('Tenta outra vez.')], components: rows() })
    } catch (err) {
      console.error('[memoria] Erro:', err)
    }
  })
  collector.on('end', async (_c, reason) => {
    if (reason === 'idle') {
      await interaction.editReply({ embeds: [embed('⏱️ Tempo esgotado.', 0x99aab5)], components: rows(true) }).catch(() => undefined)
    }
  })
}
