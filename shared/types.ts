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
  messageContentEnabled: boolean
  guildMembersEnabled: boolean
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

// ==========================================================================
// Mensagens (embeds)
// ==========================================================================

export interface EmbedField {
  name: string
  value: string
  inline: boolean
}

export interface EmbedDraft {
  title: string
  description: string
  color: string // hex, ex: "#5865F2"
  imageUrl: string
  thumbnailUrl: string
  footer: string
  authorName: string
  fields: EmbedField[]
  timestamp: boolean
}

// ==========================================================================
// Moderação
// ==========================================================================

export interface MemberSearchResult {
  id: string
  tag: string
  avatarUrl: string | null
  isTimedOut: boolean
  isBot: boolean
}

export type ModerationAction = 'ban' | 'kick' | 'timeout' | 'removeTimeout'

export type TimeoutDuration = 60_000 | 300_000 | 600_000 | 3_600_000 | 86_400_000 | 604_800_000

export interface ModerationLogEntry {
  id: string
  guildId: string
  guildName: string
  action: ModerationAction | 'lockChannel' | 'unlockChannel'
  targetTag: string
  reason: string | null
  date: string
}

// ==========================================================================
// Sorteios
// ==========================================================================

export interface Giveaway {
  id: string
  guildId: string
  guildName: string
  channelId: string
  channelName: string
  messageId: string | null
  prize: string
  winnerCount: number
  createdAt: string
  endsAt: string
  ended: boolean
  winners: string[]
}

// ==========================================================================
// Jogos (slash commands)
// ==========================================================================

export type GameId =
  | 'dado'
  | 'moeda'
  | 'ppt'
  | 'oitobola'
  | 'trivia'
  | 'forca'
  | 'blackjack'
  | 'jogodavelha'
  | 'duelo'
  | 'roleta'
  | 'cacaniqueis'
  | 'corrida'
  | 'numero'
  | 'desembaralhar'
  | 'economia'

export interface GameInfo {
  id: GameId
  name: string
  command: string
  description: string
}

export interface GameSettings {
  enabled: Record<GameId, boolean>
}

// ==========================================================================
// Pontos de MOV. Call
// ==========================================================================

export type MovCallType = 'normal' | 'tematica'

export interface MovPointsEntry {
  userId: string
  tag: string
  points: number
  totalSeconds: number
}

export interface MovPointsBoardConfig {
  channelId: string | null
  channelName: string | null
}

export interface ExcludedMember {
  userId: string
  tag: string
}

export type MovPointsLogAction = 'add_points' | 'remove_points' | 'add_hours' | 'reset'

export interface MovPointsLogEntry {
  id: string
  guildId: string
  date: string
  action: MovPointsLogAction
  targetUserId: string | null
  targetTag: string | null
  amount: number | null
  newTotal: number | null
  actorTag: string
  note: string | null
}

// ==========================================================================
// Justificativas (fixas e diárias)
// ==========================================================================

export type JustificationType = 'fixed' | 'daily'

export type JustificationChannelKind = 'fixedPost' | 'dailyPost' | 'fixedLog' | 'dailyLog'

export interface JustificationSettings {
  fixedPostChannelId: string | null
  fixedPostChannelName: string | null
  dailyPostChannelId: string | null
  dailyPostChannelName: string | null
  fixedLogChannelId: string | null
  fixedLogChannelName: string | null
  dailyLogChannelId: string | null
  dailyLogChannelName: string | null
}

// ==========================================================================
// Upamentos (metas de cargo)
// ==========================================================================

export interface RolePickerEntry {
  id: string
  name: string
  color: string
}

export interface RoleGoal {
  roleId: string
  roleName: string
  pointsGoal: number
  hoursGoal: number
}

export interface MemberProfile {
  id: string
  tag: string
  avatarUrl: string | null
  roles: RolePickerEntry[]
  points: number
  totalSeconds: number
}
