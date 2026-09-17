import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Guild,
  type Message,
  type MessageEditOptions,
  ModalBuilder,
  type ModalSubmitInteraction,
  PartialGroupDMChannel,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js'
import type { MovCallType, MovPointsEntry } from '../../shared/types'
import * as movPoints from '../store/movPoints'
import { buildFullLeaderboard } from './leaderboard'

const POINTS_BY_TYPE: Record<MovCallType, number> = { normal: 10, tematica: 15 }
const INACTIVE_HOURS_THRESHOLD_SECONDS = 5 * 3600
const MAX_BOARD_LINES = 60
const SETUP_TIMEOUT_MS = 10 * 60_000
const MODAL_TIMEOUT_MS = 120_000
const RESULT_DISPLAY_MS = 6_000
const CANCEL_DISPLAY_MS = 2_500

export function movCallCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('movcall')
    .setDescription('Regista uma Mov. Call de hoje e atribui pontos a quem participou')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON()
}

export function movHorasCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('movhoras')
    .setDescription('Atribui horas de Mov. Call a um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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

export function resetMovCallCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('resetmovcall')
    .setDescription('Apaga TODOS os pontos e horas de Mov. Call do servidor, deixando o placar vazio')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON()
}

export function inativosCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('inativos')
    .setDescription('Mostra membros sem pontos ou com menos de 5 horas de Mov. Call')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON()
}

export function movCallCommandDefs(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [
    movCallCommandDef(),
    movHorasCommandDef(),
    pontosMovCommandDef(),
    pontosMovAdminCommandDef(),
    resetMovCallCommandDef(),
    inativosCommandDef(),
  ]
}

