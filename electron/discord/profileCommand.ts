import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type Interaction,
  MessageFlags,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from 'discord.js'
import type { CustomButton, CustomLinkButton, ProfileSettings, VerificationButtonStyle } from '../../shared/types'
import { defaultProfileSettings, fill, formatProfileGoals, formatRankingLines } from '../../shared/movFeatures'
import { formatDuration } from '../../shared/leaderboardFormat'
import * as profileStore from '../store/profileSettings'
import * as roleGoalsStore from '../store/roleGoals'
import * as movPoints from '../store/movPoints'
import { getReportPeriod } from '../store/weeklyReport'
import * as voiceStore from '../store/voiceHours'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { embedToContainer } from './componentsV2'
import { buildFullLeaderboard } from './leaderboard'
import { getLiveEntry } from './voiceHours'
import { parseButtonEmoji } from './verification'

// /perfil [membro] — um cartão (caixa V2) com pontos, horas, posição no ranking, a semana, as metas com
// barras de progresso e se a pessoa está em call agora. Tudo vem da app: o embed, a linha de cada meta,
// a barra, os textos e os botões (Atualizar · Ranking · link).

const REFRESH_PREFIX = 'profile:refresh:'
export const RANKING_BUTTON_ID = 'profile:ranking'

const BUTTON_STYLES: Record<VerificationButtonStyle, ButtonStyle> = {
  success: ButtonStyle.Success,
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  danger: ButtonStyle.Danger,
}

export function perfilCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Mostra o perfil de Mov Call: pontos, horas, ranking, metas e se está em call')
    .addUserOption((o) => o.setName('membro').setDescription('De quem (por omissão, o teu)').setRequired(false))
    .toJSON()
}

/** Botões configuráveis na app → ButtonBuilder (sem emoji se `withEmoji` for falso). */
export function customButton(customId: string, b: CustomButton, fallback: string, withEmoji: boolean): ButtonBuilder {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel((b.label || fallback).slice(0, 80))
    .setStyle(BUTTON_STYLES[b.style] ?? ButtonStyle.Secondary)
  const emoji = withEmoji ? parseButtonEmoji(b.emoji) : null
  if (emoji) button.setEmoji(emoji)
  return button
}

export function customLinkButton(b: CustomLinkButton, fallback: string, withEmoji: boolean): ButtonBuilder | null {
  if (!b.show || !/^https?:\/\/\S+$/i.test(b.url.trim())) return null
  const button = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setURL(b.url.trim())
    .setLabel((b.label || fallback).slice(0, 80))
  const emoji = withEmoji ? parseButtonEmoji(b.emoji) : null
  if (emoji) button.setEmoji(emoji)
  return button
}

async function buildProfilePayload(guild: Guild, userId: string, withEmoji = true) {
  const settings = profileStore.getProfileSettings(guild.id)
  const member = await guild.members.fetch(userId).catch(() => null)
  const user = member?.user ?? (await guild.client.users.fetch(userId))
  const board = await buildFullLeaderboard(guild)
  const index = board.findIndex((e) => e.userId === userId)
  const totals = movPoints.getLeaderboard(guild.id).find((e) => e.userId === userId) ?? { points: 0, totalSeconds: 0 }
  const week = getReportPeriod(guild.id).stats[userId]
  const roles = member ? [...member.roles.cache.values()].filter((r) => r.id !== guild.id).map((r) => ({ id: r.id, name: r.name })) : []
  const goals = formatProfileGoals(settings, { points: totals.points, totalSeconds: totals.totalSeconds, roles }, roleGoalsStore.listGoals(guild.id), 'discord')

  const live = getLiveEntry(guild.id, userId)
  const voiceSettings = voiceStore.getVoiceHoursSettings(guild.id)
  const emCall = live
    ? fill(settings.inCallText, {
        canal: `<#${live.channelId}>`,
        duracao: formatDuration(live.sessionSeconds),
        estadoCall: live.reason === 'counting' ? voiceSettings.statusCounting : voiceSettings.statusPaused,
      })
    : settings.notInCallText
  const highest = member && member.roles.highest.id !== guild.id ? `<@&${member.roles.highest.id}>` : '—'

  let embed = buildEmbedFromDraft(
    getTemplate(guild.id, 'profileCard'),
    {
      membro: `<@${userId}>`,
      nome: member?.displayName ?? user.username,
      avatar: (member ?? user).displayAvatarURL({ size: 256 }),
      id: userId,
      pontos: String(totals.points),
      horas: formatDuration(totals.totalSeconds),
      posicao: index >= 0 ? String(index + 1) : '—',
      totalMembros: String(board.length),
      pontosSemana: String(week?.points ?? 0),
      horasSemana: formatDuration(week?.seconds ?? 0),
      metas: goals.text,
      metasCumpridas: String(goals.met),
      metasTotal: String(goals.total),
      emCall,
      entrou: member?.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : '—',
      cargoMaisAlto: highest,
      servidor: guild.name,
    },
    { separators: 'keep' },
  )
  if (!embedHasContent(embed)) embed = embed.setDescription(`<@${userId}> — ${totals.points} pontos · ${formatDuration(totals.totalSeconds)}`)

  const buttons: ButtonBuilder[] = []
  if (settings.refreshButton.show) buttons.push(customButton(`${REFRESH_PREFIX}${userId}`, settings.refreshButton, 'Atualizar', withEmoji))
  if (settings.rankingButton.show) buttons.push(customButton(RANKING_BUTTON_ID, settings.rankingButton, 'Ranking', withEmoji))
  const link = customLinkButton(settings.linkButton, 'Link', withEmoji)
  if (link) buttons.push(link)
  const rows = buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : []
  return { settings, payload: { flags: MessageFlags.IsComponentsV2 as const, components: [embedToContainer(embed, rows)], allowedMentions: { parse: [] as [] } } }
}

