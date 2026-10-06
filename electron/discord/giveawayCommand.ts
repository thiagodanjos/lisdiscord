import {
  ActionRowBuilder,
  type ButtonBuilder,
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
import { parseDurationMs } from '../../shared/duration'
import type { CustomButton } from '../../shared/types'
import { getGiveawaySettings } from '../store/giveaways'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { customButton } from './profileCommand'
import { createAndPostGiveaway } from './giveaways'

type WizardTemplate = 'giveawayWizardChannel' | 'giveawayWizardDetails' | 'giveawayWizardError' | 'giveawayWizardCreated' | 'giveawayWizardCancelled' | 'giveawayWizardTimeout' | 'giveawayWizardCreating'

export { handleGiveawayButtons } from './giveaways'

const SETUP_TIMEOUT_MS = 10 * 60_000
const MODAL_TIMEOUT_MS = 120_000
const RESULT_DISPLAY_MS = 8_000
const CANCEL_DISPLAY_MS = 2_500
const MIN_DURATION_MS = 30_000
const MAX_DURATION_MS = 30 * 24 * 60 * 60_000

export function sorteioCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('sorteio')
    .setDescription('Cria um sorteio neste servidor (com as mensagens e botões da app)')
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
  const settings = getGiveawaySettings(guild.id)
  const w = settings.wizard
  let channelId: string | null = null
  let errorText = ''
  /** Se a Discord recusar um emoji dos botões, o resto do assistente segue sem emojis. */
  let withEmoji = true

  const values = (extra: Record<string, string> = {}) => ({
    canal: channelId ? `<#${channelId}>` : '—',
    membro: `<@${interaction.user.id}>`,
    servidor: guild.name,
    erro: errorText,
    ...extra,
  })
  const embed = (kind: WizardTemplate, extra: Record<string, string> = {}, fallback = '🎉 Novo sorteio') => {
    const e = buildEmbedFromDraft(getTemplate(guild.id, kind), values(extra))
    return embedHasContent(e) ? e : new EmbedBuilder().setDescription(fallback)
  }
  const button = (id: string, b: CustomButton, fallback: string) => customButton(id, b, fallback, withEmoji)
  const cancelButton = () => button('sorteio:cancel', w.cancelButton, 'Cancelar')
  const backButtons = (): ButtonBuilder[] => (w.backButton.show ? [button('sorteio:back', w.backButton, 'Voltar')] : [])

  function channelRows(): [ActionRowBuilder<ChannelSelectMenuBuilder>, ActionRowBuilder<ButtonBuilder>] {
    return [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('sorteio:channel')
          .setPlaceholder((w.selectPlaceholder || 'Escolhe um canal').slice(0, 150))
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(1)
          .setMaxValues(1),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(cancelButton()),
    ]
  }
  const channelStep = () => ({ embeds: [embed('giveawayWizardChannel', {}, 'Escolhe o canal onde o sorteio vai ser publicado:')], components: channelRows() })
  const detailsStep = () => ({
    embeds: [embed('giveawayWizardDetails', {}, `Canal escolhido: ${values().canal}`)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button('sorteio:write', w.writeButton, 'Escrever detalhes'), ...backButtons(), cancelButton())],
  })
  const errorStep = () => ({
    embeds: [embed('giveawayWizardError', {}, `❌ ${errorText}`)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...(w.backButton.show ? backButtons() : [button('sorteio:write', w.writeButton, 'Escrever detalhes')]), cancelButton())],
  })

  /** Corre de novo sem emojis se a Discord recusar um (ex.: emoji de outro servidor). */
  async function retry<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (err) {
      if (!withEmoji || !/emoji/i.test(err instanceof Error ? err.message : String(err))) throw err
      withEmoji = false
      return run()
    }
  }

  const reply = await retry(() => interaction.reply({ ...channelStep(), ephemeral: true, withResponse: true }))
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
        await click.update({ embeds: [embed('giveawayWizardCancelled', {}, 'Criação de sorteio cancelada.')], components: [] })
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
        await retry(() => click.update(detailsStep()))
        await loop(msg)
        return
      }

      if (click.customId === 'sorteio:back') {
        channelId = null
        await retry(() => click.update(channelStep()))
        await loop(msg)
        return
      }

      if (click.customId === 'sorteio:write') {
        const field = (id: string, label: string, fallbackLabel: string, placeholder: string, style: TextInputStyle, required: boolean, max?: number) => {
          const input = new TextInputBuilder()
            .setCustomId(id)
            .setLabel((label || fallbackLabel).slice(0, 45))
            .setStyle(style)
            .setRequired(required)
          if (placeholder) input.setPlaceholder(placeholder.slice(0, 100))
          if (max) input.setMaxLength(max)
          return new ActionRowBuilder<TextInputBuilder>().addComponents(input)
        }
        const modal = new ModalBuilder()
          .setCustomId('sorteio:modal')
          .setTitle((w.modalTitle || 'Detalhes do sorteio').slice(0, 45))
          .addComponents(
            field('titulo', w.prizeLabel, 'Título / prémio', w.prizePlaceholder, TextInputStyle.Short, true, 200),
            field('duracao', w.durationLabel, 'Duração', w.durationPlaceholder, TextInputStyle.Short, true),
            field('descricao', w.descriptionLabel, 'Descrição (opcional)', w.descriptionPlaceholder, TextInputStyle.Paragraph, false, 1500),
            field('vencedores', w.winnersLabel, 'Número de vencedores', w.winnersPlaceholder, TextInputStyle.Short, false),
          )
        await click.showModal(modal)

        let submitted
        try {
          submitted = await click.awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (i) => i.user.id === interaction.user.id })
        } catch {
          // modal fechada sem submeter — mantém-se no passo dos detalhes
          await retry(() => interaction.editReply(detailsStep()))
          await loop(msg)
          return
        }

        try {
          const titleInput = submitted.fields.getTextInputValue('titulo').trim()
          const durationInput = submitted.fields.getTextInputValue('duracao').trim()
          const winnersInput = submitted.fields.getTextInputValue('vencedores').trim()
          const descriptionInput = submitted.fields.getTextInputValue('descricao').trim()

          const parsedDuration = parseDuration(durationInput)
          const parsedWinners = winnersInput === '' ? 1 : parseNonNegativeInt(winnersInput)
          const fail = async (text: string) => {
            errorText = text
            await retry(() => updateFromModal(submitted, interaction, errorStep()))
            await loop(msg)
          }

          if (titleInput === '') return await fail(w.errorPrize)
          if (parsedDuration === null) return await fail(w.errorDuration)
          if (parsedWinners === null || parsedWinners < 1 || parsedWinners > 50) return await fail(w.errorWinners)

          await updateFromModal(submitted, interaction, { embeds: [embed('giveawayWizardCreating', { premio: titleInput, vencedores: String(parsedWinners) }, '⏳ A criar sorteio…')], components: [] })

          const created = await createAndPostGiveaway(guild, {
            channelId: channelId as string,
            prize: titleInput,
            description: descriptionInput,
            durationMs: parsedDuration,
            winnerCount: parsedWinners,
            hostTag: `<@${interaction.user.id}>`,
          })
          const unix = Math.floor(new Date(created.endsAt).getTime() / 1000)
          const link = created.messageId ? `https://discord.com/channels/${guild.id}/${created.channelId}/${created.messageId}` : 'https://discord.com'
          await interaction.editReply({
            embeds: [embed('giveawayWizardCreated', { premio: titleInput, vencedores: String(parsedWinners), termina: `<t:${unix}:R>`, link }, `✅ **${titleInput}** publicado em ${values().canal}.`)],
            components: [],
          })
          await deleteAfter(RESULT_DISPLAY_MS)
        } catch (err) {
          errorText = err instanceof Error && err.message ? err.message : 'Ocorreu um erro inesperado ao criar o sorteio. Tenta novamente.'
          await retry(() => interaction.editReply(errorStep())).catch(() => undefined)
          await loop(msg)
        }
        return
      }

      await loop(msg)
    } catch {
      await interaction.editReply({ embeds: [embed('giveawayWizardTimeout', {}, '⏱️ Tempo esgotado.')], components: [] }).catch(() => undefined)
      await interaction.deleteReply().catch(() => undefined)
    }
  }
}

// ==========================================================================
// Auxiliares
// ==========================================================================

function parseDuration(raw: string): number | null {
  const ms = parseDurationMs(raw)
  if (ms === null || ms < MIN_DURATION_MS || ms > MAX_DURATION_MS) return null
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
