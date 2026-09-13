import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type Guild } from 'discord.js'

const GIVEAWAY_EMOJI = '🎉'

function rerollRow(giveawayId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`giveaway:reroll:${giveawayId}`).setLabel('Rerolar vencedor(es)').setStyle(ButtonStyle.Secondary).setEmoji('🔁'),
  )
}

export async function postGiveawayMessage(
  guild: Guild,
  channelId: string,
  prize: string,
  endsAt: string,
  winnerCount: number,
): Promise<string> {
  const channel = await guild.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) throw new Error('Este canal não aceita mensagens.')

  const embed = new EmbedBuilder()
    .setTitle(`${GIVEAWAY_EMOJI} SORTEIO: ${prize}`)
    .setDescription(
      `Reage com ${GIVEAWAY_EMOJI} para participar!\n\n**Vencedores:** ${winnerCount}\n**Termina:** <t:${Math.floor(new Date(endsAt).getTime() / 1000)}:R>`,
    )
    .setColor(0x5865f2)
    .setTimestamp(new Date(endsAt))
    .setFooter({ text: 'Termina em' })

  const message = await channel.send({ embeds: [embed] })
  await message.react(GIVEAWAY_EMOJI)
  return message.id
}

export async function concludeGiveaway(
  guild: Guild,
  channelId: string,
  messageId: string,
  prize: string,
  winnerCount: number,
  giveawayId: string,
): Promise<string[]> {
  const channel = await guild.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) throw new Error('Canal do sorteio já não existe.')

  const message = await channel.messages.fetch(messageId)
  const reaction = message.reactions.cache.get(GIVEAWAY_EMOJI)
  const reactedUsers = reaction ? [...(await reaction.users.fetch()).values()] : []
  const entrants = reactedUsers.filter((u) => !u.bot)

  const winners = shuffle(entrants).slice(0, winnerCount)
  const winnerTags = winners.map((w) => w.tag)

  const resultEmbed = new EmbedBuilder()
    .setTitle(`🎊 SORTEIO ENCERRADO: ${prize}`)
    .setDescription(
      winners.length > 0
        ? `Parabéns ${winners.map((w) => `<@${w.id}>`).join(', ')}! 🎉`
        : 'Ninguém participou neste sorteio.',
    )
    .setColor(winners.length > 0 ? 0x3ba55c : 0xed4245)

  await message.edit({ embeds: [resultEmbed] })
  await channel.send({
    content: winners.length > 0 ? `${GIVEAWAY_EMOJI} Vencedores de **${prize}**: ${winners.map((w) => `<@${w.id}>`).join(', ')}` : `Sem participantes no sorteio de **${prize}**.`,
    components: [rerollRow(giveawayId)],
  })

  return winnerTags
}

/** Escolhe novo(s) vencedor(es) para um sorteio já concluído, excluindo quem já ganhou. */
export async function rerollGiveaway(
  guild: Guild,
  channelId: string,
  messageId: string,
  prize: string,
  winnerCount: number,
  giveawayId: string,
  excludeTags: string[],
): Promise<string[]> {
  const channel = await guild.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) throw new Error('Canal do sorteio já não existe.')

  const message = await channel.messages.fetch(messageId)
  const reaction = message.reactions.cache.get(GIVEAWAY_EMOJI)
  const reactedUsers = reaction ? [...(await reaction.users.fetch()).values()] : []
  const entrants = reactedUsers.filter((u) => !u.bot && !excludeTags.includes(u.tag))

  const winners = shuffle(entrants).slice(0, winnerCount)
  const winnerTags = winners.map((w) => w.tag)

  const resultEmbed = new EmbedBuilder()
    .setTitle(`🔁 REROLL: ${prize}`)
    .setDescription(
      winners.length > 0
        ? `Novo(s) vencedor(es): ${winners.map((w) => `<@${w.id}>`).join(', ')} 🎉`
        : 'Não há mais participantes elegíveis para um reroll (todos os que reagiram já ganharam).',
    )
    .setColor(winners.length > 0 ? 0x3ba55c : 0xed4245)

  await channel.send({
    content: winners.length > 0 ? `${GIVEAWAY_EMOJI} Reroll de **${prize}**: ${winners.map((w) => `<@${w.id}>`).join(', ')}` : `Reroll de **${prize}**: sem participantes elegíveis.`,
    embeds: [resultEmbed],
    components: [rerollRow(giveawayId)],
  })

  return winnerTags
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
