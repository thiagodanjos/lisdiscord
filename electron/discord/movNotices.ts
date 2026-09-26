import {
  ActionRowBuilder,
  type ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  type Client,
  EmbedBuilder,
  type Guild,
  ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  time,
  TimestampStyles,
} from 'discord.js'
import type { MovNotice, MovNoticeInput, MovNoticeRepeat } from '../../shared/types'
import { parseDurationMs } from '../../shared/duration'
import * as store from '../store/movNotices'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'

const MIN_DELAY_MS = 60_000
const MAX_DELAY_MS = 60 * 86_400_000
const MAX_PENDING_PER_GUILD = 50
const TICK_MS = 20_000
const MAX_MESSAGE = 2000

const REPEAT_LABEL: Record<MovNoticeRepeat, string> = { none: 'Não', daily: 'Todos os dias', weekly: 'Todas as semanas' }

export function avisoMovCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('avisomov')
    .setDescription('Agenda um aviso para um canal — o bot publica-o na hora certa, com o embed personalizado na app')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) =>
      o.setName('canal').setDescription('Onde o aviso vai ser publicado').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((o) => o.setName('tempo').setDescription('Daqui a quanto tempo — ex.: 30m, 2h, 1h30m, 1d').setRequired(true).setMaxLength(20))
    .addStringOption((o) =>
      o.setName('mensagem').setDescription('O texto do aviso (deixa vazio para escrever com várias linhas numa janela)').setMaxLength(MAX_MESSAGE),
    )
    .addRoleOption((o) => o.setName('marcar').setDescription('Cargo a marcar junto com o aviso (opcional)'))
    .addStringOption((o) =>
      o
        .setName('repetir')
        .setDescription('Repetir o aviso automaticamente')
        .addChoices({ name: 'Não repetir', value: 'none' }, { name: 'Todos os dias', value: 'daily' }, { name: 'Todas as semanas', value: 'weekly' }),
    )
    .toJSON()
}

/** Troca o `\n` escrito à mão (as opções de texto dos comandos não aceitam Enter) por uma quebra de linha real. */
export function normalizeNoticeText(raw: string): string {
  return raw.replace(/\\n/g, '\n').trim().slice(0, MAX_MESSAGE)
}

export async function handleAvisoMovCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'avisomov') return false
  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este comando só funciona dentro de um servidor.', ephemeral: true })
    return true
  }

  const channel = interaction.options.getChannel('canal', true)
  const rawTime = interaction.options.getString('tempo', true)
  const role = interaction.options.getRole('marcar')
  const repeat = (interaction.options.getString('repetir') ?? 'none') as MovNoticeRepeat
  let message = interaction.options.getString('mensagem') ?? ''

  const delay = parseDurationMs(rawTime)
  if (delay === null || delay < MIN_DELAY_MS || delay > MAX_DELAY_MS) {
    await interaction.reply({ content: '❌ Tempo inválido. Usa algo como `30m`, `2h`, `1h30m` ou `3d` (entre 1 minuto e 60 dias).', ephemeral: true })
    return true
  }

  let replyTo: ChatInputCommandInteraction | ModalSubmitInteraction = interaction
  if (!message.trim()) {
    const modalId = `avisomov:modal:${interaction.id}`
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('Escrever o aviso')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('mensagem')
              .setLabel('Mensagem do aviso')
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(MAX_MESSAGE)
              .setPlaceholder('Ex.: Mov Call hoje às 21h! Todos na call de eventos 🎉')
              .setRequired(true),
          ),
        ),
    )
    const submit = await interaction.awaitModalSubmit({ time: 10 * 60_000, filter: (i) => i.customId === modalId }).catch(() => null)
    if (!submit) return true
    message = submit.fields.getTextInputValue('mensagem')
    replyTo = submit
  }

  try {
    const notice = await createNotice(
      guild,
      { channelId: channel.id, message, mentionRoleId: role?.id ?? null, repeat, dueAt: new Date(Date.now() + delay).toISOString() },
      { id: interaction.user.id, tag: interaction.user.tag, avatar: interaction.user.displayAvatarURL({ size: 128 }) },
      'discord',
    )
    const due = new Date(notice.dueAt)
    const info = new EmbedBuilder()
      .setColor(0x22e584)
      .setTitle('✅ Aviso agendado')
      .setDescription(
        [
          `**Canal:** <#${notice.channelId}>`,
          `**Quando:** ${time(due, TimestampStyles.LongDateTime)} (${time(due, TimestampStyles.RelativeTime)})`,
          `**Repetir:** ${REPEAT_LABEL[notice.repeat]}`,
          notice.mentionRoleId ? `**Marca:** <@&${notice.mentionRoleId}>` : null,
          '',
          'Assim vai ficar a mensagem 👇 — podes mudar o visual na app, em **Avisos MOV**.',
        ]
          .filter((l) => l !== null)
          .join('\n'),
      )
      .setFooter({ text: `ID do aviso: ${notice.id}` })
    const preview = buildNoticeEmbed(guild, notice)
    const cancel = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`avisomov:cancel:${notice.id}`).setLabel('Cancelar aviso').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    )
    await replyTo.reply({ embeds: [info, preview], components: [cancel], ephemeral: true, allowedMentions: { parse: [] } })
  } catch (err) {
    await replyTo.reply({ content: `❌ ${err instanceof Error ? err.message : String(err)}`, ephemeral: true })
  }
  return true
}

