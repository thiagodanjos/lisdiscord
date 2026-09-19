import type {
  AppSettings,
  BackupData,
  BackupOptions,
  BackupSummary,
  BotEmoji,
  BotStatus,
  ChannelPickerEntry,
  DiffEntry,
  EmbedDraft,
  EmbedTemplateKind,
  EmbedTemplateResponse,
  ExcludedMember,
  GameId,
  GameInfo,
  GameSettings,
  Giveaway,
  GuildSummary,
  JustificationChannelKind,
  JustificationSettings,
  MemberProfile,
  MemberSearchResult,
  ModerationLogEntry,
  MovPointsBoardConfig,
  MovPointsEntry,
  MovPointsLogEntry,
  RemoteBotConfig,
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
  listMovPointsLog: 'movpoints:log:list',

  listRoles: 'guilds:roles',
  getMemberProfile: 'members:profile',
  listRoleGoals: 'goals:list',
  setRoleGoal: 'goals:set',
  removeRoleGoal: 'goals:remove',

  listExcludedMembers: 'movpoints:excluded:list',
  setMemberExcluded: 'movpoints:excluded:set',

  getJustificationSettings: 'justifications:settings:get',
  setJustificationChannel: 'justifications:settings:setChannel',

  getRemoteBotConfig: 'remoteBot:get',
  setRemoteBotConfig: 'remoteBot:set',
  clearRemoteBotConfig: 'remoteBot:clear',
  testRemoteBotConnection: 'remoteBot:test',
  listRemoteGuilds: 'remoteBot:guilds:list',
  listRemoteChannels: 'remoteBot:channels:list',
  getRemoteJustificationSettings: 'remoteBot:justifications:get',
  setRemoteJustificationChannel: 'remoteBot:justifications:set',

  listEmojis: 'emojis:list',
  addEmoji: 'emojis:add',
  deleteEmoji: 'emojis:delete',
  listRemoteEmojis: 'remoteBot:emojis:list',
  addRemoteEmoji: 'remoteBot:emojis:add',
  deleteRemoteEmoji: 'remoteBot:emojis:delete',

  listRemoteMovPoints: 'remoteBot:movpoints:list',
  addRemoteMovPoints: 'remoteBot:movpoints:add',
  removeRemoteMovPoints: 'remoteBot:movpoints:remove',
  addRemoteMovHours: 'remoteBot:movpoints:hours:add',
  getRemoteMovPointsBoard: 'remoteBot:movpoints:board:get',
  setRemoteMovPointsBoard: 'remoteBot:movpoints:board:set',
  resetRemoteMovPoints: 'remoteBot:movpoints:reset',
  listRemoteMovPointsLog: 'remoteBot:movpoints:log:list',
  listRemoteExcludedMembers: 'remoteBot:movpoints:excluded:list',
  setRemoteMemberExcluded: 'remoteBot:movpoints:excluded:set',

  searchRemoteMembers: 'remoteBot:members:search',
  getRemoteMemberProfile: 'remoteBot:members:profile',
  listRemoteRoles: 'remoteBot:guilds:roles',

  listRemoteRoleGoals: 'remoteBot:goals:list',
  setRemoteRoleGoal: 'remoteBot:goals:set',
  removeRemoteRoleGoal: 'remoteBot:goals:remove',

  getEmbedTemplate: 'embedTemplates:get',
  setEmbedTemplate: 'embedTemplates:set',
  resetEmbedTemplate: 'embedTemplates:reset',
  getRemoteEmbedTemplate: 'remoteBot:embedTemplates:get',
  setRemoteEmbedTemplate: 'remoteBot:embedTemplates:set',
  resetRemoteEmbedTemplate: 'remoteBot:embedTemplates:reset',
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
  listMovPointsLog(guildId: string): Promise<MovPointsLogEntry[]>

  listRoles(guildId: string): Promise<RolePickerEntry[]>
  getMemberProfile(guildId: string, userId: string): Promise<MemberProfile>
  listRoleGoals(guildId: string): Promise<RoleGoal[]>
  setRoleGoal(guildId: string, roleId: string, roleName: string, pointsGoal: number, hoursGoal: number): Promise<RoleGoal[]>
  removeRoleGoal(guildId: string, roleId: string): Promise<RoleGoal[]>

  listExcludedMembers(guildId: string): Promise<ExcludedMember[]>
  setMemberExcluded(guildId: string, userId: string, tag: string, excluded: boolean): Promise<ExcludedMember[]>

  getJustificationSettings(guildId: string): Promise<JustificationSettings>
  setJustificationChannel(guildId: string, kind: JustificationChannelKind, channelId: string | null): Promise<JustificationSettings>

  getRemoteBotConfig(): Promise<RemoteBotConfig>
  setRemoteBotConfig(url: string, apiKey: string): Promise<RemoteBotConfig>
  clearRemoteBotConfig(): Promise<RemoteBotConfig>
  testRemoteBotConnection(url: string, apiKey: string): Promise<{ ok: boolean; error?: string }>
  listRemoteGuilds(): Promise<GuildSummary[]>
  listRemoteChannels(guildId: string): Promise<ChannelPickerEntry[]>
  getRemoteJustificationSettings(guildId: string): Promise<JustificationSettings>
  setRemoteJustificationChannel(guildId: string, kind: JustificationChannelKind, channelId: string | null): Promise<JustificationSettings>

  listEmojis(): Promise<BotEmoji[]>
  addEmoji(name: string, imageDataUrl: string): Promise<BotEmoji>
  deleteEmoji(id: string): Promise<void>
  listRemoteEmojis(): Promise<BotEmoji[]>
  addRemoteEmoji(name: string, imageDataUrl: string): Promise<BotEmoji>
  deleteRemoteEmoji(id: string): Promise<void>

  listRemoteMovPoints(guildId: string): Promise<MovPointsEntry[]>
  addRemoteMovPoints(guildId: string, userId: string, amount: number): Promise<MovPointsEntry[]>
  removeRemoteMovPoints(guildId: string, userId: string, amount: number): Promise<MovPointsEntry[]>
  addRemoteMovHours(guildId: string, userId: string, seconds: number): Promise<MovPointsEntry[]>
  getRemoteMovPointsBoard(guildId: string): Promise<MovPointsBoardConfig>
  setRemoteMovPointsBoard(guildId: string, channelId: string | null): Promise<MovPointsBoardConfig>
  resetRemoteMovPoints(guildId: string): Promise<MovPointsEntry[]>
  listRemoteMovPointsLog(guildId: string): Promise<MovPointsLogEntry[]>
  listRemoteExcludedMembers(guildId: string): Promise<ExcludedMember[]>
  setRemoteMemberExcluded(guildId: string, userId: string, tag: string, excluded: boolean): Promise<ExcludedMember[]>

  searchRemoteMembers(guildId: string, query: string): Promise<MemberSearchResult[]>
  getRemoteMemberProfile(guildId: string, userId: string): Promise<MemberProfile>
  listRemoteRoles(guildId: string): Promise<RolePickerEntry[]>

  listRemoteRoleGoals(guildId: string): Promise<RoleGoal[]>
  setRemoteRoleGoal(guildId: string, roleId: string, roleName: string, pointsGoal: number, hoursGoal: number): Promise<RoleGoal[]>
  removeRemoteRoleGoal(guildId: string, roleId: string): Promise<RoleGoal[]>

  getEmbedTemplate(guildId: string, kind: EmbedTemplateKind): Promise<EmbedTemplateResponse>
  setEmbedTemplate(guildId: string, kind: EmbedTemplateKind, draft: EmbedDraft): Promise<EmbedTemplateResponse>
  resetEmbedTemplate(guildId: string, kind: EmbedTemplateKind): Promise<EmbedTemplateResponse>
  getRemoteEmbedTemplate(guildId: string, kind: EmbedTemplateKind): Promise<EmbedTemplateResponse>
  setRemoteEmbedTemplate(guildId: string, kind: EmbedTemplateKind, draft: EmbedDraft): Promise<EmbedTemplateResponse>
  resetRemoteEmbedTemplate(guildId: string, kind: EmbedTemplateKind): Promise<EmbedTemplateResponse>
}
