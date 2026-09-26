import { type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import { addCoins, tryCharge } from '../../store/economy'

export const EIGHT_BALL_ANSWERS = [
  'Sim, sem dúvida.',
  'É certo.',
  'Sem sombra de dúvida.',
  'Sim.',
  'Provavelmente.',
  'Perspetivas boas.',
  'Os astros dizem que sim. ✨',
  'Pode apostar que sim.',
  'Não sei — tenta perguntar mais tarde.',
  'Não consigo prever agora.',
  'Concentra-te e pergunta de novo.',
  'Pergunta ao teu coração. 💭',
  'Não contes com isso.',
  'A minha resposta é não.',
  'As perspetivas não são boas.',
  'Muito duvidoso.',
  'Nem pensar. 🙅',
  'Só se chover para cima.',
]

const PPT_EMOJI: Record<string, string> = { pedra: '🪨', papel: '📄', tesoura: '✂️' }
const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

export const simpleCommandDefs = {
  dado: () =>
    new SlashCommandBuilder()
      .setName('dado')
      .setDescription('Lança um ou vários dados')
      .addIntegerOption((o) => o.setName('lados').setDescription('Número de lados (padrão 6)').setMinValue(2).setMaxValue(1000))
      .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantos dados lançar (1–10)').setMinValue(1).setMaxValue(10))
      .toJSON(),
  moeda: () =>
    new SlashCommandBuilder()
      .setName('moeda')
      .setDescription('Atira uma moeda ao ar — com aposta opcional: acerta e dobra')
      .addStringOption((o) => o.setName('lado').setDescription('Em que lado apostas').addChoices({ name: 'Cara', value: 'Cara' }, { name: 'Coroa', value: 'Coroa' }))
      .addIntegerOption((o) => o.setName('aposta').setDescription('Moedas a apostar (precisa de escolher o lado)').setMinValue(10).setMaxValue(5000))
      .toJSON(),
  ppt: () =>
    new SlashCommandBuilder()
      .setName('ppt')
      .setDescription('Pedra, papel ou tesoura contra o bot')
      .addStringOption((o) =>
        o
          .setName('escolha')
          .setDescription('A tua jogada')
          .setRequired(true)
          .addChoices({ name: '🪨 Pedra', value: 'pedra' }, { name: '📄 Papel', value: 'papel' }, { name: '✂️ Tesoura', value: 'tesoura' }),
      )
      .toJSON(),
  oitobola: () =>
    new SlashCommandBuilder()
      .setName('oitobola')
      .setDescription('Faz uma pergunta à bola 8 mágica')
      .addStringOption((o) => o.setName('pergunta').setDescription('A tua pergunta').setRequired(true))
      .toJSON(),
}

export async function handleSimpleCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  switch (interaction.commandName) {
    case 'dado': {
      const sides = interaction.options.getInteger('lados') ?? 6
      const count = interaction.options.getInteger('quantidade') ?? 1
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides))
      const shown = rolls.map((r) => (sides === 6 ? `${DICE_FACES[r]} **${r}**` : `**${r}**`)).join('  ·  ')
      const total = rolls.reduce((a, b) => a + b, 0)
      const embed = new EmbedBuilder()
        .setColor(0x22d3ee)
        .setTitle(`🎲 ${count > 1 ? `${count} dados` : 'Dado'} (d${sides})`)
        .setDescription(count > 1 ? `${shown}\n\nTotal: **${total}**` : shown)
      await interaction.reply({ embeds: [embed] })
      return true
    }
    case 'moeda': {
      const side = interaction.options.getString('lado')
      const bet = interaction.options.getInteger('aposta')
      const guildId = interaction.guildId ?? 'dm'
      if (bet && !side) {
        await interaction.reply({ content: '❌ Para apostar, escolhe também o **lado** (Cara ou Coroa).', ephemeral: true })
        return true
      }
      if (bet && !tryCharge(guildId, interaction.user.id, interaction.user.tag, bet)) {
        await interaction.reply({ content: `❌ Não tens ${bet} moedas suficientes.`, ephemeral: true })
        return true
      }
      const result = Math.random() < 0.5 ? 'Cara' : 'Coroa'
      let text = `Saiu **${result}**!`
      let color = 0xf5b53d
      if (side) {
        const won = side === result
        color = won ? 0x22e584 : 0xf43f5e
        if (bet) {
          if (won) addCoins(guildId, interaction.user.id, interaction.user.tag, bet * 2)
          text += won ? `\n🎉 Acertaste — **+${bet} moedas**!` : `\nPerdeste ${bet} moedas.`
        } else {
          text += won ? '\n🎉 Acertaste!' : '\nFalhaste!'
        }
      }
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle('🪙 Cara ou Coroa').setDescription(text)] })
      return true
    }
    case 'ppt': {
      const choice = interaction.options.getString('escolha', true) as 'pedra' | 'papel' | 'tesoura'
      const options = ['pedra', 'papel', 'tesoura'] as const
      const botChoice = options[Math.floor(Math.random() * 3)]
      const outcome = pptOutcome(choice, botChoice)
      const embed = new EmbedBuilder()
        .setColor(outcome === 'win' ? 0x22e584 : outcome === 'lose' ? 0xf43f5e : 0x99aab5)
        .setTitle('🪨📄✂️ Pedra, papel ou tesoura')
        .addFields(
          { name: 'Tu', value: `${PPT_EMOJI[choice]} ${capitalize(choice)}`, inline: true },
          { name: 'Eu', value: `${PPT_EMOJI[botChoice]} ${capitalize(botChoice)}`, inline: true },
        )
        .setDescription(outcome === 'win' ? '**Ganhaste!** 🎉' : outcome === 'lose' ? '**Perdeste!** 😈' : '**Empate!** 🤝')
      await interaction.reply({ embeds: [embed] })
      return true
    }
    case 'oitobola': {
      const question = interaction.options.getString('pergunta', true)
      const answer = EIGHT_BALL_ANSWERS[Math.floor(Math.random() * EIGHT_BALL_ANSWERS.length)]
      const embed = new EmbedBuilder()
        .setColor(0x1f2937)
        .setTitle('🎱 Bola 8 mágica')
        .addFields({ name: 'Pergunta', value: question.slice(0, 1024) }, { name: 'Resposta', value: `> ${answer}` })
      await interaction.reply({ embeds: [embed] })
      return true
    }
    default:
      return false
  }
}

function pptOutcome(player: string, bot: string): 'win' | 'lose' | 'draw' {
  if (player === bot) return 'draw'
  const winsAgainst: Record<string, string> = { pedra: 'tesoura', papel: 'pedra', tesoura: 'papel' }
  return winsAgainst[player] === bot ? 'win' : 'lose'
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