/** Botão "Cancelar aviso" da confirmação — funciona mesmo depois de o bot reiniciar (o id vai no customId). */
export async function handleAvisoMovButtons(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('avisomov:cancel:')) return false
  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ Só gestores podem cancelar avisos.', ephemeral: true })
    return true
  }
  const cancelled = store.cancelNotice(interaction.guild.id, interaction.customId.split(':')[2])
  await interaction.update({
    content: cancelled ? '🗑️ Aviso cancelado — já não vai ser publicado.' : 'ℹ️ Este aviso já foi publicado ou cancelado.',
    embeds: [],
    components: [],
  })
  return true
}

/** Valida e grava um aviso novo — usado pelo comando, pela app e pela API do bot remoto. */
export async function createNotice(
  guild: Guild,
  input: MovNoticeInput,
  author: { id: string; tag: string; avatar: string | null },
  source: MovNotice['source'],
): Promise<MovNotice> {
  const message = normalizeNoticeText(input.message)
  if (!message) throw new Error('O aviso precisa de uma mensagem.')
  const due = new Date(input.dueAt)
  if (Number.isNaN(due.getTime())) throw new Error('Data do aviso inválida.')
  if (due.getTime() < Date.now() - 60_000) throw new Error('A data do aviso já passou.')
  if (due.getTime() > Date.now() + MAX_DELAY_MS) throw new Error('Só dá para agendar avisos até 60 dias à frente.')
  if (store.listNotices(guild.id).filter((n) => n.status === 'pending').length >= MAX_PENDING_PER_GUILD) {
    throw new Error(`Este servidor já tem ${MAX_PENDING_PER_GUILD} avisos pendentes — cancela algum primeiro.`)
  }

  const channel = await guild.channels.fetch(input.channelId).catch(() => null)
  if (!channel || !channel.isTextBased() || channel.isThread()) throw new Error('Canal inválido — escolhe um canal de texto.')
  const me = guild.members.me ?? (await guild.members.fetchMe())
  const perms = channel.permissionsFor(me)
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new Error(`O bot não consegue enviar mensagens com embed em #${channel.name} — dá-lhe as permissões Ver canal, Enviar mensagens e Inserir links.`)
  }

  let roleName: string | null = null
  if (input.mentionRoleId) {
    const role = await guild.roles.fetch(input.mentionRoleId).catch(() => null)
    if (!role) throw new Error('O cargo a marcar já não existe.')
    if (role.id !== guild.id && !role.mentionable && !perms.has(PermissionFlagsBits.MentionEveryone)) {
      throw new Error(`O cargo @${role.name} não é mencionável e o bot não tem "Mencionar @everyone" em #${channel.name} — a marcação não ia funcionar.`)
    }
    if (role.id === guild.id && !perms.has(PermissionFlagsBits.MentionEveryone)) {
      throw new Error(`O bot não tem "Mencionar @everyone" em #${channel.name}.`)
    }
    roleName = role.id === guild.id ? '@everyone' : role.name
  }

  return store.addNotice({
    guildId: guild.id,
    channelId: channel.id,
    channelName: channel.name,
    message,
    mentionRoleId: input.mentionRoleId,
    mentionRoleName: roleName,
    repeat: input.repeat,
    dueAt: due.toISOString(),
    createdById: author.id,
    createdByTag: author.tag,
    createdByAvatar: author.avatar,
    source,
  })
}

function mentionFor(guild: Guild, roleId: string | null): string {
  if (!roleId) return ''
  return roleId === guild.id ? '@everyone' : `<@&${roleId}>`
}

export function buildNoticeEmbed(guild: Guild, notice: MovNotice): EmbedBuilder {
  const embed = buildEmbedFromDraft(getTemplate(guild.id, 'avisoMov'), {
    mensagem: notice.message,
    autor: notice.source === 'app' && notice.createdById === 'app' ? notice.createdByTag : `<@${notice.createdById}>`,
    nomeAutor: notice.createdByTag,
    avatarAutor: notice.createdByAvatar ?? '',
    canal: `<#${notice.channelId}>`,
    cargo: mentionFor(guild, notice.mentionRoleId),
    servidor: guild.name,
  })
  return embedHasContent(embed) ? embed : embed.setDescription(notice.message)
}

async function sendNotice(client: Client, notice: MovNotice): Promise<void> {
  const guild = await client.guilds.fetch(notice.guildId)
  const channel = await guild.channels.fetch(notice.channelId)
  if (!channel || !channel.isTextBased()) throw new Error('O canal já não existe.')
  const mention = mentionFor(guild, notice.mentionRoleId)
  await channel.send({
    content: mention || undefined,
    embeds: [buildNoticeEmbed(guild, notice)],
    allowedMentions: notice.mentionRoleId === guild.id ? { parse: ['everyone'] } : { roles: notice.mentionRoleId ? [notice.mentionRoleId] : [] },
  })
}

/** Publica os avisos que chegaram à hora (verifica a cada 20 s). Devolve uma função para parar. */
export function startMovNoticeLoop(client: Client): () => void {
  let running = false
  const tick = async () => {
    if (running || !client.isReady()) return
    running = true
    try {
      for (const notice of store.takeDueNotices()) {
        if (!client.guilds.cache.has(notice.guildId)) continue // pertence a outro bot/instância
        try {
          await sendNotice(client, notice)
          store.markNoticeResult(notice.id, true)
        } catch (err) {
          console.error(`[avisomov] Falha a publicar o aviso ${notice.id}:`, err)
          store.markNoticeResult(notice.id, false, err instanceof Error ? err.message : String(err))
        }
      }
    } catch (err) {
      console.error('[avisomov] Não consegui ler os avisos:', err)
    } finally {
      running = false
    }
  }
  const interval = setInterval(() => void tick(), TICK_MS)
  void tick()
  return () => clearInterval(interval)
}
