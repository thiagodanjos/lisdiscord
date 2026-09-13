import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Guild,
  type Message,
  type MessageEditOptions,
  ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import * as giveawaysStore from '../store/giveaways'
import { postGiveawayMessage } from './giveaways'

const SETUP_TIMEOUT_MS = 10 * 60_000
const MODAL_TIMEOUT_MS = 120_000
const RESULT_DISPLAY_MS = 8_000
const CANCEL_DISPLAY_MS = 2_500
const MIN_DURATION_MS = 30_000
const MAX_DURATION_MS = 30 * 24 * 60 * 60_000

export function sorteioCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('sorteio')
    .setDescription('Cria um sorteio interativo por reações neste servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON()
}

export async function handleGiveawayCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'sorteio') return false

  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este comando só funciona dentro de um servidor.', ephemeral: true })
    return true
  }

  await runSorteio(interaction, guild)
  return true
}

// ==========================================================================
// /sorteio — assistente por seletor de canal + modal
// ==========================================================================

async function runSorteio(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  let channelId: string | null = null
  let channelName: string | null = null
  let errorText = ''

  function channelEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎉 Novo sorteio')
      .setDescription('Escolhe o canal onde o sorteio vai ser publicado:')
      .setFooter({ text: 'Só tu consegues usar isto.' })
  }

  function channelRows(): [ActionRowBuilder<ChannelSelectMenuBuilder>, ActionRowBuilder<ButtonBuilder>] {
    return [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('sorteio:channel')
          .setPlaceholder('Escolhe um canal')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(1)
          .setMaxValues(1),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('sorteio:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
      ),
    ]
  }

  function detailsEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎉 Novo sorteio')
      .setDescription(
        `Canal escolhido: **#${channelName}**\n\nClica em **Escrever detalhes** para indicares o título/prémio, a duração exata e o número de vencedores.`,
      )
  }

  function detailsRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sorteio:write').setLabel('Escrever detalhes').setStyle(ButtonStyle.Primary).setEmoji('📝'),
      new ButtonBuilder().setCustomId('sorteio:back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
      new ButtonBuilder().setCustomId('sorteio:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )
  }

  function errorEmbed(): EmbedBuilder {
    return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Não consegui criar o sorteio').setDescription(errorText)
  }

  function errorRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sorteio:back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
      new ButtonBuilder().setCustomId('sorteio:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )
  }

  const reply = await interaction.reply({ embeds: [channelEmbed()], components: channelRows(), ephemeral: true, withResponse: true })
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

      if (click.customId === 'sorteio:cancel') {
        await click.update({
          embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle('Cancelado').setDescription('Criação de sorteio cancelada.')],
          components: [],
        })
        await deleteAfter(CANCEL_DISPLAY_MS)
        return
      }

      if (click.isChannelSelectMenu() && click.customId === 'sorteio:channel') {
        const channel = click.channels.first()
        if (!channel) {
          await loop(msg)
          return
        }
        channelId = channel.id
        channelName = 'name' in channel && channel.name ? channel.name : 'canal'
        await click.update({ embeds: [detailsEmbed()], components: [detailsRow()] })
        await loop(msg)
        return
      }

      if (click.customId === 'sorteio:back') {
        channelId = null
        channelName = null
        await click.update({ embeds: [channelEmbed()], components: channelRows() })
        await loop(msg)
        return
      }

      if (click.customId === 'sorteio:write') {
        const modal = new ModalBuilder()
          .setCustomId('sorteio:modal')
          .setTitle('Detalhes do sorteio')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('titulo')
                .setLabel('Título / prémio')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(200)
                .setPlaceholder('Ex: Nitro de 1 mês'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('duracao')
                .setLabel('Duração exata (ex: 1h30m, 2d, 45m, 30s)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('1h30m'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('vencedores')
                .setLabel('Número de vencedores (padrão: 1)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setPlaceholder('1'),
            ),
          )
        await click.showModal(modal)

        let submitted
        try {
          submitted = await click.awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })
        } catch {
          // modal fechada sem submeter — mantém-se no passo dos detalhes
          await interaction.editReply({ embeds: [detailsEmbed()], components: [detailsRow()] })
          await loop(msg)
          return
        }

        try {
          const titleInput = submitted.fields.getTextInputValue('titulo').trim()
          const durationInput = submitted.fields.getTextInputValue('duracao').trim()
          const winnersInput = submitted.fields.getTextInputValue('vencedores').trim()

          const parsedDuration = parseDuration(durationInput)
          const parsedWinners = winnersInput === '' ? 1 : parseNonNegativeInt(winnersInput)

          if (titleInput === '') {
            errorText = 'Escreve um título/prémio para o sorteio.'
            await updateFromModal(submitted, interaction, { embeds: [errorEmbed()], components: [errorRow()] })
            await loop(msg)
            return
          }

          if (parsedDuration === null) {
            errorText = 'Duração inválida. Usa um formato como `1h30m`, `2d`, `45m` ou `30s` — entre 30 segundos e 30 dias.'
            await updateFromModal(submitted, interaction, { embeds: [errorEmbed()], components: [errorRow()] })
            await loop(msg)
            return
          }

          if (parsedWinners === null || parsedWinners < 1) {
            errorText = 'O número de vencedores tem de ser 1 ou mais.'
            await updateFromModal(submitted, interaction, { embeds: [errorEmbed()], components: [errorRow()] })
            await loop(msg)
            return
          }

          await updateFromModal(submitted, interaction, {
            embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('⏳ A criar sorteio…')],
            components: [],
          })

          const endsAt = new Date(Date.now() + parsedDuration).toISOString()
          const messageId = await postGiveawayMessage(guild, channelId as string, titleInput, endsAt, parsedWinners)
          giveawaysStore.createGiveaway({
            guildId: guild.id,
            guildName: guild.name,
            channelId: channelId as string,
            channelName: channelName ?? 'canal',
            messageId,
            prize: titleInput,
            winnerCount: parsedWinners,
            endsAt,
          })

          const resultEmbed = new EmbedBuilder()
            .setColor(0x3ba55c)
            .setTitle('✅ Sorteio criado')
            .setDescription(
              `**${titleInput}** foi publicado em <#${channelId}>.\n**Vencedores:** ${parsedWinners}\n**Termina:** <t:${Math.floor(new Date(endsAt).getTime() / 1000)}:R>`,
            )
          await interaction.editReply({ embeds: [resultEmbed], components: [] })
          await deleteAfter(RESULT_DISPLAY_MS)
        } catch (err) {
          errorText = err instanceof Error && err.message ? err.message : 'Ocorreu um erro inesperado ao criar o sorteio. Tenta novamente.'
          await interaction.editReply({ embeds: [errorEmbed()], components: [errorRow()] }).catch(() => undefined)
          await loop(msg)
        }
        return
      }

      await loop(msg)
    } catch {
      await interaction
        .editReply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('⏱️ Tempo esgotado').setDescription('Criação de sorteio cancelada.')],
          components: [],
        })
        .catch(() => undefined)
      await interaction.deleteReply().catch(() => undefined)
    }
  }
}

// ==========================================================================
// Auxiliares
// ==========================================================================

function parseDuration(raw: string): number | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (normalized === '') return null

  const match = normalized.match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!match) return null

  const [, d, h, m, s] = match
  if (!d && !h && !m && !s) return null

  const totalSeconds = Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3_600 + Number(m ?? 0) * 60 + Number(s ?? 0)
  const ms = totalSeconds * 1000
  if (ms < MIN_DURATION_MS || ms > MAX_DURATION_MS) return null
  return ms
}

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  return Number(trimmed)
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