export async function handleMovCallCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!['movcall', 'movhoras', 'pontosmov', 'pontosmovadmin', 'resetmovcall', 'inativos'].includes(interaction.commandName)) return false

  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este comando só funciona dentro de um servidor.', ephemeral: true })
    return true
  }

  if (interaction.commandName === 'movcall') {
    await runMovCall(interaction, guild)
    return true
  }

  if (interaction.commandName === 'movhoras') {
    await runMovHoras(interaction, guild)
    return true
  }

  if (interaction.commandName === 'resetmovcall') {
    await runResetMovCall(interaction, guild)
    return true
  }

  if (interaction.commandName === 'inativos') {
    await runInativos(interaction, guild)
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
// /movcall — assistente por botões + modal
// ==========================================================================

async function runMovCall(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const today = formatBrasiliaDate(new Date())
  let tipo: MovCallType | null = null
  let errorText = ''

  function chooseTypeEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📋 Nova Mov. Call')
      .setDescription(`Data de hoje: **${today}** (horário de Brasília)\n\nEscolhe que tipo de Mov. Call foi realizada:`)
      .addFields(
        { name: '🔵 Normal', value: 'Sem temática, 1 hora — **10 pontos**', inline: true },
        { name: '🟡 Temática ou Outras MOVS', value: '1 hora ou mais — **15 pontos**', inline: true },
      )
      .setFooter({ text: 'Só tu consegues usar estes botões.' })
  }

  function chooseTypeRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('movcall:tipo:normal').setLabel('Normal · 10 pontos').setStyle(ButtonStyle.Primary).setEmoji('🔵'),
      new ButtonBuilder().setCustomId('movcall:tipo:tematica').setLabel('Temática/Outra · 15 pontos').setStyle(ButtonStyle.Success).setEmoji('🟡'),
      new ButtonBuilder().setCustomId('movcall:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )
  }

  function listEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(tipo === 'normal' ? 0x5865f2 : 0xf0b232)
      .setTitle(`📋 Mov. Call ${tipo === 'normal' ? 'Normal' : 'Temática / Outra MOV'}`)
      .setDescription(
        'Clica em **Escrever lista** e cola os participantes numa caixa de texto, um **ID** por linha (menções não funcionam aqui — o Discord não permite escrevê-las dentro desta janela).\n\n' +
          '💡 Não sabes o ID de alguém? Ativa o **Modo de Programador** em Definições → Avançado no Discord, depois clica com o botão direito no membro → **Copiar ID de Utilizador**.',
      )
      .setFooter({ text: `+${POINTS_BY_TYPE[tipo ?? 'normal']} pontos por participante` })
  }

  function listRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('movcall:writeList').setLabel('Escrever lista').setStyle(ButtonStyle.Primary).setEmoji('📝'),
      new ButtonBuilder().setCustomId('movcall:back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
      new ButtonBuilder().setCustomId('movcall:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )
  }

  function errorEmbed(): EmbedBuilder {
    return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Não consegui perceber a lista').setDescription(errorText)
  }

  function errorRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('movcall:back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
      new ButtonBuilder().setCustomId('movcall:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )
  }

  const reply = await interaction.reply({ embeds: [chooseTypeEmbed()], components: [chooseTypeRow()], ephemeral: true, withResponse: true })
  const message = reply.resource?.message
  if (!message) return

  async function deleteAfter(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms))
    await interaction.deleteReply().catch(() => undefined)
  }

  await loop(message)

  async function loop(msg: Message): Promise<void> {
    try {
      const click = await msg.awaitMessageComponent({ time: SETUP_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })

      if (click.customId === 'movcall:cancel') {
        await click.update({ embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle('Cancelado').setDescription('Registo de Mov. Call cancelado.')], components: [] })
        await deleteAfter(CANCEL_DISPLAY_MS)
        return
      }

      if (click.customId === 'movcall:tipo:normal' || click.customId === 'movcall:tipo:tematica') {
        tipo = click.customId.endsWith('normal') ? 'normal' : 'tematica'
        await click.update({ embeds: [listEmbed()], components: [listRow()] })
        await loop(msg)
        return
      }

      if (click.customId === 'movcall:back') {
        tipo = null
        await click.update({ embeds: [chooseTypeEmbed()], components: [chooseTypeRow()] })
        await loop(msg)
        return
      }

      if (click.customId === 'movcall:writeList') {
        const modal = new ModalBuilder()
          .setCustomId('movcall:modal')
          .setTitle('Lista de participantes')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('lista')
                .setLabel('Um ID por linha (não funciona com menções)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setPlaceholder('123456789012345678\n987654321098765432'),
            ),
          )
        await click.showModal(modal)

        let submitted: ModalSubmitInteraction
        try {
          submitted = await click.awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })
        } catch {
          // modal fechada sem submeter — mantém-se no passo da lista
          await interaction.editReply({ embeds: [listEmbed()], components: [listRow()] })
          await loop(msg)
          return
        }

        try {
          const ids = parseParticipantsList(submitted.fields.getTextInputValue('lista'))

          if (ids.length === 0) {
            errorText = 'Não encontrei nenhum ID válido nessa lista. Confirma que puseste um ID por linha (não funciona com menções @pessoa).'
            await updateFromModal(submitted, interaction, { embeds: [errorEmbed()], components: [errorRow()] })
            await loop(msg)
            return
          }

          await updateFromModal(submitted, interaction, { embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('⏳ A atribuir pontos…')], components: [] })
          const resultEmbed = await processParticipants(guild, tipo ?? 'normal', ids, interaction.user.tag, today)
          await interaction.editReply({ embeds: [resultEmbed], components: [] })
          await deleteAfter(RESULT_DISPLAY_MS)
        } catch (err) {
          console.error('[movcall] Erro ao atribuir pontos:', err)
          errorText = `Ocorreu um erro ao atribuir os pontos e nada foi guardado. Tenta novamente.\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``
          await interaction.editReply({ embeds: [errorEmbed()], components: [errorRow()] }).catch(() => undefined)
          await loop(msg)
        }
        return
      }

      await loop(msg)
    } catch {
      await interaction
        .editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('⏱️ Tempo esgotado').setDescription('Registo de Mov. Call cancelado.')], components: [] })
        .catch(() => undefined)
      await interaction.deleteReply().catch(() => undefined)
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
  let bots = 0

  for (const id of ids) {
    const member = await guild.members.fetch(id).catch(() => null)
    if (!member) {
      skipped += 1
      continue
    }
    if (member.user.bot) {
      bots += 1
      continue
    }
    movPoints.addPoints(guild.id, id, member.user.tag, points, runnerTag, `Mov. Call ${tipo === 'normal' ? 'Normal' : 'Temática/Outra'} de ${today}`)
    awarded.push(`<@${id}>`)
  }

  await refreshBoard(guild)

  const notes = [skipped ? `${skipped} inválido(s) ignorado(s)` : null, bots ? `${bots} bot(s) ignorado(s)` : null].filter(Boolean).join(' · ')

  const embed = new EmbedBuilder()
    .setColor(tipo === 'normal' ? 0x5865f2 : 0xf0b232)
    .setTitle(tipo === 'normal' ? '📋 Mov. Call Normal registada' : '📋 Mov. Call Temática / Outra MOV registada')
    .setDescription(
      awarded.length > 0
        ? `**+${points} pontos** de MOV. Call para:\n${awarded.map((mention) => `• ${mention}`).join('\n')}`
        : 'Nenhum participante válido foi encontrado (bots não recebem pontos).',
    )
    .setFooter({
      text: `Registado por ${runnerTag} em ${today} · ${awarded.length} participante(s)${notes ? ` · ${notes}` : ''}`,
    })
    .setTimestamp(new Date())

  return embed
}

// ==========================================================================
// /movhoras — assistente por seletor de membro + modal
// ==========================================================================

async function runMovHoras(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  let targetId: string | null = null
  let targetTag: string | null = null
  let errorText = ''

  function selectEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⏱️ Atribuir horas de Mov. Call')
      .setDescription('Escolhe o membro a quem vais atribuir horas:')
      .setFooter({ text: 'Só tu consegues usar isto.' })
  }

  function selectRows(): [ActionRowBuilder<UserSelectMenuBuilder>, ActionRowBuilder<ButtonBuilder>] {
    return [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder().setCustomId('movhoras:pick').setPlaceholder('Escolhe um membro').setMinValues(1).setMaxValues(1),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('movhoras:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
      ),
    ]
  }

  function timeEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⏱️ Atribuir horas de Mov. Call')
      .setDescription(`Membro selecionado: **${targetTag}**\n\nClica em **Escrever tempo** para indicar quantas horas, minutos e segundos atribuir.`)
  }

  function timeRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('movhoras:write').setLabel('Escrever tempo').setStyle(ButtonStyle.Primary).setEmoji('📝'),
      new ButtonBuilder().setCustomId('movhoras:back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
      new ButtonBuilder().setCustomId('movhoras:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )
  }

  function errorEmbed(): EmbedBuilder {
    return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Valores inválidos').setDescription(errorText)
  }

  function errorRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('movhoras:back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
      new ButtonBuilder().setCustomId('movhoras:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )
  }

  const reply = await interaction.reply({ embeds: [selectEmbed()], components: selectRows(), ephemeral: true, withResponse: true })
  const message = reply.resource?.message
  if (!message) return

  async function deleteAfter(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms))
    await interaction.deleteReply().catch(() => undefined)
  }

  await loop(message)

  async function loop(msg: Message): Promise<void> {
    try {
      const click = await msg.awaitMessageComponent({ time: SETUP_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })

      if (click.customId === 'movhoras:cancel') {
        await click.update({ embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle('Cancelado')], components: [] })
        await deleteAfter(CANCEL_DISPLAY_MS)
        return
      }

      if (click.isUserSelectMenu() && click.customId === 'movhoras:pick') {
        const user = click.users.first()
        if (!user) {
          await loop(msg)
          return
        }
        targetId = user.id
        targetTag = user.tag
        await click.update({ embeds: [timeEmbed()], components: [timeRow()] })
        await loop(msg)
        return
      }

      if (click.customId === 'movhoras:back') {
        targetId = null
        targetTag = null
        await click.update({ embeds: [selectEmbed()], components: selectRows() })
        await loop(msg)
        return
      }

      if (click.customId === 'movhoras:write') {
        const modal = new ModalBuilder()
          .setCustomId('movhoras:modal')
          .setTitle('Tempo de Mov. Call')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId('horas').setLabel('Horas').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('0'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId('minutos').setLabel('Minutos').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('0'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId('segundos').setLabel('Segundos').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('0'),
            ),
          )
        await click.showModal(modal)

        let submitted: ModalSubmitInteraction
        try {
          submitted = await click.awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })
        } catch {
          await interaction.editReply({ embeds: [timeEmbed()], components: [timeRow()] })
          await loop(msg)
          return
        }

        try {
          const h = parseNonNegativeInt(submitted.fields.getTextInputValue('horas'))
          const m = parseNonNegativeInt(submitted.fields.getTextInputValue('minutos'))
          const s = parseNonNegativeInt(submitted.fields.getTextInputValue('segundos'))

          if (h === null || m === null || s === null || (h === 0 && m === 0 && s === 0)) {
            errorText = 'Escreve números válidos (0 ou mais) em pelo menos um dos campos de horas, minutos ou segundos.'
            await updateFromModal(submitted, interaction, { embeds: [errorEmbed()], components: [errorRow()] })
            await loop(msg)
            return
          }

          const totalSeconds = h * 3600 + m * 60 + s
          const newTotal = movPoints.addHours(guild.id, targetId as string, targetTag as string, totalSeconds, interaction.user.tag)
          await refreshBoard(guild)

          const embed = new EmbedBuilder()
            .setColor(0x3ba55c)
            .setTitle('⏱️ Horas atribuídas')
            .setDescription(`**+${formatDuration(totalSeconds)}** de Mov. Call para <@${targetId}>.\nTotal acumulado: **${formatDuration(newTotal)}**.`)
          await updateFromModal(submitted, interaction, { embeds: [embed], components: [] })
          await deleteAfter(RESULT_DISPLAY_MS)
        } catch (err) {
          console.error('[movhoras] Erro ao atribuir horas:', err)
          errorText = `Ocorreu um erro ao atribuir as horas e nada foi guardado. Tenta novamente.\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``
          await interaction.editReply({ embeds: [errorEmbed()], components: [errorRow()] }).catch(() => undefined)
          await loop(msg)
        }
        return
      }

      await loop(msg)
    } catch {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('⏱️ Tempo esgotado')], components: [] }).catch(() => undefined)
      await interaction.deleteReply().catch(() => undefined)
    }
  }
}

