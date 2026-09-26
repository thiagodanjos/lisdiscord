import {
  type ChatInputCommandInteraction,
  type EmbedBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from 'discord.js'
import type { MemberProfile, RoleGoal } from '../../shared/types'
import * as roleGoalsStore from '../store/roleGoals'
import { formatDuration } from '../../shared/leaderboardFormat'
import { getMemberProfile } from './memberProfile'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { DEFAULT_VERIFY_LINES, formatVerifyRoles } from '../../shared/featureTemplates'

export function verificarCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('verificar')
    .setDescription('Mostra os cargos, pontos e horas de um membro, e se já cumpre as metas para upar')
    .addUserOption((o) => o.setName('membro').setDescription('Quem verificar').setRequired(true))
    .toJSON()
}

export async function handleVerifyCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'verificar') return false

  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este comando só funciona dentro de um servidor.', ephemeral: true })
    return true
  }

  const target = interaction.options.getUser('membro', true)
  await interaction.deferReply()

  const profile = await getMemberProfile(guild, target.id).catch(() => null)
  if (!profile) {
    await interaction.editReply({ content: '❌ Não encontrei esse membro neste servidor.' })
    return true
  }

  const goals = roleGoalsStore.listGoals(guild.id)
  await interaction.editReply({ embeds: [buildVerifyEmbed(profile, goals, guild.id, guild.name)], allowedMentions: { parse: [] } })
  return true
}

/** Monta o embed do /verificar a partir do template do servidor — só lista cargos com meta configurada. */
export function buildVerifyEmbed(profile: MemberProfile, goals: RoleGoal[], guildId: string, guildName: string): EmbedBuilder {
  const template = getTemplate(guildId, 'verificar')
  const roles = formatVerifyRoles(profile, goals, template.verifyLines ?? DEFAULT_VERIFY_LINES, 'discord')
  const embed = buildEmbedFromDraft(template, {
    membro: `<@${profile.id}>`,
    nome: profile.tag,
    avatar: profile.avatarUrl ?? '',
    pontos: String(profile.points),
    horas: formatDuration(profile.totalSeconds),
    cargos: roles.text,
    cumpridos: String(roles.met),
    total: String(roles.total),
    servidor: guildName,
  })
  return embedHasContent(embed) ? embed : embed.setDescription(roles.text)
}
