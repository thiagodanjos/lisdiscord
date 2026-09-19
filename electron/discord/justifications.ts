import {
  ActionRowBuilder,
  type ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type Message,
  type MessageEditOptions,
  ModalBuilder,
  type ModalSubmitInteraction,
  PartialGroupDMChannel,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js'
import type { JustificationChannelKind, JustificationSettings, JustificationType } from '../../shared/types'
import { buildEmbedFromDraft } from './embedTemplate'
import * as embedTemplates from '../store/embedTemplates'
import * as justificationSettingsStore from '../store/justificationSettings'

const SETUP_TIMEOUT_MS = 10 * 60_000
const MODAL_TIMEOUT_MS = 120_000
const RESULT_DISPLAY_MS = 8_000
const CANCEL_DISPLAY_MS = 2_500

// ==========================================================================
// Mensagem instrutiva publicada no canal — com os botões Justificar / Remover Justificativa
// ==========================================================================

/**
 * Publica (ou atualiza, se `existingMessageId` ainda existir nesse canal) a mensagem instrutiva.
 * Não lê nem escreve na store — devolve o id da mensagem resultante, para quem chamar decidir quando
 * e como persistir, sem risco de a store ficar com um valor a meio de uma escrita mais larga (ex.:
 * mudar de canal ao mesmo tempo).
 */
export async function postJustificationMessage(
  guild: Guild,
  type: JustificationType,
  channelId: string,
  existingMessageId: string | null,
): Promise<string> {
  const channel = await guild.channels.fetch(channelId).catch(() => null)
  if (!channel || !channel.isTextBased() || channel instanceof PartialGroupDMChannel) {
    throw new Error('Não encontrei esse canal ou ele não aceita mensagens de texto.')
  }

  const embed = buildInstructionEmbed(type, guild)
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`justification:file:${type}`).setLabel('Justificar').setStyle(ButtonStyle.Primary).setEmoji('📝'),
    new ButtonBuilder()
      .setCustomId(`justification:remove:${type}`)
      .setLabel('Remover Justificativa')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
  )

  if (existingMessageId) {
    const existing = await channel.messages.fetch(existingMessageId).catch(() => null)
    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] })
      return existing.id
    }
  }

  const sent = await channel.send({ embeds: [embed], components: [row] })
  return sent.id
}

/** Apaga a mensagem instrutiva antiga — usado quando o canal de publicação muda ou é limpo na app, para nunca deixar um botão "Justificar" órfão a funcionar num canal que já não está configurado. */
export async function deleteJustificationMessage(guild: Guild, channelId: string, messageId: string): Promise<void> {
  const channel = await guild.channels.fetch(channelId).catch(() => null)
  if (!channel || !channel.isTextBased() || channel instanceof PartialGroupDMChannel) return
  const message = await channel.messages.fetch(messageId).catch(() => null)
  if (!message) return
  await message.delete().catch(() => undefined)
}

/**
 * Aplica a escolha de um canal de justificativas (guardar, publicar/atualizar a mensagem, apagar a
 * antiga se mudou) — a mesma lógica usada tanto pelo IPC da app desktop como pela API HTTP do bot
 * autónomo, para nunca haver duas implementações a divergir.
 *
 * `guild` só é obrigatório quando `channelId` é passado para um canal de publicação (é preciso estar
 * ligado à Discord para publicar lá a mensagem) — nos outros casos (canais de log, ou limpar um canal)
 * funciona mesmo com `guild` nulo, só sem conseguir confirmar o nome do canal.
 */