// ==========================================================================
// /pontosmov (público)
// ==========================================================================

async function runVerPontos(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  try {
    const target = interaction.options.getUser('membro') ?? interaction.user
    const entry = movPoints.getLeaderboard(guild.id).find((e) => e.userId === target.id)
    const points = entry?.points ?? 0
    const totalSeconds = entry?.totalSeconds ?? 0

    const embed = new EmbedBuilder()
      .setColor(0xf0b232)
      .setTitle('🏅 Pontos de MOV. Call')
      .setDescription(`<@${target.id}> tem **${points} pontos** e **${formatDuration(totalSeconds)}** de Mov. Call neste servidor.`)
    await interaction.reply({ embeds: [embed] })
  } catch (err) {
    console.error('[pontosmov ver] Erro:', err)
    await replyWithError(interaction, 'Não consegui consultar os pontos.', err)
  }
}

async function runRanking(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  await interaction.deferReply()
  try {
    await interaction.editReply({ embeds: [await buildBoardEmbed(guild)] })
  } catch (err) {
    console.error('[pontosmov ranking] Erro:', err)
    await replyWithError(interaction, 'Não consegui montar o ranking.', err)
  }
}

// ==========================================================================
// /pontosmovadmin (gestão)
// ==========================================================================

async function runAdicionar(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const user = interaction.options.getUser('membro', true)
  const amount = interaction.options.getInteger('quantidade', true)

  try {
    const newTotal = movPoints.addPoints(guild.id, user.id, user.tag, amount, interaction.user.tag)
    await refreshBoard(guild)

    const embed = new EmbedBuilder()
      .setColor(0x3ba55c)
      .setTitle('🏅 Pontos adicionados')
      .setDescription(`**+${amount} pontos** de MOV. Call para <@${user.id}>.\nSaldo atual: **${newTotal} pontos**.`)
    await interaction.reply({ embeds: [embed] })
  } catch (err) {
    console.error('[pontosmovadmin adicionar] Erro:', err)
    await replyWithError(interaction, 'Não consegui adicionar os pontos.', err)
  }
}

