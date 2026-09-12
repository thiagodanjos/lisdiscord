import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'

export const EIGHT_BALL_ANSWERS = [
  'Sim, sem dúvida.',
  'É certo.',
  'Sem sombra de dúvida.',
  'Sim.',
  'Provavelmente.',
  'Perspetivas boas.',
  'Não sei — tenta perguntar mais tarde.',
  'Não consigo prever agora.',
  'Concentra-te e pergunta de novo.',
  'Não contes com isso.',
  'A minha resposta é não.',
  'As perspetivas não são boas.',
  'Muito duvidoso.',
]

export const simpleCommandDefs = {
  dado: () =>
    new SlashCommandBuilder()
      .setName('dado')
      .setDescription('Lança um dado')
      .addIntegerOption((o) => o.setName('lados').setDescription('Número de lados (padrão 6)').setMinValue(2).setMaxValue(1000))
      .toJSON(),
  moeda: () => new SlashCommandBuilder().setName('moeda').setDescription('Atira uma moeda ao ar').toJSON(),
  ppt: () =>
    new SlashCommandBuilder()
      .setName('ppt')
      .setDescription('Pedra, papel ou tesoura contra o bot')
      .addStringOption((o) =>
        o
          .setName('escolha')
          .setDescription('A tua jogada')
          .setRequired(true)
          .addChoices({ name: 'Pedra', value: 'pedra' }, { name: 'Papel', value: 'papel' }, { name: 'Tesoura', value: 'tesoura' }),
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
      const roll = 1 + Math.floor(Math.random() * sides)
      await interaction.reply(`🎲 Caiu **${roll}** (d${sides})!`)
      return true
    }
    case 'moeda': {
      const result = Math.random() < 0.5 ? 'Cara' : 'Coroa'
      await interaction.reply(`🪙 Saiu **${result}**!`)
      return true
    }
    case 'ppt': {
      const choice = interaction.options.getString('escolha', true) as 'pedra' | 'papel' | 'tesoura'
      const options = ['pedra', 'papel', 'tesoura'] as const
      const botChoice = options[Math.floor(Math.random() * 3)]
      const outcome = pptOutcome(choice, botChoice)
      await interaction.reply(`Tu: **${choice}** · Eu: **${botChoice}** — ${outcome}`)
      return true
    }
    case 'oitobola': {
      const question = interaction.options.getString('pergunta', true)
      const answer = EIGHT_BALL_ANSWERS[Math.floor(Math.random() * EIGHT_BALL_ANSWERS.length)]
      await interaction.reply(`🎱 **${question}**\n> ${answer}`)
      return true
    }
    default:
      return false
  }
}

function pptOutcome(player: string, bot: string): string {
  if (player === bot) return 'Empate!'
  const winsAgainst: Record<string, string> = { pedra: 'tesoura', papel: 'pedra', tesoura: 'papel' }
  return winsAgainst[player] === bot ? 'Ganhaste! 🎉' : 'Perdeste!'
}
