import { type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import { addCoins, tryCharge } from '../../store/economy'

interface Racer {
  id: string
  name: string
  emoji: string
  minStep: number
  maxStep: number
}

const RACERS: Racer[] = [
  { id: 'cavalo', name: 'Cavalo', emoji: '🐎', minStep: 2, maxStep: 5 },
  { id: 'chita', name: 'Chita', emoji: '🐆', minStep: 3, maxStep: 5 },
  { id: 'coelho', name: 'Coelho', emoji: '🐇', minStep: 1, maxStep: 6 },
  { id: 'tartaruga', name: 'Tartaruga', emoji: '🐢', minStep: 1, maxStep: 3 },
]

const TRACK_LENGTH = 20
const PAYOUT_MULTIPLIER = 3.5
const TICK_MS = 700

export function raceCommandDef() {
  return new SlashCommandBuilder()
    .setName('corrida')
    .setDescription('Aposta em qual bicho vence a corrida (paga 3.5x se acertares)')
    .addIntegerOption((o) => o.setName('aposta').setDescription('Quantidade a apostar').setRequired(true).setMinValue(10).setMaxValue(5000))
    .addStringOption((o) =>
      o
        .setName('bicho')
        .setDescription('Em quem apostar')
        .setRequired(true)
        .addChoices(...RACERS.map((r) => ({ name: `${r.emoji} ${r.name}`, value: r.id }))),
    )
    .toJSON()
}

export async function runRace(interaction: ChatInputCommandInteraction): Promise<void> {
  const bet = interaction.options.getInteger('aposta', true)
  const pick = interaction.options.getString('bicho', true)
  const guildId = interaction.guildId ?? 'dm'

  if (!tryCharge(guildId, interaction.user.id, interaction.user.tag, bet)) {
    await interaction.reply({ content: `❌ Não tens ${bet} moedas suficientes para apostar.`, ephemeral: true })
    return
  }

  const positions = RACERS.map(() => 0)

  function renderTrack(): string {
    return RACERS.map((r, i) => {
      const pos = Math.min(positions[i], TRACK_LENGTH)
      return `${r.emoji} ${'▬'.repeat(pos)}${pos < TRACK_LENGTH ? '🐾' : ''}${'▬'.repeat(TRACK_LENGTH - pos)}🏁`
    }).join('\n')
  }

  try {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('🏁 Corrida').setDescription(renderTrack())] })

    let winnerIndex = -1
    while (winnerIndex === -1) {
      await new Promise((r) => setTimeout(r, TICK_MS))
      for (let i = 0; i < RACERS.length; i++) {
        const r = RACERS[i]
        positions[i] += r.minStep + Math.floor(Math.random() * (r.maxStep - r.minStep + 1))
      }
      const maxPos = Math.max(...positions)
      if (maxPos >= TRACK_LENGTH) {
        winnerIndex = positions.indexOf(maxPos)
      }
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('🏁 Corrida').setDescription(renderTrack())] })
    }

    const winner = RACERS[winnerIndex]
    const won = winner.id === pick
    let footer: string
    if (won) {
      const prize = Math.round(bet * PAYOUT_MULTIPLIER)
      addCoins(guildId, interaction.user.id, interaction.user.tag, prize)
      footer = `🎉 ${winner.emoji} ${winner.name} venceu — acertaste! +${prize} moedas.`
    } else {
      footer = `${winner.emoji} ${winner.name} venceu. Perdeste a aposta de ${bet} moedas.`
    }

    const finalEmbed = new EmbedBuilder()
      .setColor(won ? 0x3ba55c : 0xed4245)
      .setTitle('🏁 Corrida — resultado')
      .setDescription(renderTrack())
      .setFooter({ text: footer })
    await interaction.editReply({ embeds: [finalEmbed] })
  } catch (err) {
    console.error('Erro na corrida:', err)
    addCoins(guildId, interaction.user.id, interaction.user.tag, bet)
    await interaction
      .editReply({ content: '⚠️ Ocorreu um erro inesperado — a tua aposta foi devolvida.', embeds: [] })
      .catch(() => undefined)
  }
}
