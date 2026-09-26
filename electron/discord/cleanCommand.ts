import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type GuildTextBasedChannel,
  InteractionContextType,
  type Message,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from 'discord.js'
import * as cleanLog from '../store/cleanLog'

const MAX_AMOUNT = 1000
const CONFIRM_ABOVE = 100
/** A Discord só deixa apagar em massa mensagens com menos de 14 dias — um minuto de margem. */
const BULK_DELETE_MAX_AGE_MS = 14 * 86_400_000 - 60_000
/** Com filtro de membro, até onde recuar no histórico à procura de mensagens dele. */
const MAX_SCAN_WITH_FILTER = 5000
const NOTICE_MS = 5000

export function cleanCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('limparcdo')
    .setDescription('Apaga mensagens deste canal (só administração)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) =>
      o.setName('quantidade').setDescription(`Quantas mensagens apagar (1 a ${MAX_AMOUNT})`).setRequired(true).setMinValue(1).setMaxValue(MAX_AMOUNT),
    )
    .addUserOption((o) => o.setName('membro').setDescription('Apagar só as mensagens desta pessoa (opcional)').setRequired(false))
    .addChannelOption((o) =>
      o
        .setName('canal')
        .setDescription('Outro canal onde limpar (por omissão, este)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.PublicThread, ChannelType.PrivateThread),
    )
    .toJSON()
}

