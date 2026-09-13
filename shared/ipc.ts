import type {
  AppSettings,
  BackupData,
  BackupOptions,
  BackupSummary,
  BotStatus,
  ChannelPickerEntry,
  DiffEntry,
  EmbedDraft,
  GameId,
  GameInfo,
  GameSettings,
  Giveaway,
  GuildSummary,
  MemberProfile,
  MemberSearchResult,
  ModerationLogEntry,
  MovPointsBoardConfig,
  MovPointsEntry,
  RestoreOptions,
  RestoreProgressEvent,
  RoleGoal,
  RolePickerEntry,
  ScheduleConfig,
  ScheduleFrequency,
  TimeoutDuration,
  Transcript,
  TranscriptSummary,
} from './types'

/** Nomes dos canais IPC — usados em ambos os lados para nunca ficarem dessincronizados. */
export const IPC = {
  connectBot: 'bot:connect',
  disconnectBot: 'bot:disconnect',
  getStatus: 'bot:status',
  listGuilds: 'guilds:list',
  listChannels: 'guilds:channels',
  createBackup: 'backups:create',
  listBackups: 'backups:list',
  getBackup: 'backups:get',
  deleteBackup: 'backups:delete',
  restoreBackup: 'backups:restore',
  restoreProgress: 'backups:restore:progress',
  diffBackups: 'backups:diff',
  exportTranscript: 'transcripts:export',
  listTranscripts: 'transcripts:list',
  getTranscript: 'transcripts:get',
  deleteTranscript: 'transcripts:delete',
  listSchedules: 'schedules:list',
  createSchedule: 'schedules:create',
  updateSchedule: 'schedules:update',
  deleteSchedule: 'schedules:delete',
  getSettings: 'settings:get',
  openDataDir: 'settings:openDataDir',

  sendEmbed: 'messaging:sendEmbed',

  searchMembers: 'moderation:searchMembers',
  banMember: 'moderation:ban',
  kickMember: 'moderation:kick',
  timeoutMember: 'moderation:timeout',
  removeTimeout: 'moderation:removeTimeout',
  lockChannel: 'moderation:lockChannel',
  unlockChannel: 'moderation:unlockChannel',
  listModerationLog: 'moderation:log',

  createGiveaway: 'giveaways:create',
  listGiveaways: 'giveaways:list',
  endGiveaway: 'giveaways:end',
  deleteGiveaway: 'giveaways:delete',

  listGames: 'games:list',
  getGameSettings: 'games:settings:get',
  setGameSettings: 'games:settings:set',

  listMovPoints: 'movpoints:list',
  addMovPoints: 'movpoints:add',
  removeMovPoints: 'movpoints:remove',
  addMovHours: 'movpoints:hours:add',
  getMovPointsBoard: 'movpoints:board:get',
  setMovPointsBoard: 'movpoints:board:set',
  resetMovPoints: 'movpoints:reset',

  listRoles: 'guilds:roles',
  getMemberProfile: 'members:profile',
  listRoleGoals: 'goals:list',
  setRoleGoal: 'goals:set',
  removeRoleGoal: 'goals:remove',
} as const

/** API exposta no `window.lisdiscord` pelo preload — o único contrato entre a UI e o processo principal. */
export interface LisDiscordBridge {
  connectBot(token: string): Promise<BotStatus>
  disconnectBot(): Promise<void>
  getStatus(): Promise<BotStatus>
  listGuilds(): Promise<GuildSummary[]>
  listChannels(guildId: string): Promise<ChannelPickerEntry[]>

  createBackup(guildId: string, options: BackupOptions): Promise<BackupSummary>
  listBackups(): Promise<BackupSummary[]>
  getBackup(id: string): Promise<BackupData | null>
  deleteBackup(id: string): Promise<void>
  restoreBackup(backupId: string, targetGuildId: string, options: RestoreOptions): Promise<void>
  onRestoreProgress(listener: (event: RestoreProgressEvent) => void): () => void
  diffBackups(backupIdA: string, backupIdB: string): Promise<DiffEntry[]>

  exportTranscript(guildId: string, channelId: string, limit: number): Promise<TranscriptSummary>
  listTranscripts(): Promise<TranscriptSummary[]>
  getTranscript(id: string): Promise<Transcript | null>
  deleteTranscript(id: string): Promise<void>

  listSchedules(): Promise<ScheduleConfig[]>
  createSchedule(guildId: string, frequency: ScheduleFrequency, includeBans: boolean): Promise<ScheduleConfig>
  updateSchedule(id: string, patch: Partial<Pick<ScheduleConfig, 'enabled' | 'frequency' | 'includeBans'>>): Promise<ScheduleConfig>
  deleteSchedule(id: string): Promise<void>

  getSettings(): Promise<AppSettings>
  openDataDir(): Promise<void>

  sendEmbed(guildId: string, channelId: string, embed: EmbedDraft): Promise<void>

  searchMembers(guildId: string, query: string): Promise<MemberSearchResult[]>
  banMember(guildId: string, userId: string, reason: string, deleteMessageSeconds: number): Promise<void>
  kickMember(guildId: string, userId: string, reason: string): Promise<void>
  timeoutMember(guildId: string, userId: string, durationMs: TimeoutDuration, reason: string): Promise<void>
  removeTimeout(guildId: string, userId: string): Promise<void>
  lockChannel(guildId: string, channelId: string): Promise<void>
  unlockChannel(guildId: string, channelId: string): Promise<void>
  listModerationLog(): Promise<ModerationLogEntry[]>

  createGiveaway(guildId: string, channelId: string, prize: string, durationMs: number, winnerCount: number): Promise<Giveaway>
  listGiveaways(): Promise<Giveaway[]>
  endGiveaway(id: string): Promise<Giveaway>
  deleteGiveaway(id: string): Promise<void>

  listGames(): Promise<GameInfo[]>
  getGameSettings(guildId: string): Promise<GameSettings>
  setGameSettings(guildId: string, gameId: GameId, enabled: boolean): Promise<GameSettings>

  listMovPoints(guildId: string): Promise<MovPointsEntry[]>
  addMovPoints(guildId: string, userId: string, amount: number): Promise<MovPointsEntry[]>
  removeMovPoints(guildId: string, userId: string, amount: number): Promise<MovPointsEntry[]>
  addMovHours(guildId: string, userId: string, seconds: number): Promise<MovPointsEntry[]>
  getMovPointsBoard(guildId: string): Promise<MovPointsBoardConfig>
  setMovPointsBoard(guildId: string, channelId: string | null): Promise<MovPointsBoardConfig>
  resetMovPoints(guildId: string): Promise<MovPointsEntry[]>

  listRoles(guildId: string): Promise<RolePickerEntry[]>
  getMemberProfile(guildId: string, userId: string): Promise<MemberProfile>
  listRoleGoals(guildId: string): Promise<RoleGoal[]>
  setRoleGoal(guildId: string, roleId: string, roleName: string, pointsGoal: number, hoursGoal: number): Promise<RoleGoal[]>
  removeRoleGoal(guildId: string, roleId: string): Promise<RoleGoal[]>
}
