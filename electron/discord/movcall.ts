import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Guild,
  type Message,
  ModalBuilder,
  PartialGroupDMChannel,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import type { MovCallType } from '../../shared/types'
import * as movPoints from '../store/movPoints'

const POINTS_BY_TYPE: Record<MovCallType, number> = { normal: 10, tematica: 15 }
const SETUP_TIMEOUT_MS = 10 * 60_000
const MODAL_TIMEOUT_MS = 120_000

export function movCallCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('movcall')
    .setDescription('Regista uma Mov. Call de hoje e atribui pontos a quem participou')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o
        .setName('tipo')
        .setDescription('Tipo de MOV realizada')
        .setRequired(true)
        .addChoices(
          { name: 'Mov. Call Normal — sem temática, 1 hora (10 pontos)', value: 'normal' },
          { name: 'Mov. Call Temática ou Outras MOVS — 1h ou mais (15 pontos)', value: 'tematica' },
        ),
    )
    .addStringOption((o) =>
      o
        .setName('participantes')
        .setDescription('Cola menções (@pessoa) ou IDs, uma por linha. Deixa vazio para adicionar um a um a seguir.')
        .setRequired(false),
    )
    .toJSON()
}

export function pontosMovCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('pontosmov')
    .setDescription('Consulta os pontos de MOV. Call do servidor')
    .addSubcommand((sc) =>
      sc
        .setName('ver')
        .setDescription('Vê os pontos de alguém (ou os teus, se não indicares ninguém)')
        .addUserOption((o) => o.setName('membro').setDescription('De quem ver os pontos').setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName('ranking').setDescription('Mostra o ranking de pontos de MOV. Call do servidor'))
    .toJSON()
}

export function pontosMovAdminCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('pontosmovadmin')
    .setDescription('Gerir os pontos de MOV. Call do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
      sc
        .setName('adicionar')
        .setDescription('Adiciona pontos de MOV. Call a alguém')
        .addUserOption((o) => o.setName('membro').setDescription('Quem vai receber pontos').setRequired(true))
        .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantos pontos adicionar').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sc) =>
      sc
        .setName('remover')
        .setDescription('Remove pontos de MOV. Call de alguém')
        .addUserOption((o) => o.setName('membro').setDescription('A quem vai tirar pontos').setRequired(true))
        .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantos pontos remover').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sc) =>
      sc
        .setName('painel')
        .setDescription('Define o canal onde fica o painel de pontos, atualizado em tempo real')
        .addChannelOption((o) =>
          o
            .setName('canal')
            .setDescription('Canal onde publicar o painel')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .toJSON()
}

export function movCallCommandDefs(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [movCallCommandDef(), pontosMovCommandDef(), pontosMovAdminCommandDef()]
}

export async function handleMovCallCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!['movcall', 'pontosmov', 'pontosmovadmin'].includes(interaction.commandName)) return false

  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este comando só funciona dentro de um servidor.', ephemeral: true })
    return true
  }

  if (interaction.commandName === 'movcall') {
    await runMovCall(interaction, guild)
    return true
  }

  if (interaction.commandName === 'pontosmov') {
    const sub = interaction.options.getSubcommand()
    if (sub === 'ver') await runVerPontos(interaction, guild)
    else if (sub === 'ranking') await runRanking(interaction, guild)
    return true
  }

  const sub = interaction.options.getSubcommand()
  if (sub === 'adicionar') await runAdicionar(interaction, guild)
  else if (sub === 'remover') await runRemover(interaction, guild)
  else if (sub === 'painel') await runPainel(interaction, guild)
  return true
}

// ==========================================================================
// /movcall
// ==========================================================================

async function runMovCall(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const tipo = interaction.options.getString('tipo', true) as MovCallType
  const participantesRaw = interaction.options.getString('participantes')
  const today = formatBrasiliaDate(new Date())

  if (participantesRaw && participantesRaw.trim()) {
    const ids = parseParticipantsList(participantesRaw)
    if (ids.length === 0) {
      await interaction.reply({ content: '❌ Não encontrei nenhuma menção ou ID válido nessa lista.', ephemeral: true })
      return
    }
    const embed = await processParticipants(guild, tipo, ids, interaction.user.tag, today)
    await interaction.reply({ embeds: [embed] })
    return
  }

  await runInteractiveMovCall(interaction, guild, tipo, today)
}

