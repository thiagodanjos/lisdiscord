import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Message,
  SlashCommandBuilder,
} from 'discord.js'
import { addCoins, tryCharge } from '../../store/economy'

interface Card {
  rank: string
  suit: string
}

const SUITS = ['♠️', '♥️', '♦️', '♣️']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const TURN_SECONDS = 30

function freshDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function cardValue(card: Card): number {
  if (card.rank === 'A') return 11
  if (['J', 'Q', 'K'].includes(card.rank)) return 10
  return Number(card.rank)
}

function handValue(hand: Card[]): number {
  let total = hand.reduce((sum, c) => sum + cardValue(c), 0)
  let aces = hand.filter((c) => c.rank === 'A').length
  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }
  return total
}

function formatHand(hand: Card[]): string {
  return hand.map((c) => `${c.rank}${c.suit}`).join(' ')
}

export function blackjackCommandDef() {
  return new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Joga blackjack (21) contra a casa, apostando moedas')
    .addIntegerOption((o) => o.setName('aposta').setDescription('Quantidade a apostar (padrão 50)').setMinValue(10).setMaxValue(5000))
    .toJSON()
}

export async function runBlackjack(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId ?? 'dm'
  const bet = interaction.options.getInteger('aposta') ?? 50

  if (!tryCharge(guildId, interaction.user.id, interaction.user.tag, bet)) {
    await interaction.reply({ content: `❌ Não tens ${bet} moedas suficientes para apostar. Usa \`/saldo\` para ver quanto tens.`, ephemeral: true })
    return
  }

  const deck = freshDeck()
  const player: Card[] = [deck.pop()!, deck.pop()!]
  const dealer: Card[] = [deck.pop()!, deck.pop()!]

  function buildEmbed(reveal: boolean, footer: string, color: number): EmbedBuilder {
    const dealerDisplay = reveal ? formatHand(dealer) : `${dealer[0].rank}${dealer[0].suit} 🂠`
    const dealerValueDisplay = reveal ? `${handValue(dealer)}` : '?'
    return new EmbedBuilder()
      .setColor(color)
      .setTitle('🃏 Blackjack')
      .addFields(
        { name: `A tua mão (${handValue(player)})`, value: formatHand(player), inline: false },
        { name: `Mão da casa (${dealerValueDisplay})`, value: dealerDisplay, inline: false },
      )
      .setFooter({ text: `Aposta: ${bet} moedas · ${footer}` })
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bj:hit').setLabel('Pedir carta').setStyle(ButtonStyle.Primary).setEmoji('🂡'),
    new ButtonBuilder().setCustomId('bj:stand').setLabel('Parar').setStyle(ButtonStyle.Secondary).setEmoji('✋'),
  )

  if (handValue(player) === 21) {
    const reward = Math.round(bet * 2.5)
    addCoins(guildId, interaction.user.id, interaction.user.tag, reward)
    await interaction.reply({ embeds: [buildEmbed(true, `🎉 Blackjack natural! Ganhaste ${reward} moedas.`, 0xf0b232)] })
    return
  }

  const reply = await interaction.reply({ embeds: [buildEmbed(false, 'Pedir carta ou parar?', 0x5865f2)], components: [row], withResponse: true })
  const message = reply.resource?.message
  if (!message) return

  async function finish(): Promise<void> {
    let dealerValue = handValue(dealer)
    while (dealerValue < 17) {
      dealer.push(deck.pop()!)
      dealerValue = handValue(dealer)
    }

    const playerValue = handValue(player)
    let outcome: 'win' | 'lose' | 'push'
    if (playerValue > 21) outcome = 'lose'
    else if (dealerValue > 21 || playerValue > dealerValue) outcome = 'win'
    else if (playerValue === dealerValue) outcome = 'push'
    else outcome = 'lose'

    let footer: string
    let color: number
    if (outcome === 'win') {
      const reward = bet * 2
      addCoins(guildId, interaction.user.id, interaction.user.tag, reward)
      footer = `🎉 Ganhaste! +${reward} moedas.`
      color = 0x3ba55c
    } else if (outcome === 'push') {
      addCoins(guildId, interaction.user.id, interaction.user.tag, bet)
      footer = 'Empate — aposta devolvida.'
      color = 0xf0b232
    } else {
      footer = playerValue > 21 ? '💥 Rebentaste (mais de 21)! Perdeste a aposta.' : 'Perdeste a aposta.'
      color = 0xed4245
    }

    await interaction.editReply({ embeds: [buildEmbed(true, footer, color)], components: [] })
  }

  async function loop(msg: Message): Promise<void> {
    try {
      const click = await msg.awaitMessageComponent({
        time: TURN_SECONDS * 1000,
        filter: (i) => i.user.id === interaction.user.id,
      })

      if (click.customId === 'bj:hit') {
        player.push(deck.pop()!)
        if (handValue(player) >= 21) {
          await click.update({ embeds: [buildEmbed(false, 'A resolver...', 0x5865f2)], components: [] })
          await finish()
          return
        }
        await click.update({ embeds: [buildEmbed(false, 'Pedir carta ou parar?', 0x5865f2)], components: [row] })
        await loop(msg)
        return
      }

      await click.update({ embeds: [buildEmbed(false, 'A resolver...', 0x5865f2)], components: [] })
      await finish()
    } catch {
      await interaction.editReply({ embeds: [buildEmbed(true, '⏱️ Tempo esgotado — perdeste a aposta.', 0xed4245)], components: [] })
    }
  }

  await loop(message)
}
