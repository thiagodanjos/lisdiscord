// Tipos partilhados entre o processo principal (Electron/discord.js) e a interface (React).
// Mantidos num único sítio para os dois lados nunca discordarem sobre a forma dos dados.

export type ChannelKind = 'category' | 'text' | 'voice' | 'announcement' | 'forum' | 'stage'

export interface PermissionOverwriteBackup {
  id: string
  name: string
  type: 'role' | 'member'
  allow: string[]
  deny: string[]
}

export interface ChannelBackup {
  id: string
  name: string
  kind: ChannelKind
  position: number
  parentName: string | null
  topic?: string | null
  nsfw?: boolean
  rateLimitPerUser?: number
  bitrate?: number
  userLimit?: number
  permissionOverwrites: PermissionOverwriteBackup[]
}

export interface RoleBackup {
  id: string
  name: string
  color: number
  hoist: boolean
  mentionable: boolean
  position: number
  permissions: string[]
  isEveryone: boolean
}

export interface EmojiBackup {
  id: string
  name: string
  url: string
  animated: boolean
}

export interface BanBackup {
  userId: string
  userTag: string
  reason: string | null
}

export interface GuildSettingsBackup {
  name: string
  iconUrl: string | null
  verificationLevel: number
  explicitContentFilter: number
  defaultMessageNotifications: number
  afkChannelName: string | null
  afkTimeout: number
  systemChannelName: string | null
  locale: string
}

export interface BackupData {
  id: string
  createdAt: string
  guildId: string
  guildName: string
  guildIconUrl: string | null
  settings: GuildSettingsBackup
  roles: RoleBackup[]
  channels: ChannelBackup[]
  emojis: EmojiBackup[]
  bans: BanBackup[]
  memberCountAtBackup: number
}

export interface BackupSummary {
  id: string
  createdAt: string
  guildId: string
  guildName: string
  guildIconUrl: string | null
  channelCount: number
  roleCount: number
  emojiCount: number
  banCount: number
  memberCountAtBackup: number
  sizeBytes: number
  origin: 'manual' | 'scheduled'
}

export interface GuildSummary {
  id: string
  name: string
  iconUrl: string | null
  memberCount: number
  ownerId: string
  botIsAdmin: boolean
}

export interface BotStatus {
  connected: boolean
  botTag: string | null
  botAvatarUrl: string | null
  guildCount: number
}

export interface RestoreOptions {
  wipeExistingChannels: boolean
  restoreRoles: boolean
  restoreChannels: boolean
  restoreEmojis: boolean
  restoreSettings: boolean
  restoreBans: boolean
}

export interface RestoreProgressEvent {
  backupId: string
  targetGuildId: string
  step: string
  message: string
  done: number
  total: number
  level: 'info' | 'success' | 'error'
}

export interface BackupOptions {
  includeBans: boolean
  origin: 'manual' | 'scheduled'
}

export type ScheduleFrequency = 'hourly6' | 'hourly12' | 'daily' | 'daily3' | 'weekly'

export interface ScheduleConfig {
  id: string
  guildId: string
  guildName: string
  frequency: ScheduleFrequency
  includeBans: boolean
  enabled: boolean
  createdAt: string
  lastRunAt: string | null
  nextRunAt: string | null
  keepLast: number
}

export interface DiffEntry {
  kind: 'added' | 'removed' | 'changed'
  category: 'role' | 'channel' | 'emoji'
  name: string
  details?: string
}

export interface TranscriptMessage {
  id: string
  authorTag: string
  authorAvatarUrl: string | null
  content: string
  createdAt: string
  attachments: string[]
  editedAt: string | null
}

export interface Transcript {
  channelId: string
  channelName: string
  guildName: string
  exportedAt: string
  messages: TranscriptMessage[]
}

export interface TranscriptSummary {
  id: string
  channelId: string
  channelName: string
  guildName: string
  exportedAt: string
  messageCount: number
}

export interface ChannelPickerEntry {
  id: string
  name: string
  kind: ChannelKind
}

export interface AppSettings {
  hasToken: boolean
  theme: 'dark' | 'light'
  dataDir: string
}