async function runInteractiveMovCall(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  tipo: MovCallType,
  today: string,
): Promise<void> {
  const collected = new Map<string, string>() // userId -> tag

  function buildEmbed(): EmbedBuilder {
    const lines = [...collected.values()]
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📋 Nova Mov. Call — ${tipo === 'normal' ? 'Normal' : 'Temática / Outra MOV'}`)
      .setDescription(
        `Data: **${today}** (horário de Brasília)\n\n` +
          'Usa o botão abaixo para ires adicionando participantes um a um, por menção ou ID.\n\n' +
          (lines.length > 0 ? `**Participantes (${lines.length}):**\n${lines.map((t) => `• ${t}`).join('\n')}` : '_Ainda sem participantes._'),
      )
      .setFooter({ text: `+${POINTS_BY_TYPE[tipo]} pontos por participante · só tu consegues usar estes botões` })
  }

  function buildRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('movcall:add').setLabel('Adicionar participante').setStyle(ButtonStyle.Primary).setEmoji('➕'),
      new ButtonBuilder()
        .setCustomId('movcall:finish')
        .setLabel('Concluir e atribuir pontos')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
        .setDisabled(collected.size === 0),
      new ButtonBuilder().setCustomId('movcall:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )
  }

  const reply = await interaction.reply({ embeds: [buildEmbed()], components: [buildRow()], ephemeral: true, withResponse: true })
  const message = reply.resource?.message
  if (!message) return

  await loop(message)

  async function loop(msg: Message): Promise<void> {
    try {
      const click = await msg.awaitMessageComponent({ time: SETUP_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })

      if (click.customId === 'movcall:cancel') {
        await click.update({ content: '❌ Registo de Mov. Call cancelado.', embeds: [], components: [] })
        return
      }

      if (click.customId === 'movcall:finish') {
        await click.update({ content: '⏳ A atribuir pontos…', embeds: [], components: [] })
        const embed = await processParticipants(guild, tipo, [...collected.keys()], interaction.user.tag, today)
        await interaction.followUp({ embeds: [embed] })
        await interaction.editReply({ content: '✅ Concluído — vê a mensagem publicada acima.', embeds: [], components: [] })
        return
      }

      // movcall:add
      const modal = new ModalBuilder()
        .setCustomId('movcall:modal')
        .setTitle('Adicionar participante')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('person')
              .setLabel('Menção (@pessoa) ou ID da pessoa')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder('Ex.: @nome ou 123456789012345678'),
          ),
        )
      await click.showModal(modal)

      try {
        const submitted = await click.awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })
        const raw = submitted.fields.getTextInputValue('person').trim()
        const id = extractUserId(raw)
        if (!id) {
          await submitted.reply({ content: '❌ Não reconheci essa menção/ID. Tenta outra vez.', ephemeral: true })
        } else {
          const member = await guild.members.fetch(id).catch(() => null)
          if (!member) {
            await submitted.reply({ content: '❌ Não encontrei ninguém no servidor com esse ID.', ephemeral: true })
          } else {
            collected.set(id, member.user.tag)
            await submitted.deferUpdate()
          }
        }
      } catch {
        // modal fechada sem submeter — continua o ciclo sem alterar nada
      }

      await interaction.editReply({ embeds: [buildEmbed()], components: [buildRow()] })
      await loop(msg)
    } catch {
      await interaction.editReply({ content: '⏱️ Tempo esgotado — registo de Mov. Call cancelado.', embeds: [], components: [] }).catch(() => undefined)
    }
  }
}

async function processParticipants(
  guild: Guild,
  tipo: MovCallType,
  ids: string[],
  runnerTag: string,
  today: string,
): Promise<EmbedBuilder> {
  const points = POINTS_BY_TYPE[tipo]
  const awarded: string[] = []
  let skipped = 0

  for (const id of ids) {
    const member = await guild.members.fetch(id).catch(() => null)
    if (!member) {
      skipped += 1
      continue
    }
    movPoints.addPoints(guild.id, id, member.user.tag, points)
    awarded.push(member.user.tag)
  }

  await refreshBoard(guild)

  const embed = new EmbedBuilder()
    .setColor(tipo === 'normal' ? 0x5865f2 : 0xf0b232)
    .setTitle(tipo === 'normal' ? '📋 Mov. Call Normal registada' : '📋 Mov. Call Temática / Outra MOV registada')
    .setDescription(
      awarded.length > 0
        ? `**+${points} pontos** de MOV. Call para:\n${awarded.map((tag) => `• ${tag}`).join('\n')}`
        : 'Nenhum participante válido foi encontrado.',
    )
    .setFooter({
      text: `Registado por ${runnerTag} em ${today} · ${awarded.length} participante(s)${skipped ? ` · ${skipped} inválido(s) ignorado(s)` : ''}`,
    })
    .setTimestamp(new Date())

  return embed
}

// ==========================================================================
// /pontosmov (público)
// ==========================================================================

async function runVerPontos(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const target = interaction.options.getUser('membro') ?? interaction.user
  const entry = movPoints.getLeaderboard(guild.id).find((e) => e.userId === target.id)
  const points = entry?.points ?? 0

  const embed = new EmbedBuilder()
    .setColor(0xf0b232)
    .setTitle('🏅 Pontos de MOV. Call')
    .setDescription(`**${target.tag}** tem **${points} pontos** neste servidor.`)
  await interaction.reply({ embeds: [embed] })
}

async function runRanking(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  await interaction.reply({ embeds: [buildBoardEmbed(guild)] })
}

// ==========================================================================
// /pontosmovadmin (gestão)
// ==========================================================================

async function runAdicionar(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const user = interaction.options.getUser('membro', true)
  const amount = interaction.options.getInteger('quantidade', true)
  const newTotal = movPoints.addPoints(guild.id, user.id, user.tag, amount)
  await refreshBoard(guild)

  const embed = new EmbedBuilder()
    .setColor(0x3ba55c)
    .setTitle('🏅 Pontos adicionados')
    .setDescription(`**+${amount} pontos** de MOV. Call para **${user.tag}**.\nSaldo atual: **${newTotal} pontos**.`)
  await interaction.reply({ embeds: [embed] })
}

async function runRemover(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const user = interaction.options.getUser('membro', true)
  const amount = interaction.options.getInteger('quantidade', true)
  const newTotal = movPoints.removePoints(guild.id, user.id, user.tag, amount)
  await refreshBoard(guild)

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🏅 Pontos removidos')
    .setDescription(`**-${amount} pontos** de MOV. Call de **${user.tag}**.\nSaldo atual: **${newTotal} pontos**.`)
  await interaction.reply({ embeds: [embed] })
}

async function runPainel(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const channel = interaction.options.getChannel('canal', true)
  movPoints.setBoardChannel(guild.id, channel.id, channel.name)
  await refreshBoard(guild)

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🏅 Painel de pontos configurado')
    .setDescription(`O painel de pontos de MOV. Call vai ser mantido atualizado em <#${channel.id}>.`)
  await interaction.reply({ embeds: [embed], ephemeral: true })
}

// ==========================================================================
// Painel em tempo real
// ==========================================================================

export async function refreshBoard(guild: Guild): Promise<void> {
  const config = movPoints.getBoardConfig(guild.id)
  if (!config.channelId) return

  const channel = await guild.channels.fetch(config.channelId).catch(() => null)
  if (!channel || !channel.isTextBased() || channel instanceof PartialGroupDMChannel) return

  const embed = buildBoardEmbed(guild)
  const messageId = movPoints.getBoardMessageId(guild.id)

  if (messageId) {
    const existing = await channel.messages.fetch(messageId).catch(() => null)
    if (existing) {
      await existing.edit({ embeds: [embed] }).catch(() => undefined)
      return
    }
  }

  const sent = await channel.send({ embeds: [embed] }).catch(() => null)
  if (sent) movPoints.setBoardMessageId(guild.id, sent.id)
}

function buildBoardEmbed(guild: Guild): EmbedBuilder {
  const leaderboard = movPoints.getLeaderboard(guild.id)
  const medals = ['🥇', '🥈', '🥉']
  const lines = leaderboard.map((entry, i) => `${medals[i] ?? `${i + 1}.`} **${entry.tag}** — ${entry.points} pontos`)

  return new EmbedBuilder()
    .setColor(0xf0b232)
    .setTitle('🏅 PONTOS DE MOV. CALL')
    .setDescription(lines.length > 0 ? lines.join('\n') : '_Ainda ninguém tem pontos registados._')
    .setFooter({ text: `${guild.name} · atualizado em ${formatBrasiliaDate(new Date())}` })
    .setTimestamp(new Date())
}

// ==========================================================================
// Auxiliares
// ==========================================================================

function extractUserId(raw: string): string | null {
  const mentionMatch = raw.match(/^<@!?(\d{15,21})>$/)
  if (mentionMatch) return mentionMatch[1]
  if (/^\d{15,21}$/.test(raw)) return raw
  return null
}

function parseParticipantsList(text: string): string[] {
  const ids = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(extractUserId)
    .filter((id): id is string => id !== null)
  return [...new Set(ids)]
}

function formatBrasiliaDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full' }).format(date)
}
