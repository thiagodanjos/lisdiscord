import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  type Client,
  EmbedBuilder,
  type GuildMember,
  PartialGroupDMChannel,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  type User,
} from 'discord.js'
import { parseDurationMs } from '../../shared/duration'
import * as reminders from '../store/reminders'

const REMINDER_MAX_MS = 30 * 86_400_000
const REMINDER_MIN_MS = 60_000
const MAX_REMINDERS_PER_USER = 15
const REMINDER_TICK_MS = 20_000

export function utilityCommandDefs(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [
    new SlashCommandBuilder()
      .setName('avatar')
      .setDescription('Mostra a foto de perfil (e o banner) de alguém em tamanho grande')
      .addUserOption((o) => o.setName('membro').setDescription('De quem (por omissão, tu)'))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Informações sobre um membro: conta, entrada no servidor, cargos')
      .addUserOption((o) => o.setName('membro').setDescription('Quem (por omissão, tu)'))
      .toJSON(),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Informações sobre este servidor').toJSON(),
    new SlashCommandBuilder()
      .setName('enquete')
      .setDescription('Cria uma enquete com até 5 opções (enquete nativa da Discord)')
      .addStringOption((o) => o.setName('pergunta').setDescription('A pergunta').setRequired(true).setMaxLength(300))
      .addStringOption((o) => o.setName('opcao1').setDescription('Opção 1').setRequired(true).setMaxLength(55))
      .addStringOption((o) => o.setName('opcao2').setDescription('Opção 2').setRequired(true).setMaxLength(55))
      .addStringOption((o) => o.setName('opcao3').setDescription('Opção 3').setMaxLength(55))
      .addStringOption((o) => o.setName('opcao4').setDescription('Opção 4').setMaxLength(55))
      .addStringOption((o) => o.setName('opcao5').setDescription('Opção 5').setMaxLength(55))
      .addIntegerOption((o) =>
        o
          .setName('duracao')
          .setDescription('Quanto tempo fica aberta (padrão 24h)')
          .addChoices(
            { name: '1 hora', value: 1 },
            { name: '4 horas', value: 4 },
            { name: '12 horas', value: 12 },
            { name: '1 dia', value: 24 },
            { name: '3 dias', value: 72 },
            { name: '1 semana', value: 168 },
          ),
      )
      .addBooleanOption((o) => o.setName('varias').setDescription('Permitir votar em mais de uma opção'))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('lembrete')
      .setDescription('Lembretes: o bot avisa-te neste canal na hora marcada')
      .addSubcommand((sc) =>
        sc
          .setName('criar')
          .setDescription('Cria um lembrete')
          .addStringOption((o) => o.setName('tempo').setDescription('Daqui a quanto tempo — ex.: 10m, 2h, 1h30m, 3d').setRequired(true))
          .addStringOption((o) => o.setName('mensagem').setDescription('O que te devo lembrar').setRequired(true).setMaxLength(500)),
      )
      .addSubcommand((sc) => sc.setName('lista').setDescription('Mostra os teus lembretes pendentes, com botões para apagar'))
      .toJSON(),
  ]
}

const HANDLED = new Set(['avatar', 'userinfo', 'serverinfo', 'enquete', 'lembrete'])

export async function handleUtilityCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!HANDLED.has(interaction.commandName)) return false
  try {
    switch (interaction.commandName) {
      case 'avatar':
        await runAvatar(interaction)
        break
      case 'userinfo':
        await runUserInfo(interaction)
        break
      case 'serverinfo':
        await runServerInfo(interaction)
        break
      case 'enquete':
        await runPoll(interaction)
        break
      case 'lembrete':
        await runReminder(interaction)
        break
    }
  } catch (err) {
    console.error(`[/${interaction.commandName}] Erro:`, err)
    const payload = { content: `❌ Ocorreu um erro: ${err instanceof Error ? err.message : String(err)}`, ephemeral: true }
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => undefined)
    else await interaction.reply(payload).catch(() => undefined)
  }
  return true
}

// ---- /avatar ----