export async function applyJustificationChannel(
  guild: Guild | null,
  guildId: string,
  kind: JustificationChannelKind,
  channelId: string | null,
): Promise<JustificationSettings> {
  let channelName: string | null = null
  if (channelId && guild) {
    const channel = await guild.channels.fetch(channelId).catch(() => null)
    channelName = channel && 'name' in channel ? (channel.name ?? channelId) : channelId
  }

  if (kind !== 'fixedPost' && kind !== 'dailyPost') {
    return justificationSettingsStore.setChannel(guildId, kind, channelId, channelName)
  }

  const type = kind === 'fixedPost' ? 'fixed' : 'daily'
  const current = justificationSettingsStore.getSettings(guildId)
  const oldChannelId = type === 'fixed' ? current.fixedPostChannelId : current.dailyPostChannelId
  const oldMessageId = justificationSettingsStore.getPostMessageId(guildId, type)
  const channelChanged = oldChannelId !== channelId

  // Para os canais de publicação, valida e publica ANTES de guardar — assim, se a publicação falhar
  // (permissões, canal apagado, bot desligado), nada fica guardado a meio e o erro chega a quem chamou
  // em vez de a pessoa pensar que a mensagem foi publicada quando não foi.
  if (channelId) {
    if (!guild) throw new Error('O bot não está ligado — liga-o antes de escolher este canal.')
    const existingMessageId = channelChanged ? null : oldMessageId
    const messageId = await postJustificationMessage(guild, type, channelId, existingMessageId)
    const updated = justificationSettingsStore.setChannel(guildId, kind, channelId, channelName)
    justificationSettingsStore.setPostMessageId(guildId, type, messageId)

    // Mudou de canal — a mensagem antiga fica órfã com botões que ninguém deve poder usar, por isso é
    // apagada depois de a nova já estar publicada e guardada com sucesso.
    if (channelChanged && oldChannelId && oldMessageId) {
      await deleteJustificationMessage(guild, oldChannelId, oldMessageId).catch((err) =>
        console.error('[justifications] Falha ao apagar a mensagem antiga:', err),
      )
    }
    return updated
  }

  // Canal limpo ("Nenhum") — apaga a mensagem antiga, já que já não há configuração nenhuma para ela.
  const updated = justificationSettingsStore.setChannel(guildId, kind, null, null)
  if (guild && oldChannelId && oldMessageId) {
    await deleteJustificationMessage(guild, oldChannelId, oldMessageId).catch((err) =>
      console.error('[justifications] Falha ao apagar a mensagem antiga:', err),
    )
  }
  return updated
}

function buildInstructionEmbed(type: JustificationType, guild: Guild): EmbedBuilder {
  const kind = type === 'fixed' ? 'justificationFixed' : 'justificationDaily'
  const draft = embedTemplates.getTemplate(guild.id, kind)
  return buildEmbedFromDraft(draft, { servidor: guild.name })
}

// ==========================================================================
// Dispatcher global dos botões — a mensagem é permanente, por isso não usa collector local
// ==========================================================================

export async function handleJustificationButtons(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('justification:')) return false

  const parts = interaction.customId.split(':')
  const action = parts[1]
  const type = parts[2]
  if ((action !== 'file' && action !== 'remove') || (type !== 'fixed' && type !== 'daily')) return false

  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este botão só funciona dentro de um servidor.', ephemeral: true })
    return true
  }

  if (action === 'file') await runFileJustification(interaction, guild, type)
  else await runRemoveJustification(interaction, guild, type)
  return true
}

// ==========================================================================
// Justificar — confirmar membro, escrever período + motivo, rever e confirmar
// ==========================================================================