async function runRemover(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const user = interaction.options.getUser('membro', true)
  const amount = interaction.options.getInteger('quantidade', true)

  try {
    const newTotal = movPoints.removePoints(guild.id, user.id, user.tag, amount, interaction.user.tag)
    await refreshBoard(guild)

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🏅 Pontos removidos')
      .setDescription(`**-${amount} pontos** de MOV. Call de <@${user.id}>.\nSaldo atual: **${newTotal} pontos**.`)
    await interaction.reply({ embeds: [embed] })
  } catch (err) {
    console.error('[pontosmovadmin remover] Erro:', err)
    await replyWithError(interaction, 'Não consegui remover os pontos.', err)
  }
}

async function runPainel(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const channel = interaction.options.getChannel('canal', true)

  try {
    movPoints.setBoardChannel(guild.id, channel.id, channel.name)

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🏅 Painel de pontos configurado')
      .setDescription(`O painel de pontos de MOV. Call vai ser mantido atualizado em <#${channel.id}>.`)
    await interaction.reply({ embeds: [embed], ephemeral: true })

    await refreshBoard(guild).catch((err) => console.error('[pontosmovadmin painel] Falha ao publicar o painel:', err))
  } catch (err) {
    console.error('[pontosmovadmin painel] Erro:', err)
    await replyWithError(interaction, 'Não consegui configurar o canal do painel.', err)
  }
}