async function runAvatar(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await (interaction.options.getUser('membro') ?? interaction.user).fetch(true)
  const member = interaction.guild ? await interaction.guild.members.fetch(user.id).catch(() => null) : null
  const globalUrl = user.displayAvatarURL({ size: 4096 })
  const serverUrl = member?.avatar ? member.displayAvatarURL({ size: 4096 }) : null
  const formats = (url: string) =>
    ['png', 'jpg', 'webp', ...(url.includes('/a_') ? ['gif'] : [])].map((f) => `[${f.toUpperCase()}](${url.replace(/\.(png|webp|gif|jpg)(\?|$)/, `.${f}$2`)})`).join(' · ')

  const embeds = [
    new EmbedBuilder()
      .setColor(user.accentColor ?? 0x22e584)
      .setTitle(`🖼️ Avatar de ${user.displayName}`)
      .setDescription(formats(globalUrl))
      .setImage(globalUrl),
  ]
  if (serverUrl) embeds.push(new EmbedBuilder().setColor(0x22d3ee).setTitle('Avatar neste servidor').setDescription(formats(serverUrl)).setImage(serverUrl))
  const banner = user.bannerURL({ size: 4096 })
  if (banner) embeds.push(new EmbedBuilder().setColor(0xa855f7).setTitle('Banner').setImage(banner))
  await interaction.reply({ embeds })
}

// ---- /userinfo ----

async function runUserInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await (interaction.options.getUser('membro') ?? interaction.user).fetch(true)
  const member = interaction.guild ? await interaction.guild.members.fetch(user.id).catch(() => null) : null
  const embed = new EmbedBuilder()
    .setColor(member?.displayColor || 0x22e584)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .setThumbnail(user.displayAvatarURL({ size: 512 }))
    .addFields(
      { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
      { name: '🤖 Bot', value: user.bot ? 'Sim' : 'Não', inline: true },
      { name: '📅 Conta criada', value: `${time(user.createdAt, TimestampStyles.LongDate)}\n(${time(user.createdAt, TimestampStyles.RelativeTime)})`, inline: true },
    )
  if (member) addMemberFields(embed, member)
  const banner = user.bannerURL({ size: 1024 })
  if (banner) embed.setImage(banner)
  await interaction.reply({ embeds: [embed] })
}

function addMemberFields(embed: EmbedBuilder, member: GuildMember): void {
  const roles = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => `<@&${r.id}>`)
  const shownRoles = roles.slice(0, 15).join(' ') + (roles.length > 15 ? ` +${roles.length - 15}` : '')
  if (member.joinedAt) {
    embed.addFields({ name: '📥 Entrou no servidor', value: `${time(member.joinedAt, TimestampStyles.LongDate)}\n(${time(member.joinedAt, TimestampStyles.RelativeTime)})`, inline: true })
  }
  if (member.premiumSince) embed.addFields({ name: '💎 Booster desde', value: time(member.premiumSince, TimestampStyles.LongDate), inline: true })
  if (member.nickname) embed.addFields({ name: '🏷️ Alcunha', value: member.nickname, inline: true })
  embed.addFields({ name: `🎭 Cargos (${roles.length})`, value: shownRoles || 'Nenhum' })
}

// ---- /serverinfo ----

async function runServerInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Só funciona dentro de um servidor.', ephemeral: true })
    return
  }
  const owner = await guild.fetchOwner().catch(() => null)
  const channels = await guild.channels.fetch()
  const count = (types: ChannelType[]) => channels.filter((c) => c !== null && types.includes(c.type)).size
  const emojis = guild.emojis.cache
  const embed = new EmbedBuilder()
    .setColor(0x22e584)
    .setTitle(`🏠 ${guild.name}`)
    .setThumbnail(guild.iconURL({ size: 512 }))
    .addFields(
      { name: '👑 Dono', value: owner ? `<@${owner.id}>` : '—', inline: true },
      { name: '📅 Criado', value: `${time(guild.createdAt, TimestampStyles.LongDate)}\n(${time(guild.createdAt, TimestampStyles.RelativeTime)})`, inline: true },
      { name: '🆔 ID', value: `\`${guild.id}\``, inline: true },
      { name: '👥 Membros', value: `${guild.memberCount}`, inline: true },
      { name: '💬 Canais', value: `${count([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum])} texto · ${count([ChannelType.GuildVoice, ChannelType.GuildStageVoice])} voz`, inline: true },
      { name: '🎭 Cargos', value: `${guild.roles.cache.size - 1}`, inline: true },
      { name: '😀 Emojis', value: `${emojis.filter((e) => !e.animated).size} estáticos · ${emojis.filter((e) => e.animated).size} animados`, inline: true },
      { name: '💎 Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (nível ${guild.premiumTier})`, inline: true },
      { name: '🔒 Verificação', value: ['Nenhuma', 'Baixa', 'Média', 'Alta', 'Muito alta'][guild.verificationLevel] ?? '—', inline: true },
    )
  const banner = guild.bannerURL({ size: 1024 })
  if (banner) embed.setImage(banner)
  await interaction.reply({ embeds: [embed] })
}

// ---- /enquete ----

