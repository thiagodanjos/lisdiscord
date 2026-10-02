import {
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js'
import type { GameId } from '../../shared/types'
import { CREDIT_TEXT } from '../../shared/branding'
import { enabledGameIds } from '../store/gameSettings'
import { GAMES } from './games/catalog'

interface Category {
  id: string
  label: string
  emoji: string
  description: string
  color: number
  lines: (enabled: GameId[]) => string[]
}

const G = '*(gestores)*'
const A = '*(administração)*'

export const HELP_CATEGORIES: Category[] = [
  {
    id: 'movcall',
    label: 'Mov. Call — pontos e horas',
    emoji: '🏅',
    description: 'Registar Mov. Calls, pontos, horas e metas',
    color: 0xf5b53d,
    lines: () => [
      `\`/movcall\` — regista uma Mov. Call de hoje (assistente com botões + lista de IDs). ${G}`,
      `\`/movhoras adicionar|remover membro: horas: minutos: segundos:\` — ajusta as horas de alguém. ${G}`,
      '`/pontosmov ver [membro]` — pontos e horas de alguém (ou os teus).',
      '`/pontosmov ranking` — placar completo de pontos de Mov. Call.',
      `\`/pontosmovadmin adicionar|remover|painel\` — ajusta pontos ou define o canal do placar. ${G}`,
      '`/inativos` — quem não tem pontos ou tem menos de 5h de Mov. Call.',
      `\`/resetmovcall\` — apaga todos os pontos e horas, com confirmação. ${G}`,
      '`/verificar @membro` — pontos, horas e os cargos com meta, com ✅/❌ se já cumpre para upar.',
      '`/perfil [membro]` — o teu cartão: pontos, horas, posição no ranking, a semana, metas com barras de progresso e se estás em call.',
      '_🎙️ Horas automáticas: o tempo em call conta sozinho (quando ativado pela gestão na app)._',
      `\`/atividade criar|editar|cancelar\` — gere a agenda de atividades (data, hora, responsável, vagas, categoria). ${G}`,
      '`/atividade listar [periodo] [data] [categoria] [responsavel]` — agenda com filtros · `/atividade ver` — uma atividade.',
      '_📆 Na mensagem de cada atividade: **Confirmar presença**, **Indisponível**, **Quero organizar** ou **Sair** — e o bot lembra antes de começar._',
      '_📸 Verificação: clica em **Verificar** no painel do canal de verificação — abre um ticket privado onde mandas o print do teu perfil com os cargos._',
    ],
  },
  {
    id: 'lisfilms',
    label: 'LisFilms — filmes, séries, animes e jogos',
    emoji: '🎬',
    description: 'O site LisFilms dentro do Discord',
    color: 0x1ed760,
    lines: () => [
      '`/lisfilms procurar termo: [tipo]` — procura filmes, séries, animes, jogos e pessoas no LisFilms (com menu para abrir cada um).',
      '`/lisfilms filme|serie|anime titulo:` — ficha com poster, sinopse, nota da comunidade LisFilms e da TMDB.',
      '`/lisfilms jogo nome:` — ficha do LisGames: capa, plataformas, Metacritic e a nota da casa.',
      '`/lisfilms top` — o que está em alta · `/lisfilms resumo` — o site em números · `/lisfilms destaque` — o destaque da Home.',
      '`/lisfilms utilizador nome:` — encontra uma pessoa no LisFilms e abre o perfil.',
    ],
  },
  {
    id: 'utilidades',
    label: 'Utilidades',
    emoji: '🧰',
    description: 'Avatar, informações, enquetes e lembretes',
    color: 0x22d3ee,
    lines: () => [
      '`/avatar [membro]` — foto de perfil (e banner) em tamanho grande, com links para descarregar.',
      '`/userinfo [membro]` — conta, entrada no servidor, boost e cargos.',
      '`/serverinfo` — dono, membros, canais, cargos, emojis e boosts do servidor.',
      '`/enquete pergunta: opcao1: opcao2: …` — enquete nativa da Discord (até 5 opções, 1h a 1 semana).',
      '`/lembrete criar tempo: mensagem:` — o bot avisa-te neste canal (ex.: `10m`, `2h`, `1h30m`, `3d`).',
      '`/lembrete lista` — os teus lembretes pendentes, com botões para apagar.',
    ],
  },
  {
    id: 'emojis',
    label: 'Emojis & figurinhas',
    emoji: '😀',
    description: 'Adicionar emojis e figurinhas ao servidor ou ao bot',
    color: 0xf43f7e,
    lines: () => [
      '`/addemoteserver emote: | imagem: [nome:]` — adiciona emojis a **este servidor**: cola até 5 emotes de outros servidores de uma vez, ou manda uma imagem/GIF. *(Gerir expressões)*',
      '`/addsticker imagem: nome: [emoji:]` — cria uma figurinha no servidor a partir de PNG/GIF. *(Gerir expressões)*',
      `\`/addemojibot nome: imagem:\` — adiciona uma imagem à biblioteca de emojis **do bot** (usável em qualquer servidor). ${G}`,
      `\`/copiaremoji emoji: [nome:]\` — copia um emoji de qualquer servidor para a biblioteca do bot. ${G}`,
    ],
  },
  {
    id: 'moderacao',
    label: 'Moderação & limpeza',
    emoji: '🛡️',
    description: 'Apagar mensagens em massa',
    color: 0x22e584,
    lines: () => [
      `\`/limparcdo quantidade: [membro:] [canal:]\` — apaga até 1000 mensagens (opcionalmente só as de um membro). Fica registado em **Logs de limpeza** na app. ${A}`,
      '_Banir, expulsar, mutar e bloquear canais faz-se pela página **Moderação** da app._',
    ],
  },
  {
    id: 'mensagens',
    label: 'Mensagens, avisos & sorteios',
    emoji: '📨',
    description: 'Embeds personalizados, avisos agendados e sorteios',
    color: 0xa855f7,
    lines: () => [
      `\`/embed\` — construtor de embed/webhook com menu, pré-visualização ao vivo, exportar/importar JSON e botão de enviar. ${G}`,
      `\`/sorteio\` — sorteio por reação 🎉 com assistente (canal, prémio, duração, vencedores) e botão para rerolar. ${G}`,
      `\`/avisomov canal: tempo: [mensagem:] [marcar:] [repetir:]\` — agenda um aviso (ex.: \`2h\`, \`1h30m\`, \`1d\`) com o embed personalizado na app, podendo marcar um cargo e repetir todos os dias/semanas. ${G}`,
    ],
  },
  {
    id: 'jogos',
    label: 'Jogos & economia',
    emoji: '🎮',
    description: 'Mini-jogos, apostas e moedas',
    color: 0x3ba55c,
    lines: (enabled) => {
      const list = GAMES.filter((g) => enabled.includes(g.id))
      if (list.length === 0) return ['_Nenhum jogo está ativado neste servidor — ativa-os na página **Jogos** da app._']
      return [
        ...list.map((g) => `\`${g.command}\` — ${g.description}`),
        '',
        '_As moedas dos jogos são só diversão — nenhum jogo dá pontos de Mov. Call._',
      ]
    },
  },
]

export function helpCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder().setName('help').setDescription('Mostra todos os comandos do bot, organizados por categoria').toJSON()
}