async function runFileJustification(interaction: ButtonInteraction, guild: Guild, type: JustificationType): Promise<void> {
  const config = justificationSettingsStore.getSettings(guild.id)
  const logChannelId = type === 'fixed' ? config.fixedLogChannelId : config.dailyLogChannelId
  if (!logChannelId) {
    await interaction.reply({
      content: '❌ O canal de log de justificativas ainda não foi configurado na aplicação. Avisa um administrador.',
      ephemeral: true,
    })
    return
  }

  const typeLabel = type === 'fixed' ? 'Fixa' : 'Diária'
  // O label de um TextInput da Discord tem um limite rígido de 45 caracteres — ultrapassá-lo faz
  // showModal() rebentar (interação nunca é reconhecida, o assistente falha sem aviso nenhum). Por
  // isso o exemplo detalhado fica só no placeholder (limite de 100), nunca no label.
  const periodoLabel = type === 'fixed' ? 'Dias da semana e horário' : 'Horário de hoje'
  const periodoPlaceholder = type === 'fixed' ? 'Segunda à sexta - 14:00 até 18:00' : '14:00 até 18:00'

  let confirmedSelf = false
  let periodo = ''
  let motivo = ''
  let errorText = ''

  function confirmEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📝 Justificativa ${typeLabel}`)
      .setDescription('Confirma que a justificativa é para ti — escolhe o teu próprio utilizador na lista abaixo.')
      .setFooter({ text: 'Só tu consegues usar estes botões.' })
  }

  function confirmRows(): [ActionRowBuilder<UserSelectMenuBuilder>, ActionRowBuilder<ButtonBuilder>] {
    return [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder().setCustomId('jwizard:pick').setPlaceholder('Escolhe-te a ti próprio(a)').setMinValues(1).setMaxValues(1),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('jwizard:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
      ),
    ]
  }

  function detailsEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📝 Justificativa ${typeLabel}`)
      .setDescription('Clica em **Escrever justificativa** e preenche o período e o motivo.')
  }

  function detailsRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('jwizard:write').setLabel('Escrever justificativa').setStyle(ButtonStyle.Primary).setEmoji('📝'),
      new ButtonBuilder().setCustomId('jwizard:back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
      new ButtonBuilder().setCustomId('jwizard:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )
  }

  function reviewEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x3ba55c)
      .setTitle(`📋 Revê a tua justificativa ${typeLabel}`)
      .addFields({ name: 'Período', value: periodo }, { name: 'Motivo', value: motivo })
      .setFooter({ text: 'Confirma para publicar aqui no canal, com o teu nome — os administradores também são avisados.' })
  }

  function reviewRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('jwizard:confirm').setLabel('Confirmar e enviar').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId('jwizard:back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
      new ButtonBuilder().setCustomId('jwizard:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )
  }

  function errorEmbed(): EmbedBuilder {
    return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Não consegui perceber').setDescription(errorText)
  }

  function errorRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('jwizard:back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
      new ButtonBuilder().setCustomId('jwizard:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )
  }

  const reply = await interaction.reply({ embeds: [confirmEmbed()], components: confirmRows(), ephemeral: true, withResponse: true })
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

      if (click.customId === 'jwizard:cancel') {
        try {
          await click.update({ embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle('Cancelado').setDescription('Justificativa cancelada.')], components: [] })
          await deleteAfter(CANCEL_DISPLAY_MS)
        } catch (err) {
          console.error('[justifications] Erro ao cancelar:', err)
        }
        return
      }

      if (click.isUserSelectMenu() && click.customId === 'jwizard:pick') {
        try {
          const selected = click.users.first()
          if (!selected || selected.id !== interaction.user.id) {
            errorText = 'Só podes justificar-te a ti próprio(a) — escolhe o teu próprio utilizador na lista.'
            await click.update({ embeds: [confirmEmbed(), errorEmbed()], components: confirmRows() })
            await loop(msg)
            return
          }
          confirmedSelf = true
          await click.update({ embeds: [detailsEmbed()], components: [detailsRow()] })
          await loop(msg)
        } catch (err) {
          console.error('[justifications] Erro ao confirmar membro:', err)
          errorText = `Ocorreu um erro ao confirmar o membro.\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``
          await interaction.editReply({ embeds: [errorEmbed()], components: [errorRow()] }).catch(() => undefined)
          await loop(msg)
        }
        return
      }

      if (click.customId === 'jwizard:back') {
        try {
          if (periodo || motivo) {
            // já passou pelos detalhes — volta para lá, não para a confirmação do membro
            periodo = ''
            motivo = ''
            await click.update({ embeds: [detailsEmbed()], components: [detailsRow()] })
          } else {
            confirmedSelf = false
            await click.update({ embeds: [confirmEmbed()], components: confirmRows() })
          }
          await loop(msg)
        } catch (err) {
          console.error('[justifications] Erro ao voltar:', err)
        }
        return
      }

      if (click.customId === 'jwizard:write' && confirmedSelf) {
        try {
          const modal = new ModalBuilder()
            .setCustomId('jwizard:modal')
            .setTitle(`Justificativa ${typeLabel}`)
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('periodo')
                  .setLabel(periodoLabel)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(200)
                  .setPlaceholder(periodoPlaceholder),
              ),
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('motivo')
                  .setLabel('Motivo')
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(true)
                  .setMaxLength(1000)
                  .setPlaceholder('Explica o motivo da tua justificativa'),
              ),
            )
          await click.showModal(modal)
        } catch (err) {
          console.error('[justifications] Erro ao abrir o formulário de justificativa:', err)
          errorText = `Não consegui abrir o formulário.\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``
          await interaction.editReply({ embeds: [errorEmbed()], components: [errorRow()] }).catch(() => undefined)
          await loop(msg)
          return
        }

        let submitted: ModalSubmitInteraction
        try {
          submitted = await click.awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })
        } catch (err) {
          if (!isCollectorTimeout(err)) console.error('[justifications] Erro a aguardar o formulário:', err)
          await interaction.editReply({ embeds: [detailsEmbed()], components: [detailsRow()] }).catch(() => undefined)
          await loop(msg)
          return
        }

        try {
          const periodoInput = submitted.fields.getTextInputValue('periodo').trim()
          const motivoInput = submitted.fields.getTextInputValue('motivo').trim()

          if (periodoInput === '' || motivoInput === '') {
            errorText = 'Preenche o período e o motivo — nenhum dos dois pode ficar em branco.'
            await updateFromModal(submitted, interaction, { embeds: [errorEmbed()], components: [errorRow()] })
            await loop(msg)
            return
          }

          periodo = periodoInput
          motivo = motivoInput
          await updateFromModal(submitted, interaction, { embeds: [reviewEmbed()], components: [reviewRow()] })
          await loop(msg)
        } catch (err) {
          console.error('[justifications] Erro ao processar o formulário:', err)
          errorText = `Ocorreu um erro inesperado. Tenta novamente.\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``
          await updateFromModal(submitted, interaction, { embeds: [errorEmbed()], components: [errorRow()] }).catch(() => undefined)
          await loop(msg)
        }
        return
      }

      if (click.customId === 'jwizard:confirm' && periodo && motivo) {
        try {
          await click.update({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('⏳ A enviar…')], components: [] })

          // A justificativa em si é publicada no PRÓPRIO canal onde o botão foi clicado (o canal de
          // justificativas configurado na app) — o canal de log é só um alarme para os administradores
          // verem, com um link direto para a mensagem publicada, nunca o único sítio onde ela aparece.
          const postChannel = await guild.channels.fetch(interaction.channelId).catch(() => null)
          if (!postChannel || !postChannel.isTextBased() || postChannel instanceof PartialGroupDMChannel) {
            throw new Error('Não encontrei este canal — avisa um administrador.')
          }

          const logChannel = await guild.channels.fetch(logChannelId as string).catch(() => null)
          if (!logChannel || !logChannel.isTextBased() || logChannel instanceof PartialGroupDMChannel) {
            throw new Error('Não encontrei o canal de log configurado — avisa um administrador.')
          }

          const finalEmbed = new EmbedBuilder()
            .setColor(type === 'fixed' ? 0xf0b232 : 0x5865f2)
            .setTitle(type === 'fixed' ? '📌 Justificativa Fixa' : '📅 Justificativa Diária')
            .addFields(
              { name: 'Membro', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Período', value: periodo, inline: true },
              { name: 'Motivo', value: motivo },
            )
            .setFooter({ text: `Justificado por ${interaction.user.tag}` })
            .setTimestamp(new Date())

          const posted = await postChannel.send({ embeds: [finalEmbed] })

          const alertEmbed = new EmbedBuilder()
            .setColor(type === 'fixed' ? 0xf0b232 : 0x5865f2)
            .setTitle(`🔔 Nova justificativa ${typeLabel}`)
            .setDescription(`<@${interaction.user.id}> justificou-se em <#${postChannel.id}>.\n[Ver a justificativa](${posted.url})`)
            .addFields({ name: 'Período', value: periodo, inline: true }, { name: 'Motivo', value: motivo })
            .setFooter({ text: `Justificado por ${interaction.user.tag}` })
            .setTimestamp(new Date())
          await logChannel.send({ embeds: [alertEmbed] })

          await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0x3ba55c).setTitle('✅ Justificativa enviada').setDescription(`A tua justificativa ${typeLabel.toLowerCase()} foi publicada aqui no canal.`)],
            components: [],
          })
          await deleteAfter(RESULT_DISPLAY_MS)
        } catch (err) {
          console.error('[justifications] Erro ao publicar a justificativa:', err)
          errorText = `Não consegui enviar a tua justificativa.\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``
          await interaction.editReply({ embeds: [errorEmbed()], components: [errorRow()] }).catch(() => undefined)
          await loop(msg)
        }
        return
      }

      await loop(msg)
    } catch (err) {
      // Só é um "tempo esgotado" de verdade quando o collector rejeita por não ter recebido nenhuma
      // interação — qualquer outro erro chegar aqui é um bug real que passou por todos os catches
      // internos, e antes ficava completamente invisível (mesmo nos logs). Agora fica sempre registado.
      if (!isCollectorTimeout(err)) console.error('[justifications] Erro inesperado no assistente de justificativa:', err)
      await interaction
        .editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('⏱️ Tempo esgotado').setDescription('Justificativa cancelada.')], components: [] })
        .catch(() => undefined)
      await interaction.deleteReply().catch(() => undefined)
    }
  }
}

// ==========================================================================
// Remover justificativa — pede o motivo e avisa o canal de log para um admin rever
// ==========================================================================

async function runRemoveJustification(interaction: ButtonInteraction, guild: Guild, type: JustificationType): Promise<void> {
  const config = justificationSettingsStore.getSettings(guild.id)
  const logChannelId = type === 'fixed' ? config.fixedLogChannelId : config.dailyLogChannelId
  if (!logChannelId) {
    await interaction.reply({
      content: '❌ O canal de log de justificativas ainda não foi configurado na aplicação. Avisa um administrador.',
      ephemeral: true,
    })
    return
  }

  try {
    const modal = new ModalBuilder()
      .setCustomId('jwizard:removeModal')
      .setTitle('Remover justificativa')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('motivo')
            .setLabel('Motivo da remoção')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
            .setPlaceholder('Explica porque queres remover — um admin vai rever e remover manualmente.'),
        ),
      )
    await interaction.showModal(modal)
  } catch (err) {
    console.error('[justifications] Erro ao abrir o formulário de remoção:', err)
    await interaction
      .reply({ content: `❌ Não consegui abrir o formulário de remoção.\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``, ephemeral: true })
      .catch(() => undefined)
    return
  }

  let submitted: ModalSubmitInteraction
  try {
    submitted = await interaction.awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })
  } catch (err) {
    if (!isCollectorTimeout(err)) console.error('[justifications] Erro a aguardar o formulário de remoção:', err)
    return
  }

  try {
    const motivo = submitted.fields.getTextInputValue('motivo').trim()
    if (motivo === '') {
      await submitted.reply({ content: '❌ Escreve um motivo para a remoção — clica em **Remover Justificativa** outra vez.', ephemeral: true })
      return
    }

    const channel = await guild.channels.fetch(logChannelId).catch(() => null)
    if (!channel || !channel.isTextBased() || channel instanceof PartialGroupDMChannel) {
      await submitted.reply({ content: '❌ Não encontrei o canal de log configurado. Avisa um administrador.', ephemeral: true })
      return
    }

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('⚠️ Pedido de remoção de justificativa')
      .setDescription(
        `<@${interaction.user.id}> pediu para remover uma justificativa **${type === 'fixed' ? 'fixa' : 'diária'}**.\n\n**Motivo:**\n${motivo}`,
      )
      .setFooter({ text: `Pedido por ${interaction.user.tag} — um administrador precisa de rever e remover manualmente` })
      .setTimestamp(new Date())
    await channel.send({ embeds: [embed] })

    await submitted.reply({
      content: '✅ O teu pedido de remoção foi enviado ao canal de log. Um administrador vai rever e remover manualmente.',
      ephemeral: true,
    })
  } catch (err) {
    console.error('[justifications] Erro ao processar o pedido de remoção:', err)
    await submitted
      .reply({ content: `❌ Ocorreu um erro ao enviar o pedido: ${err instanceof Error ? err.message : 'erro desconhecido'}`, ephemeral: true })
      .catch(() => undefined)
  }
}

// ==========================================================================
// Auxiliares
// ==========================================================================

/** Distingue um `awaitMessageComponent`/`awaitModalSubmit` que expirou de verdade (ninguém clicou/submeteu a tempo) de qualquer outro erro — só o primeiro é esperado e não precisa de ser registado. */
function isCollectorTimeout(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'InteractionCollectorError'
}

/** `ModalSubmitInteraction.update()` só existe quando a modal foi aberta a partir de um componente de mensagem — o que é sempre o nosso caso, mas o TS só o sabe depois deste type guard. */
async function updateFromModal(
  submitted: ModalSubmitInteraction,
  parent: ButtonInteraction,
  payload: MessageEditOptions,
): Promise<void> {
  if (submitted.isFromMessage()) {
    await submitted.update(payload)
  } else {
    await parent.editReply(payload)
  }
}
