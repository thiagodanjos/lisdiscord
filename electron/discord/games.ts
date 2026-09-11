import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Guild,
  SlashCommandBuilder,
} from 'discord.js'
import type { GameId, GameInfo } from '../../shared/types'

export const GAMES: GameInfo[] = [
  { id: 'dado', name: 'Dado', command: '/dado', description: 'Lança um dado (padrão 6 lados, configurável).' },
  { id: 'moeda', name: 'Cara ou Coroa', command: '/moeda', description: 'Atira uma moeda ao ar.' },
  { id: 'ppt', name: 'Pedra, Papel ou Tesoura', command: '/ppt', description: 'Joga contra o bot.' },
  { id: 'oitobola', name: 'Bola 8 Mágica', command: '/oitobola', description: 'Faz uma pergunta e recebe uma resposta misteriosa.' },
  { id: 'trivia', name: 'Trivia', command: '/trivia', description: 'Responde a uma pergunta de escolha múltipla contra o relógio.' },
]

const EIGHT_BALL_ANSWERS = [
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

const TRIVIA_BANK: { question: string; options: string[]; correct: number }[] = [
  { question: 'Qual é a capital de Portugal?', options: ['Porto', 'Lisboa', 'Faro', 'Coimbra'], correct: 1 },
  { question: 'Quantos jogadores tem uma equipa de futebol em campo?', options: ['9', '10', '11', '12'], correct: 2 },
  { question: 'Qual destes é um planeta anão?', options: ['Marte', 'Plutão', 'Vénus', 'Ceres'], correct: 1 },
  { question: 'Quem escreveu "Os Lusíadas"?', options: ['Fernando Pessoa', 'Camões', 'Eça de Queirós', 'Saramago'], correct: 1 },
  { question: 'Qual é o maior oceano do mundo?', options: ['Atlântico', 'Índico', 'Pacífico', 'Ártico'], correct: 2 },
]

export function buildCommandDefinitions(enabled: GameId[]) {
  const defs = []
  if (enabled.includes('dado')) {
    defs.push(
      new SlashCommandBuilder()
        .setName('dado')
        .setDescription('Lança um dado')
        .addIntegerOption((o) => o.setName('lados').setDescription('Número de lados (padrão 6)').setMinValue(2).setMaxValue(1000))
        .toJSON(),
    )
  }
  if (enabled.includes('moeda')) {
    defs.push(new SlashCommandBuilder().setName('moeda').setDescription('Atira uma moeda ao ar').toJSON())
  }
  if (enabled.includes('ppt')) {
    defs.push(
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
    )
  }
  if (enabled.includes('oitobola')) {
    defs.push(
      new SlashCommandBuilder()
        .setName('oitobola')
        .setDescription('Faz uma pergunta à bola 8 mágica')
        .addStringOption((o) => o.setName('pergunta').setDescription('A tua pergunta').setRequired(true))
        .toJSON(),
    )
  }
  if (enabled.includes('trivia')) {
    defs.push(new SlashCommandBuilder().setName('trivia').setDescription('Responde a uma pergunta de trivia').toJSON())
  }
  return defs
}

export async function registerCommandsForGuild(guild: Guild, enabled: GameId[]): Promise<void> {
  await guild.commands.set(buildCommandDefinitions(enabled))
}

export async function handleGameInteraction(interaction: ChatInputCommandInteraction): Promise<boolean> {
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
    case 'trivia': {
      await runTrivia(interaction)
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

async function runTrivia(interaction: ChatInputCommandInteraction): Promise<void> {
  const q = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)]
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    q.options.map((opt, i) => new ButtonBuilder().setCustomId(`trivia:${i}`).setLabel(opt).setStyle(ButtonStyle.Secondary)),
  )

  const reply = await interaction.reply({ content: `🧠 **${q.question}**\nTens 15 segundos!`, components: [row], withResponse: true })
  const message = reply.resource?.message
  if (!message) return

  try {
    const click = await message.awaitMessageComponent({ time: 15_000 })
    const chosen = Number(click.customId.split(':')[1])
    const correct = chosen === q.correct
    await click.update({
      content: correct
        ? `✅ **${click.user.username}** acertou! A resposta era **${q.options[q.correct]}**.`
        : `❌ **${click.user.username}** errou. A resposta certa era **${q.options[q.correct]}**.`,
      components: [],
    })
  } catch {
    await interaction.editReply({ content: `⏱️ Tempo esgotado! A resposta era **${q.options[q.correct]}**.`, components: [] })
  }
}