export async function handleCleanCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'limparcdo') return false

  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este comando só funciona dentro de um servidor.', ephemeral: true })
    return true
  }
  // O Discord já esconde o comando a quem não é administrador, mas um servidor pode mudar isso em
  // Integrações — esta verificação garante que só administração consegue mesmo apagar.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ embeds: [errorEmbed('Só membros com permissão de **Administrador** podem usar o /limparcdo.')], ephemeral: true })
    return true
  }

  const amount = interaction.options.getInteger('quantidade', true)
  const target = interaction.options.getUser('membro')
  const picked = interaction.options.getChannel('canal')
  const channel = (picked ? await guild.channels.fetch(picked.id).catch(() => null) : interaction.channel) as GuildTextBasedChannel | null

  if (!channel || !channel.isTextBased() || !('bulkDelete' in channel)) {
    await interaction.reply({ embeds: [errorEmbed('Não consigo apagar mensagens nesse canal.')], ephemeral: true })
    return true
  }

  const me = guild.members.me ?? (await guild.members.fetchMe())
  const perms = channel.permissionsFor(me)
  if (!perms?.has([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ViewChannel])) {
    await interaction.reply({
      embeds: [errorEmbed(`O bot precisa das permissões **Gerir mensagens** e **Ler histórico de mensagens** em <#${channel.id}>.`)],
      ephemeral: true,
    })
    return true
  }

  const what = `**${amount}** mensage${amount === 1 ? 'm' : 'ns'}${target ? ` de <@${target.id}>` : ''} em <#${channel.id}>`

  if (amount > CONFIRM_ABOVE) {
    const reply = await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xf5b53d).setTitle('⚠️ Confirmar limpeza').setDescription(`Vais apagar ${what}. Isto não pode ser desfeito.`)],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('limparcdo:confirm').setLabel('Apagar').setEmoji('🧹').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('limparcdo:cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
        ),
      ],
      ephemeral: true,
      withResponse: true,
    })
    const message = reply.resource?.message
    if (!message) return true
    const click = await message.awaitMessageComponent({ time: 30_000, filter: (i) => i.user.id === interaction.user.id }).catch(() => null)
    if (!click || click.customId !== 'limparcdo:confirm') {
      const embed = new EmbedBuilder().setColor(0x99aab5).setDescription(click ? 'Limpeza cancelada — nada foi apagado.' : '⏱️ Tempo esgotado — nada foi apagado.')
      if (click) await click.update({ embeds: [embed], components: [] })
      else await interaction.editReply({ embeds: [embed], components: [] }).catch(() => undefined)
      return true
    }
    await click.update({ embeds: [new EmbedBuilder().setColor(0x22d3ee).setDescription(`🧹 A apagar ${what}…`)], components: [] })
  } else {
    await interaction.deferReply({ ephemeral: true })
  }

  try {
    const result = await purge(channel, amount, target?.id ?? null)
    // As mensagens já foram apagadas — uma falha a gravar o log não pode fazer a resposta dizer o contrário.
    try {
      cleanLog.logClean({
        guildId: guild.id,
        channelId: channel.id,
        channelName: channel.name,
        actorId: interaction.user.id,
        actorTag: interaction.user.tag,
        requested: amount,
        deleted: result.deleted,
        skippedOld: result.skippedOld,
        targetUserId: target?.id ?? null,
        targetTag: target?.tag ?? null,
      })
    } catch (err) {
      console.error('[limparcdo] Falha ao gravar o log de limpeza:', err)
    }

    const notes: string[] = []
    if (result.skippedOld > 0) notes.push(`⏳ ${result.skippedOld} tinha(m) mais de 14 dias — a Discord não deixa apagá-las em massa.`)
    if (result.deleted < amount && result.skippedOld === 0) notes.push('ℹ️ Não havia mais mensagens para apagar.')

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x22e584)
          .setTitle('🧹 Limpeza concluída')
          .setDescription(`**${result.deleted}** mensage${result.deleted === 1 ? 'm apagada' : 'ns apagadas'}${target ? ` de <@${target.id}>` : ''} em <#${channel.id}>.` + (notes.length ? `\n\n${notes.join('\n')}` : ''))
          .setFooter({ text: 'Fica registado em Logs de limpeza, na app' }),
      ],
      components: [],
    })

    if (result.deleted > 0) {
      const notice = await channel
        .send({ embeds: [new EmbedBuilder().setColor(0x22e584).setDescription(`🧹 **${result.deleted}** mensage${result.deleted === 1 ? 'm apagada' : 'ns apagadas'} por <@${interaction.user.id}>.`)] })
        .catch(() => null)
      if (notice) setTimeout(() => notice.delete().catch(() => undefined), NOTICE_MS)
    }
  } catch (err) {
    console.error('[limparcdo] Erro:', err)
    await interaction.editReply({ embeds: [errorEmbed(`Não consegui apagar as mensagens.\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``)], components: [] }).catch(() => undefined)
  }
  return true
}

async function purge(channel: GuildTextBasedChannel, amount: number, targetId: string | null): Promise<{ deleted: number; skippedOld: number }> {
  if (!('bulkDelete' in channel)) throw new Error('Este canal não suporta apagar em massa.')
  const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS
  const maxScan = targetId ? MAX_SCAN_WITH_FILTER : amount + 200
  let before: string | undefined
  let scanned = 0
  let deleted = 0
  let skippedOld = 0

  while (deleted < amount && scanned < maxScan) {
    const batch = await channel.messages.fetch({ limit: 100, before })
    if (batch.size === 0) break
    scanned += batch.size
    before = batch.last()?.id

    const candidates = [...batch.values()].filter((m: Message) => !m.pinned && (!targetId || m.author.id === targetId))
    const fresh = candidates.filter((m) => m.createdTimestamp > cutoff)
    skippedOld += candidates.length - fresh.length

    const toDelete = fresh.slice(0, amount - deleted)
    if (toDelete.length > 0) {
      const removed = await channel.bulkDelete(toDelete, true)
      deleted += removed.size
    }
    // As mensagens vêm da mais recente para a mais antiga — a partir daqui já são todas antigas demais.
    if ((batch.last()?.createdTimestamp ?? 0) <= cutoff) break
  }
  // Só conta como "ignorada" o que faltava para chegar à quantidade pedida.
  return { deleted, skippedOld: Math.min(skippedOld, amount - deleted) }
}

function errorEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xf43f5e).setTitle('❌ Não foi possível limpar').setDescription(text)
}
