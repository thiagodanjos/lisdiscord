import type { Guild } from 'discord.js'
import type { MemberProfile, RolePickerEntry } from '../../shared/types'
import * as movPoints from '../store/movPoints'

function toRoleEntries(guild: Guild, roles: Iterable<{ id: string; name: string; hexColor: string; position: number }>): RolePickerEntry[] {
  return [...roles]
    .filter((r) => r.id !== guild.id) // exclui o cargo @everyone (mesmo id do servidor)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.hexColor }))
}

export async function listGuildRoles(guild: Guild): Promise<RolePickerEntry[]> {
  await guild.roles.fetch()
  return toRoleEntries(guild, guild.roles.cache.values())
}

export async function getMemberProfile(guild: Guild, userId: string): Promise<MemberProfile> {
  const member = await guild.members.fetch(userId)
  const entry = movPoints.getLeaderboard(guild.id).find((e) => e.userId === userId)

  return {
    id: member.id,
    tag: member.user.tag,
    avatarUrl: member.displayAvatarURL({ size: 128 }),
    roles: toRoleEntries(guild, member.roles.cache.values()),
    points: entry?.points ?? 0,
    totalSeconds: entry?.totalSeconds ?? 0,
  }
}
