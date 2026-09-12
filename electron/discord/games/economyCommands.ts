import { type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import { claimDaily, getBalance, getLeaderboard } from '../../store/economy'

export const economyCommandDefs = {
  saldo: () =>
    new SlashCommandBuilder()
      .setName('saldo')
      .setDescription('Vê o teu saldo de moedas neste servidor')
      .toJSON(),
  diario: () =>
    new SlashCommandBuilder()
      .setName('diario')
      .setDescription('Reclama a tua recompensa diária de moedas')
      .toJSON(),
  ranking: () =>
    new SlashCommandBuilder()
      .setName('ranking')
      .setDescription('Mostra os jogadores com mais moedas neste servidor')
      .toJSON(),
}

export async function handleEconomyCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const guildId = interaction.guildId
  if (!guildId) return false

  switch (interaction.commandName) {
    case 'saldo': {
      const balance = getBalance(guildId, interaction.user.id, interaction.user.tag)
      const embed = new EmbedBuilder()
        .setColor(0xf0b232)
        .setTitle('💰 O teu saldo')
        .setDescription(`Tens **${balance} moedas** neste servidor.\nGanha mais jogando \`/trivia\`, \`/forca\`, \`/blackjack\`, \`/jogodavelha\` e \`/duelo\`, ou reclama o \`/diario\`.`)
      await interaction.reply({ embeds: [embed] })
      return true
    }
    case 'diario': {
      const result = claimDaily(guildId, interaction.user.id, interaction.user.tag)
      if (!result.claimed) {
        const remaining = new Date(result.nextClaimAt).getTime() - Date.now()
        const hours = Math.ceil(remaining / 3_600_000)
        await interaction.reply({ content: `⏳ Já reclamaste hoje! Tenta novamente daqui a ~${hours}h.`, ephemeral: true })
        return true
      }
      const embed = new EmbedBuilder()
        .setColor(0x3ba55c)
        .setTitle('🎁 Recompensa diária')
        .setDescription(`Recebeste **${result.amount} moedas**!\nSequência atual: **${result.streak} dias** 🔥\nSaldo: **${result.balance} moedas**`)
      await interaction.reply({ embeds: [embed] })
      return true
    }
    case 'ranking': {
      const top = getLeaderboard(guildId, 10)
      if (top.length === 0) {
        await interaction.reply('Ainda ninguém tem moedas neste servidor. Joga um jogo para começar!')
        return true
      }
      const medals = ['🥇', '🥈', '🥉']
      const lines = top.map((entry, i) => `${medals[i] ?? `${i + 1}.`} **${entry.tag}** — ${entry.balance} moedas`)
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🏆 Ranking de moedas').setDescription(lines.join('\n'))
      await interaction.reply({ embeds: [embed] })
      return true
    }
    default:
      return false
  }
}