// ==========================================================================
// /resetmovcall (gestão)
// ==========================================================================

async function runResetMovCall(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const count = movPoints.getLeaderboard(guild.id).length

  if (count === 0) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle('Nada para repor').setDescription('Não há pontos registados neste servidor.')],
      ephemeral: true,
    })
    return
  }

  const confirmEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('⚠️ Repor pontos de Mov. Call')
    .setDescription(
      `Isto vai apagar os pontos e horas de **${count} pessoa(s)** neste servidor e deixar o placar vazio. Esta ação não pode ser desfeita.`,
    )

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('resetmovcall:confirm').setLabel('Sim, apagar tudo').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    new ButtonBuilder().setCustomId('resetmovcall:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
  )

  const reply = await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true, withResponse: true })
  const message = reply.resource?.message
  if (!message) return

  try {
    const click = await message.awaitMessageComponent({ time: 30_000, filter: (i) => i.user.id === interaction.user.id })

    if (click.customId === 'resetmovcall:confirm') {
      try {
        movPoints.resetGuild(guild.id, interaction.user.tag)
        await refreshBoard(guild)
        await click.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x3ba55c)
              .setTitle('✅ Placar reposto')
              .setDescription('Todos os pontos e horas de Mov. Call deste servidor foram apagados.'),
          ],
          components: [],
        })
      } catch (err) {
        console.error('[resetmovcall] Erro:', err)
        await replyWithError(interaction, 'Não consegui repor o placar.', err)
      }
      return
    }

    await click.update({
      embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle('Cancelado').setDescription('Nada foi apagado.')],
      components: [],
    })
  } catch {
    await interaction
      .editReply({ embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle('⏱️ Tempo esgotado').setDescription('Nada foi apagado.')], components: [] })
      .catch(() => undefined)
  }
}

// ==========================================================================
// /inativos (gestão)
// ==========================================================================

async function runInativos(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  await interaction.deferReply()
  try {
    await interaction.editReply({ embeds: [await buildInactiveEmbed(guild)] })
  } catch (err) {
    console.error('[inativos] Erro:', err)
    await replyWithError(interaction, 'Não consegui montar a lista de inativos.', err)
  }
}

