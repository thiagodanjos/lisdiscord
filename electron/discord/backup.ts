import { ChannelType, type Guild, type NonThreadGuildBasedChannel, OverwriteType, PermissionsBitField } from 'discord.js'
import { randomUUID } from 'node:crypto'
import type {
  BackupData,
  BackupOptions,
  ChannelBackup,
  ChannelKind,
  EmojiBackup,
  PermissionOverwriteBackup,
  RoleBackup,
} from '../../shared/types'

const CHANNEL_KIND_BY_TYPE: Partial<Record<ChannelType, ChannelKind>> = {
  [ChannelType.GuildCategory]: 'category',
  [ChannelType.GuildText]: 'text',
  [ChannelType.GuildVoice]: 'voice',
  [ChannelType.GuildAnnouncement]: 'announcement',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildStageVoice]: 'stage',
}

function serializeOverwrites(channel: NonThreadGuildBasedChannel, guild: Guild): PermissionOverwriteBackup[] {
  return [...channel.permissionOverwrites.cache.values()].map((ow) => {
    const isRole = ow.type === OverwriteType.Role
    const name = isRole
      ? (guild.roles.cache.get(ow.id)?.name ?? `Cargo desconhecido (${ow.id})`)
      : (guild.members.cache.get(ow.id)?.user.tag ?? `Membro (${ow.id})`)

    return {
      id: ow.id,
      name,
      type: isRole ? 'role' : 'member',
      allow: new PermissionsBitField(ow.allow).toArray(),
      deny: new PermissionsBitField(ow.deny).toArray(),
    }
  })
}

function serializeChannel(channel: NonThreadGuildBasedChannel, guild: Guild): ChannelBackup | null {
  const kind = CHANNEL_KIND_BY_TYPE[channel.type]
  if (!kind) return null // threads e outros tipos transitórios ficam fora do backup

  const base: ChannelBackup = {
    id: channel.id,
    name: channel.name,
    kind,
    position: channel.position,
    parentName: channel.parent?.name ?? null,
    permissionOverwrites: serializeOverwrites(channel, guild),
  }

  if ('topic' in channel) base.topic = channel.topic ?? null
  if ('nsfw' in channel) base.nsfw = channel.nsfw
  if ('rateLimitPerUser' in channel) base.rateLimitPerUser = channel.rateLimitPerUser ?? 0
  if ('bitrate' in channel) base.bitrate = channel.bitrate
  if ('userLimit' in channel) base.userLimit = channel.userLimit

  return base
}

function serializeRole(guild: Guild, role: import('discord.js').Role): RoleBackup {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    position: role.position,
    permissions: role.permissions.toArray(),
    isEveryone: role.id === guild.roles.everyone.id,
  }
}

export async function createBackup(guild: Guild, options: BackupOptions): Promise<BackupData> {
  await guild.channels.fetch()
  await guild.roles.fetch()
  const emojis = await guild.emojis.fetch()

  const channels = [...guild.channels.cache.values()]
    .filter((c): c is NonThreadGuildBasedChannel => !c.isThread())
    .map((c) => serializeChannel(c, guild))
    .filter((c): c is ChannelBackup => c !== null)
    .sort((a, b) => a.position - b.position)

  const roles = [...guild.roles.cache.values()]
    .map((r) => serializeRole(guild, r))
    .sort((a, b) => b.position - a.position)

  const emojiList: EmojiBackup[] = [...emojis.values()].map((e) => ({
    id: e.id,
    name: e.name ?? 'emoji',
    url: e.imageURL({ size: 128 }) ?? '',
    animated: e.animated ?? false,
  }))

  const bans = options.includeBans
    ? [...(await guild.bans.fetch().catch(() => new Map())).values()].map((b) => ({
        userId: b.user.id,
        userTag: b.user.tag,
        reason: b.reason ?? null,
      }))
    : []

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name,
    guildIconUrl: guild.iconURL({ size: 256 }),
    settings: {
      name: guild.name,
      iconUrl: guild.iconURL({ size: 256 }),
      verificationLevel: guild.verificationLevel,
      explicitContentFilter: guild.explicitContentFilter,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      afkChannelName: guild.afkChannel?.name ?? null,
      afkTimeout: guild.afkTimeout,
      systemChannelName: guild.systemChannel?.name ?? null,
      locale: guild.preferredLocale,
    },
    roles,
    channels,
    emojis: emojiList,
    bans,
    memberCountAtBackup: guild.memberCount,
  }
}