export async function handleProfileCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'perfil') return false
  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este comando só funciona dentro de um servidor.', flags: MessageFlags.Ephemeral })
    return true
  }
  const settings = profileStore.getProfileSettings(guild.id)
  const target = interaction.options.getUser('membro') ?? interaction.user
  if (target.bot) {
    await interaction.reply({ content: '🤖 Bots não têm perfil de Mov Call.', flags: MessageFlags.Ephemeral })
    return true
  }
  const isManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false
  if (target.id !== interaction.user.id && !settings.allowOthers && !isManager) {
    await interaction.reply({ content: '🔒 Só podes ver o teu próprio perfil.', flags: MessageFlags.Ephemeral })
    return true
  }
  await interaction.deferReply(settings.ephemeral ? { flags: MessageFlags.Ephemeral } : {})
  const built = await buildProfilePayload(guild, target.id)
  await interaction.editReply(built.payload).catch(async () => interaction.editReply((await buildProfilePayload(guild, target.id, false)).payload))
  return true
}

async function replyRanking(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild!
  const settings = profileStore.getProfileSettings(guild.id)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const board = await buildFullLeaderboard(guild)
  const size = Math.min(50, Math.max(3, settings.rankingSize || 10))
  const index = board.findIndex((e) => e.userId === interaction.user.id)
  let embed = buildEmbedFromDraft(
    getTemplate(guild.id, 'profileRanking'),
    {
      lista: formatRankingLines(settings.rankingLineFormat, board.slice(0, size), 'discord') || '—',
      posicao: index >= 0 ? String(index + 1) : '—',
      total: String(board.length),
      servidor: guild.name,
    },
    { separators: 'keep' },
  )
  if (!embedHasContent(embed)) embed = embed.setDescription(formatRankingLines(settings.rankingLineFormat, board.slice(0, size), 'discord') || '—')
  await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [embedToContainer(embed)], allowedMentions: { parse: [] } })
}

/** Botões do /perfil (e o "Ranking" do relatório semanal, que usa o mesmo). */
export async function handleProfileButtons(interaction: Interaction): Promise<boolean> {
  if (!interaction.isButton() || !interaction.guild) return false
  if (interaction.customId === RANKING_BUTTON_ID) {
    await replyRanking(interaction)
    return true
  }
  if (interaction.customId.startsWith(REFRESH_PREFIX)) {
    const userId = interaction.customId.slice(REFRESH_PREFIX.length)
    await interaction.deferUpdate()
    const built = await buildProfilePayload(interaction.guild, userId)
    await interaction.editReply(built.payload).catch(async () => interaction.editReply((await buildProfilePayload(interaction.guild!, userId, false)).payload))
    return true
  }
  return false
}

// ==========================================================================
// App
// ==========================================================================

export function applyProfileSettings(guildId: string, input: ProfileSettings): ProfileSettings {
  const d = defaultProfileSettings()
  const style = (v: unknown, fb: VerificationButtonStyle): VerificationButtonStyle => (v === 'success' || v === 'primary' || v === 'secondary' || v === 'danger' ? v : fb)
  const txt = (v: unknown, max: number, fb: string) => (typeof v === 'string' ? v.slice(0, max) : fb)
  const btn = (b: Partial<CustomButton> | undefined, fb: CustomButton): CustomButton => ({
    show: b?.show !== false,
    label: txt(b?.label, 80, fb.label).trim() || fb.label,
    emoji: txt(b?.emoji, 100, '').trim(),
    style: style(b?.style, fb.style),
  })
  const next: ProfileSettings = {
    ephemeral: Boolean(input.ephemeral),
    allowOthers: input.allowOthers !== false,
    goalLineFormat: txt(input.goalLineFormat, 500, d.goalLineFormat).trim() || d.goalLineFormat,
    goalMet: txt(input.goalMet, 100, d.goalMet),
    goalNotMet: txt(input.goalNotMet, 100, d.goalNotMet),
    goalsEmpty: txt(input.goalsEmpty, 500, d.goalsEmpty),
    barFilled: txt(input.barFilled, 100, d.barFilled).trim() || d.barFilled,
    barEmpty: txt(input.barEmpty, 100, d.barEmpty).trim() || d.barEmpty,
    barLength: Math.min(20, Math.max(3, Math.round(Number(input.barLength) || d.barLength))),
    inCallText: txt(input.inCallText, 500, d.inCallText),
    notInCallText: txt(input.notInCallText, 500, d.notInCallText),
    rankingLineFormat: txt(input.rankingLineFormat, 300, d.rankingLineFormat).trim() || d.rankingLineFormat,
    rankingSize: Math.min(50, Math.max(3, Math.round(Number(input.rankingSize) || d.rankingSize))),
    refreshButton: btn(input.refreshButton, d.refreshButton),
    rankingButton: btn(input.rankingButton, d.rankingButton),
    linkButton: {
      show: Boolean(input.linkButton?.show),
      label: txt(input.linkButton?.label, 80, d.linkButton.label).trim() || d.linkButton.label,
      emoji: txt(input.linkButton?.emoji, 100, '').trim(),
      url: txt(input.linkButton?.url, 500, '').trim(),
    },
  }
  if (next.linkButton.show && !/^https?:\/\/\S+$/i.test(next.linkButton.url)) throw new Error('O botão de link precisa de um URL que comece por https://')
  return profileStore.saveProfileSettings(guildId, next)
}