async function buildInactiveEmbed(guild: Guild): Promise<EmbedBuilder> {
  const leaderboard = await buildFullLeaderboard(guild)
  const inactive = leaderboard.filter((entry) => entry.points === 0 || entry.totalSeconds < INACTIVE_HOURS_THRESHOLD_SECONDS)
  const { shown, remaining } = capLines(inactive, MAX_BOARD_LINES)

  const lines = shown.map((entry) => `⚠️ <@${entry.userId}> — ${entry.points} pontos · ${formatDuration(entry.totalSeconds)}`)
  if (remaining > 0) lines.push(`_+ ${remaining} membro(s) inativo(s) não mostrado(s)._`)

  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('⚠️ MEMBROS INATIVOS')
    .setDescription(
      lines.length > 0 ? lines.join('\n') : '_Ninguém está abaixo do limite — toda a gente tem pontos e pelo menos 5 horas de Mov. Call._',
    )
    .setFooter({ text: `${guild.name} · sem pontos ou menos de 5h de Mov. Call · não inclui bots` })
    .setTimestamp(new Date())
}

// ==========================================================================
// Painel em tempo real
// ==========================================================================

export async function refreshBoard(guild: Guild): Promise<void> {
  const config = movPoints.getBoardConfig(guild.id)
  if (!config.channelId) return

  const channel = await guild.channels.fetch(config.channelId).catch(() => null)
  if (!channel || !channel.isTextBased() || channel instanceof PartialGroupDMChannel) return

  const embed = await buildBoardEmbed(guild)
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

async function buildBoardEmbed(guild: Guild): Promise<EmbedBuilder> {
  const leaderboard = await buildFullLeaderboard(guild)
  const medals = ['🥇', '🥈', '🥉']
  const { shown, remaining } = capLines(leaderboard, MAX_BOARD_LINES)

  const lines = shown.map((entry, i) => {
    const hoursText = entry.totalSeconds > 0 ? ` · ${formatDuration(entry.totalSeconds)}` : ''
    return `${medals[i] ?? `${i + 1}.`} <@${entry.userId}> — ${entry.points} pontos${hoursText}`
  })
  if (remaining > 0) lines.push(`_+ ${remaining} membro(s) não mostrado(s)._`)

  return new EmbedBuilder()
    .setColor(0xf0b232)
    .setTitle('🏅 PONTOS DE MOV. CALL')
    .setDescription(lines.length > 0 ? lines.join('\n') : '_Este servidor ainda não tem membros para mostrar._')
    .setFooter({ text: `${guild.name} · atualizado em ${formatBrasiliaDate(new Date())}` })
    .setTimestamp(new Date())
}

// ==========================================================================
// Auxiliares
// ==========================================================================

/** Corta a lista num máximo de linhas, para nunca ultrapassar o limite de tamanho de um embed do Discord. */
function capLines(entries: MovPointsEntry[], max: number): { shown: MovPointsEntry[]; remaining: number } {
  if (entries.length <= max) return { shown: entries, remaining: 0 }
  return { shown: entries.slice(0, max), remaining: entries.length - max }
}

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

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return 0
  if (!/^\d+$/.test(trimmed)) return null
  return Number(trimmed)
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

/** Responde (ou edita a resposta pendente) com um erro visível, em vez de deixar a interação cair silenciosamente. */
async function replyWithError(interaction: ChatInputCommandInteraction, title: string, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err)
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('❌ Ocorreu um erro')
    .setDescription(`${title}\n\`\`\`${detail}\`\`\``)
  const payload = { embeds: [embed], ephemeral: true }
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => undefined)
  } else {
    await interaction.reply(payload).catch(() => undefined)
  }
}

/** `ModalSubmitInteraction.update()` só existe quando a modal foi aberta a partir de um componente de mensagem — o que é sempre o nosso caso, mas o TS só o sabe depois deste type guard. */
async function updateFromModal(
  submitted: ModalSubmitInteraction,
  parent: ChatInputCommandInteraction,
  payload: MessageEditOptions,
): Promise<void> {
  if (submitted.isFromMessage()) {
    await submitted.update(payload)
  } else {
    await parent.editReply(payload)
  }
}

function formatBrasiliaDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full' }).format(date)
}
