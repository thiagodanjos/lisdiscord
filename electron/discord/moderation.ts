import type { Guild } from 'discord.js'
import type { MemberSearchResult, TimeoutDuration } from '../../shared/types'

export async function searchMembers(guild: Guild, query: string): Promise<MemberSearchResult[]> {
  if (!query.trim()) return []
  const results = await guild.members.search({ query: query.trim(), limit: 10 })
  return [...results.values()].map((m) => ({
    id: m.id,
    tag: m.user.tag,
    avatarUrl: m.displayAvatarURL({ size: 64 }),
    isTimedOut: m.isCommunicationDisabled(),
    isBot: m.user.bot,
  }))
}

export async function banMember(guild: Guild, userId: string, reason: string, deleteMessageSeconds: number): Promise<void> {
  await guild.members.ban(userId, { reason: reason || undefined, deleteMessageSeconds })
}

export async function kickMember(guild: Guild, userId: string, reason: string): Promise<void> {
  const member = await guild.members.fetch(userId)
  await member.kick(reason || undefined)
}

export async function timeoutMember(guild: Guild, userId: string, durationMs: TimeoutDuration, reason: string): Promise<void> {
  const member = await guild.members.fetch(userId)
  await member.timeout(durationMs, reason || undefined)
}

export async function removeTimeout(guild: Guild, userId: string): Promise<void> {
  const member = await guild.members.fetch(userId)
  await member.timeout(null)
}

export async function lockChannel(guild: Guild, channelId: string): Promise<void> {
  const channel = await guild.channels.fetch(channelId)
  if (!channel || !('permissionOverwrites' in channel)) throw new Error('Este canal não suporta bloqueio.')
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false })
}

export async function unlockChannel(guild: Guild, channelId: string): Promise<void> {
  const channel = await guild.channels.fetch(channelId)
  if (!channel || !('permissionOverwrites' in channel)) throw new Error('Este canal não suporta bloqueio.')
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null })
}