function homeEmbed(botName: string, avatar: string, enabled: GameId[]): EmbedBuilder {
  const total = HELP_CATEGORIES.reduce((sum, c) => sum + c.lines(enabled).filter((l) => l.startsWith('`')).length, 0)
  return new EmbedBuilder()
    .setColor(0x22e584)
    .setAuthor({ name: `${botName} — ajuda`, iconURL: avatar })
    .setThumbnail(avatar)
    .setDescription(
      [
        `Olá! Tenho **${total} comandos**. Escolhe uma categoria no menu abaixo para os veres:`,
        '',
        ...HELP_CATEGORIES.map((c) => `${c.emoji} **${c.label}** — ${c.description}`),
        '',
        '💡 Os comandos marcados *(gestores)* só aparecem a quem pode **Gerir servidor**.',
      ].join('\n'),
    )
    .setFooter({ text: `✨ ${CREDIT_TEXT}` })
}

function categoryEmbed(category: Category, enabled: GameId[]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(category.color)
    .setTitle(`${category.emoji} ${category.label}`)
    .setDescription(category.lines(enabled).join('\n').slice(0, 4096))
    .setFooter({ text: `✨ ${CREDIT_TEXT}` })
}

function menu(selected: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help:menu')
      .setPlaceholder('Escolhe uma categoria')
      .addOptions(
        { label: 'Início', value: 'home', emoji: '🏠', description: 'Visão geral de todas as categorias', default: selected === 'home' },
        ...HELP_CATEGORIES.map((c) => ({ label: c.label, value: c.id, emoji: c.emoji, description: c.description, default: selected === c.id })),
      ),
  )
}

export async function handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'help') return false
  const enabled = interaction.guild ? enabledGameIds(interaction.guild.id) : []
  const bot = interaction.client.user
  const home = homeEmbed(bot.username, bot.displayAvatarURL(), enabled)

  const reply = await interaction.reply({ embeds: [home], components: [menu('home')], ephemeral: true, withResponse: true })
  const message = reply.resource?.message
  if (!message) return true

  const collector = message.createMessageComponentCollector({ idle: 10 * 60_000 })
  collector.on('collect', async (i) => {
    if (!i.isStringSelectMenu()) return
    const value = i.values[0]
    const category = HELP_CATEGORIES.find((c) => c.id === value)
    await i.update({ embeds: [category ? categoryEmbed(category, enabled) : home], components: [menu(value)] }).catch(() => undefined)
  })
  return true
}
