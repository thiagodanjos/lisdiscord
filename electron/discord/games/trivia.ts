import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import { registerTriviaResult } from '../../store/economy'

interface TriviaQuestion {
  category: string
  question: string
  options: string[]
  correct: number
}

const TRIVIA_BANK: TriviaQuestion[] = [
  { category: 'Geografia', question: 'Qual é a capital de Portugal?', options: ['Porto', 'Lisboa', 'Faro', 'Coimbra'], correct: 1 },
  { category: 'Geografia', question: 'Qual é o maior oceano do mundo?', options: ['Atlântico', 'Índico', 'Pacífico', 'Ártico'], correct: 2 },
  { category: 'Geografia', question: 'Qual é o rio mais longo do mundo?', options: ['Nilo', 'Amazonas', 'Yangtzé', 'Mississípi'], correct: 1 },
  { category: 'Geografia', question: 'Em que continente fica o Egito?', options: ['Ásia', 'África', 'Europa', 'Oceânia'], correct: 1 },
  { category: 'Geografia', question: 'Qual é o país mais populoso do mundo?', options: ['Índia', 'EUA', 'China', 'Indonésia'], correct: 0 },
  { category: 'Ciência', question: 'Qual destes é um planeta anão?', options: ['Marte', 'Plutão', 'Vénus', 'Ceres'], correct: 1 },
  { category: 'Ciência', question: 'Qual é o símbolo químico do ouro?', options: ['Ag', 'Au', 'Fe', 'Pb'], correct: 1 },
  { category: 'Ciência', question: 'Quantos ossos tem o corpo humano adulto?', options: ['186', '206', '226', '246'], correct: 1 },
  { category: 'Ciência', question: 'Qual é o planeta mais próximo do Sol?', options: ['Vénus', 'Terra', 'Mercúrio', 'Marte'], correct: 2 },
  { category: 'Ciência', question: 'A que velocidade viaja a luz (aprox., km/s)?', options: ['30.000', '150.000', '300.000', '3.000.000'], correct: 2 },
  { category: 'História', question: 'Em que ano começou a Primeira Guerra Mundial?', options: ['1912', '1914', '1918', '1920'], correct: 1 },
  { category: 'História', question: 'Quem foi o primeiro rei de Portugal?', options: ['D. Dinis', 'D. Afonso Henriques', 'D. João I', 'D. Manuel I'], correct: 1 },
  { category: 'História', question: 'Em que ano caiu o Muro de Berlim?', options: ['1985', '1989', '1991', '1993'], correct: 1 },
  { category: 'História', question: 'Qual civilização construiu Machu Picchu?', options: ['Maia', 'Asteca', 'Inca', 'Olmeca'], correct: 2 },
  { category: 'Entretenimento', question: 'Quem escreveu "Os Lusíadas"?', options: ['Fernando Pessoa', 'Camões', 'Eça de Queirós', 'Saramago'], correct: 1 },
  { category: 'Entretenimento', question: 'Quantas cordas tem uma viola clássica?', options: ['4', '5', '6', '7'], correct: 2 },
  { category: 'Entretenimento', question: 'Qual destes é um instrumento de sopro?', options: ['Violino', 'Clarinete', 'Tambor', 'Harpa'], correct: 1 },
  { category: 'Desporto', question: 'Quantos jogadores tem uma equipa de futebol em campo?', options: ['9', '10', '11', '12'], correct: 2 },
  { category: 'Desporto', question: 'De quantos em quantos anos se realizam os Jogos Olímpicos de verão?', options: ['2', '3', '4', '5'], correct: 2 },
  { category: 'Desporto', question: 'Em que desporto se usa o termo "slam dunk"?', options: ['Ténis', 'Basquetebol', 'Voleibol', 'Andebol'], correct: 1 },
  { category: 'Geral', question: 'Quantos dias tem um ano bissexto?', options: ['364', '365', '366', '367'], correct: 2 },
  { category: 'Geral', question: 'Qual é a moeda oficial do Japão?', options: ['Won', 'Yuan', 'Iene', 'Rupia'], correct: 2 },
  { category: 'Geral', question: 'Quantas cores tem o arco-íris?', options: ['5', '6', '7', '8'], correct: 2 },
  { category: 'Geral', question: 'Qual é o metal líquido à temperatura ambiente?', options: ['Chumbo', 'Mercúrio', 'Estanho', 'Zinco'], correct: 1 },
]

const TURN_SECONDS = 20

export function triviaCommandDef() {
  return new SlashCommandBuilder().setName('trivia').setDescription('Responde a uma pergunta de trivia e ganha moedas').toJSON()
}

export async function runTrivia(interaction: ChatInputCommandInteraction): Promise<void> {
  const q = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)]
  const guildId = interaction.guildId
  if (!guildId) {
    await interaction.reply({ content: '❌ Este comando só funciona dentro de um servidor.', ephemeral: true })
    return
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    q.options.map((opt, i) => new ButtonBuilder().setCustomId(`trivia:${i}`).setLabel(opt).setStyle(ButtonStyle.Secondary)),
  )

  const reply = await interaction.reply({
    content: `🧠 **[${q.category}]** ${q.question}\nTens ${TURN_SECONDS} segundos! Quem acertar primeiro ganha moedas.`,
    components: [row],
    withResponse: true,
  })
  const message = reply.resource?.message
  if (!message) {
    await interaction.editReply({ content: '⚠️ Ocorreu um erro ao iniciar a trivia — tenta outra vez.' }).catch(() => undefined)
    return
  }

  let click
  try {
    click = await message.awaitMessageComponent({ time: TURN_SECONDS * 1000 })
  } catch {
    await interaction.editReply({ content: `⏱️ Tempo esgotado! A resposta era **${q.options[q.correct]}**.`, components: [] }).catch(() => undefined)
    return
  }

  try {
    const chosen = Number(click.customId.split(':')[1])
    const correct = chosen === q.correct
    const result = registerTriviaResult(guildId, click.user.id, click.user.tag, correct)

    await click.update({
      content: correct
        ? `✅ **${click.user.username}** acertou! A resposta era **${q.options[q.correct]}**.\n💰 +${result.reward} moedas · sequência de ${result.streak} 🔥`
        : `❌ **${click.user.username}** errou. A resposta certa era **${q.options[q.correct]}**.`,
      components: [],
    })
  } catch (err) {
    console.error('Erro na trivia:', err)
    await interaction
      .editReply({ content: '⚠️ Ocorreu um erro inesperado a processar a tua resposta.', components: [] })
      .catch(() => undefined)
  }
}