async function runPoll(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel
  if (!channel || !channel.isTextBased() || channel instanceof PartialGroupDMChannel || !('send' in channel)) {
    await interaction.reply({ content: '❌ Não consigo criar enquetes neste canal.', ephemeral: true })
    return
  }
  const answers = [1, 2, 3, 4, 5]
    .map((i) => interaction.options.getString(`opcao${i}`)?.trim())
    .filter((a): a is string => Boolean(a))
    .map((text) => ({ text }))
  await interaction.reply({
    poll: {
      question: { text: interaction.options.getString('pergunta', true) },
      answers,
      duration: interaction.options.getInteger('duracao') ?? 24,
      allowMultiselect: interaction.options.getBoolean('varias') ?? false,
    },
  })
}

// ---- /lembrete ----

async function runReminder(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.channelId) {
    await interaction.reply({ content: '❌ Só funciona dentro de um servidor.', ephemeral: true })
    return
  }
  const sub = interaction.options.getSubcommand()

  if (sub === 'criar') {
    const ms = parseDurationMs(interaction.options.getString('tempo', true))
    if (ms === null || ms < REMINDER_MIN_MS || ms > REMINDER_MAX_MS) {
      await interaction.reply({ content: '❌ Tempo inválido — usa algo como `10m`, `2h`, `1h30m` ou `3d` (entre 1 minuto e 30 dias).', ephemeral: true })
      return
    }
    if (reminders.listUserReminders(interaction.guildId, interaction.user.id).length >= MAX_REMINDERS_PER_USER) {
      await interaction.reply({ content: `❌ Já tens ${MAX_REMINDERS_PER_USER} lembretes pendentes — apaga algum com \`/lembrete lista\`.`, ephemeral: true })
      return
    }
    const due = new Date(Date.now() + ms)
    const reminder = reminders.addReminder({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      text: interaction.options.getString('mensagem', true),
      dueAt: due.toISOString(),
    })
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x22e584)
          .setTitle('⏰ Lembrete marcado')
          .setDescription(`Vou avisar-te aqui ${time(due, TimestampStyles.RelativeTime)} (${time(due, TimestampStyles.ShortDateTime)}):\n> ${reminder.text}`)
          .setFooter({ text: `ID ${reminder.id}` }),
      ],
      ephemeral: true,
    })
    return
  }

  const render = () => {
    const list = reminders.listUserReminders(interaction.guildId as string, interaction.user.id)
    const embed = new EmbedBuilder()
      .setColor(0x22d3ee)
      .setTitle('⏰ Os teus lembretes')
      .setDescription(
        list.length === 0
          ? 'Não tens lembretes pendentes. Cria um com `/lembrete criar`.'
          : list.map((r, i) => `**${i + 1}.** ${time(new Date(r.dueAt), TimestampStyles.RelativeTime)} — ${r.text.slice(0, 120)}`).join('\n'),
      )
    const rows = list.length
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            list.slice(0, 5).map((r, i) => new ButtonBuilder().setCustomId(`lembrete:del:${r.id}`).setLabel(`Apagar ${i + 1}`).setEmoji('🗑️').setStyle(ButtonStyle.Danger)),
          ),
        ]
      : []
    return { embeds: [embed], components: rows }
  }

  const reply = await interaction.reply({ ...render(), ephemeral: true, withResponse: true })
  const message = reply.resource?.message
  if (!message) return
  const collector = message.createMessageComponentCollector({ idle: 5 * 60_000 })
  collector.on('collect', async (click) => {
    reminders.removeReminder(click.customId.split(':')[2], click.user.id)
    await click.update(render()).catch(() => undefined)
  })
}

/** Verifica os lembretes a cada 20 s e avisa no canal onde foram criados. Devolve uma função para parar. */
export function startReminderLoop(client: Client): () => void {
  const tick = async () => {
    let due: reminders.Reminder[] = []
    try {
      due = reminders.takeDueReminders()
    } catch (err) {
      console.error('[lembretes] Não consegui ler os lembretes:', err)
      return
    }
    for (const r of due) {
      const channel = await client.channels.fetch(r.channelId).catch(() => null)
      const embed = new EmbedBuilder()
        .setColor(0xf5b53d)
        .setTitle('⏰ Lembrete')
        .setDescription(`> ${r.text}`)
        .setFooter({ text: `Marcado ${new Date(r.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` })
      if (channel && channel.isTextBased() && 'send' in channel) {
        await channel.send({ content: `<@${r.userId}>`, embeds: [embed], allowedMentions: { users: [r.userId] } }).catch(() => undefined)
      } else {
        const user: User | null = await client.users.fetch(r.userId).catch(() => null)
        await user?.send({ embeds: [embed] }).catch(() => undefined)
      }
    }
  }
  const timer = setInterval(() => void tick(), REMINDER_TICK_MS)
  void tick()
  return () => clearInterval(timer)
}
