import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from 'discord.js'
import type { MemberProfile, RoleGoal } from '../../shared/types'
import * as roleGoalsStore from '../store/roleGoals'
import { formatDuration } from './movcall'
import { getMemberProfile } from './memberProfile'

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
  await interaction.editReply({ embeds: [buildVerifyEmbed(profile, goals)] })
  return true
}

function buildVerifyEmbed(profile: MemberProfile, goals: RoleGoal[]): EmbedBuilder {
  const lines = profile.roles.map((role) => {
    const goal = goals.find((g) => g.roleId === role.id)
    if (!goal) return `⚪ **${role.name}** — sem meta configurada`

    const meetsPoints = profile.points >= goal.pointsGoal
    const meetsHours = profile.totalSeconds >= goal.hoursGoal * 3600
    const icon = meetsPoints && meetsHours ? '✅' : '❌'
    return `${icon} **${role.name}** — ${profile.points}/${goal.pointsGoal} pontos · ${formatDuration(profile.totalSeconds)}/${goal.hoursGoal}h`
  })

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔍 Verificação de cargo')
    .setDescription(
      `<@${profile.id}> tem **${profile.points} pontos** e **${formatDuration(profile.totalSeconds)}** de Mov. Call.\n\n` +
        (lines.length > 0 ? lines.join('\n') : '_Este membro não tem nenhum cargo._'),
    )
    .setFooter({ text: 'Configura as metas de cada cargo na app, em "Metas".' })
    .setTimestamp(new Date())
}
