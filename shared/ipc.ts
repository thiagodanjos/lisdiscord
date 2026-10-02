import type {
  AppSettings,
  AuthState,
  BackupData,
  BackupOptions,
  BackupSummary,
  BotEmoji,
  BotStatus,
  ChannelPickerEntry,
  CleanLogEntry,
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
  LoginHistoryEntry,
  MemberProfile,
  MemberSearchResult,
  MovNotice,
  MovNoticeInput,
  MovListOp,
  MovListSettings,
  MovListState,
  LisFilmsHit,
  LisFilmsSettings,
  LisFilmsState,
  LisFilmsStatus,
  ActivityAction,
  ActivityInput,
  CalendarSettings,
  CalendarState,
  VoiceHoursAction,
  VoiceHoursSettings,
  VoiceHoursState,
  ProfileSettings,
  WeeklyReportAction,
  WeeklyReportSettings,
  WeeklyReportState,
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
  SendMessageOptions,
  SendMessageResult,
  TimeoutDuration,
  Transcript,
  TranscriptSummary,
  ServerLogSettings,
  VerificationDiagnostics,
  VerificationEntry,
  VerificationSettings,
  VerificationTicket,
} from './types'

/** Nomes dos canais IPC — usados em ambos os lados para nunca ficarem dessincronizados. */
export const IPC = {
  getAuthState: 'auth:state',
  register: 'auth:register',
  login: 'auth:login',
  logout: 'auth:logout',
  changePassword: 'auth:changePassword',
  listLoginHistory: 'auth:history',
  forgetBotToken: 'auth:forgetBotToken',
  autoConnectBot: 'bot:autoConnect',

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
  sendRemoteEmbed: 'remoteBot:messaging:sendEmbed',

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
  removeMovHours: 'movpoints:hours:remove',
  getMovPointsBoard: 'movpoints:board:get',
  setMovPointsBoard: 'movpoints:board:set',
  resetMovPoints: 'movpoints:reset',
  listMovPointsLog: 'movpoints:log:list',
  listCleanLog: 'clean:log:list',
  listRemoteCleanLog: 'remoteBot:clean:log:list',

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
  removeRemoteMovHours: 'remoteBot:movpoints:hours:remove',
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

  listMovNotices: 'movNotices:list',
  createMovNotice: 'movNotices:create',
  cancelMovNotice: 'movNotices:cancel',
  listRemoteMovNotices: 'remoteBot:movNotices:list',
  createRemoteMovNotice: 'remoteBot:movNotices:create',
  cancelRemoteMovNotice: 'remoteBot:movNotices:cancel',

  getVerificationSettings: 'verification:settings:get',
  setVerificationSettings: 'verification:settings:set',
  listVerifications: 'verification:list',
  getRemoteVerificationSettings: 'remoteBot:verification:settings:get',
  setRemoteVerificationSettings: 'remoteBot:verification:settings:set',
  listRemoteVerifications: 'remoteBot:verification:list',
  getVerificationDiagnostics: 'verification:diagnostics',
  getRemoteVerificationDiagnostics: 'remoteBot:verification:diagnostics',
  listVerificationTickets: 'verification:tickets',
  listRemoteVerificationTickets: 'remoteBot:verification:tickets',
  listCategories: 'guilds:categories',
  listRemoteCategories: 'remoteBot:guilds:categories',
  getServerLogSettings: 'serverLogs:get',
  setServerLogSettings: 'serverLogs:set',
  getRemoteServerLogSettings: 'remoteBot:serverLogs:get',
  setRemoteServerLogSettings: 'remoteBot:serverLogs:set',
  getMovList: 'movList:get',
  setMovListSettings: 'movList:settings:set',
  updateMovListMembers: 'movList:members:update',
  getRemoteMovList: 'remoteBot:movList:get',
  setRemoteMovListSettings: 'remoteBot:movList:settings:set',
  updateRemoteMovListMembers: 'remoteBot:movList:members:update',
  getVoiceHours: 'voiceHours:get',
  setVoiceHoursSettings: 'voiceHours:set',
  voiceHoursAction: 'voiceHours:action',
  getRemoteVoiceHours: 'remoteBot:voiceHours:get',
  setRemoteVoiceHoursSettings: 'remoteBot:voiceHours:set',
  remoteVoiceHoursAction: 'remoteBot:voiceHours:action',
  getProfileSettings: 'profile:get',
  setProfileSettings: 'profile:set',
  getRemoteProfileSettings: 'remoteBot:profile:get',
  setRemoteProfileSettings: 'remoteBot:profile:set',
  getWeeklyReport: 'weeklyReport:get',
  setWeeklyReportSettings: 'weeklyReport:set',
  weeklyReportAction: 'weeklyReport:action',
  getRemoteWeeklyReport: 'remoteBot:weeklyReport:get',
  setRemoteWeeklyReportSettings: 'remoteBot:weeklyReport:set',
  remoteWeeklyReportAction: 'remoteBot:weeklyReport:action',
  getCalendar: 'calendar:get',
  setCalendarSettings: 'calendar:settings:set',
  saveActivity: 'calendar:activity:save',
  activityAction: 'calendar:activity:action',
  getRemoteCalendar: 'remoteBot:calendar:get',
  setRemoteCalendarSettings: 'remoteBot:calendar:settings:set',
  saveRemoteActivity: 'remoteBot:calendar:activity:save',
  remoteActivityAction: 'remoteBot:calendar:activity:action',
  getLisFilms: 'lisfilms:get',
  setLisFilmsSettings: 'lisfilms:set',
  testLisFilms: 'lisfilms:test',
  searchLisFilms: 'lisfilms:search',
  getRemoteLisFilms: 'remoteBot:lisfilms:get',
  setRemoteLisFilmsSettings: 'remoteBot:lisfilms:set',
  testRemoteLisFilms: 'remoteBot:lisfilms:test',
  searchRemoteLisFilms: 'remoteBot:lisfilms:search',
} as const

/** API exposta no `window.lisdiscord` pelo preload — o único contrato entre a UI e o processo principal. */
export type WindowAction =
  | 'reload'
  | 'devtools'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'fullscreen'
  | 'minimize'
  | 'maximize'
  | 'quit'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'

export interface LisDiscordBridge {
  windowAction(action: WindowAction): Promise<void>
  getPlatform(): Promise<string>
  getAuthState(): Promise<AuthState>
  register(username: string, password: string, remember: boolean): Promise<AuthState>
  login(username: string, password: string, remember: boolean): Promise<AuthState>
  logout(): Promise<void>
  changePassword(current: string, next: string): Promise<void>
  listLoginHistory(): Promise<LoginHistoryEntry[]>
  forgetBotToken(): Promise<void>
  /** Liga o bot com o token guardado na conta (ou espera pela ligação que já estiver a decorrer). */
  autoConnectBot(): Promise<BotStatus>

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

  sendEmbed(guildId: string, channelId: string, embed: EmbedDraft, options?: SendMessageOptions): Promise<SendMessageResult>
  sendRemoteEmbed(guildId: string, channelId: string, embed: EmbedDraft, options?: SendMessageOptions): Promise<SendMessageResult>

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
  removeMovHours(guildId: string, userId: string, seconds: number): Promise<MovPointsEntry[]>
  getMovPointsBoard(guildId: string): Promise<MovPointsBoardConfig>
  setMovPointsBoard(guildId: string, channelId: string | null): Promise<MovPointsBoardConfig>
  resetMovPoints(guildId: string): Promise<MovPointsEntry[]>
  listMovPointsLog(guildId: string): Promise<MovPointsLogEntry[]>
  listCleanLog(guildId: string): Promise<CleanLogEntry[]>
  listRemoteCleanLog(guildId: string): Promise<CleanLogEntry[]>

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
  removeRemoteMovHours(guildId: string, userId: string, seconds: number): Promise<MovPointsEntry[]>
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

  listMovNotices(guildId: string): Promise<MovNotice[]>
  createMovNotice(guildId: string, input: MovNoticeInput): Promise<MovNotice>
  cancelMovNotice(guildId: string, id: string): Promise<MovNotice[]>
  listRemoteMovNotices(guildId: string): Promise<MovNotice[]>
  createRemoteMovNotice(guildId: string, input: MovNoticeInput): Promise<MovNotice>
  cancelRemoteMovNotice(guildId: string, id: string): Promise<MovNotice[]>

  getVerificationSettings(guildId: string): Promise<VerificationSettings>
  setVerificationSettings(guildId: string, settings: VerificationSettings): Promise<VerificationSettings>
  listVerifications(guildId: string): Promise<VerificationEntry[]>
  getRemoteVerificationSettings(guildId: string): Promise<VerificationSettings>
  setRemoteVerificationSettings(guildId: string, settings: VerificationSettings): Promise<VerificationSettings>
  listRemoteVerifications(guildId: string): Promise<VerificationEntry[]>
  getVerificationDiagnostics(guildId: string): Promise<VerificationDiagnostics>
  getRemoteVerificationDiagnostics(guildId: string): Promise<VerificationDiagnostics>
  listVerificationTickets(guildId: string): Promise<VerificationTicket[]>
  listRemoteVerificationTickets(guildId: string): Promise<VerificationTicket[]>
  listCategories(guildId: string): Promise<ChannelPickerEntry[]>
  listRemoteCategories(guildId: string): Promise<ChannelPickerEntry[]>
  getServerLogSettings(guildId: string): Promise<ServerLogSettings>
  setServerLogSettings(guildId: string, settings: ServerLogSettings): Promise<ServerLogSettings>
  getRemoteServerLogSettings(guildId: string): Promise<ServerLogSettings>
  setRemoteServerLogSettings(guildId: string, settings: ServerLogSettings): Promise<ServerLogSettings>

  getMovList(guildId: string): Promise<MovListState>
  setMovListSettings(guildId: string, settings: MovListSettings): Promise<MovListState>
  updateMovListMembers(guildId: string, op: MovListOp): Promise<MovListState>
  getRemoteMovList(guildId: string): Promise<MovListState>
  setRemoteMovListSettings(guildId: string, settings: MovListSettings): Promise<MovListState>
  updateRemoteMovListMembers(guildId: string, op: MovListOp): Promise<MovListState>

  getVoiceHours(guildId: string): Promise<VoiceHoursState>
  setVoiceHoursSettings(guildId: string, settings: VoiceHoursSettings): Promise<VoiceHoursState>
  voiceHoursAction(guildId: string, action: VoiceHoursAction): Promise<VoiceHoursState>
  getRemoteVoiceHours(guildId: string): Promise<VoiceHoursState>
  setRemoteVoiceHoursSettings(guildId: string, settings: VoiceHoursSettings): Promise<VoiceHoursState>
  remoteVoiceHoursAction(guildId: string, action: VoiceHoursAction): Promise<VoiceHoursState>
  getProfileSettings(guildId: string): Promise<ProfileSettings>
  setProfileSettings(guildId: string, settings: ProfileSettings): Promise<ProfileSettings>
  getRemoteProfileSettings(guildId: string): Promise<ProfileSettings>
  setRemoteProfileSettings(guildId: string, settings: ProfileSettings): Promise<ProfileSettings>
  getWeeklyReport(guildId: string): Promise<WeeklyReportState>
  setWeeklyReportSettings(guildId: string, settings: WeeklyReportSettings): Promise<WeeklyReportState>
  weeklyReportAction(guildId: string, action: WeeklyReportAction): Promise<WeeklyReportState>
  getRemoteWeeklyReport(guildId: string): Promise<WeeklyReportState>
  setRemoteWeeklyReportSettings(guildId: string, settings: WeeklyReportSettings): Promise<WeeklyReportState>
  remoteWeeklyReportAction(guildId: string, action: WeeklyReportAction): Promise<WeeklyReportState>

  getCalendar(guildId: string): Promise<CalendarState>
  setCalendarSettings(guildId: string, settings: CalendarSettings): Promise<CalendarState>
  saveActivity(guildId: string, input: ActivityInput): Promise<CalendarState>
  activityAction(guildId: string, action: ActivityAction): Promise<CalendarState>
  getRemoteCalendar(guildId: string): Promise<CalendarState>
  setRemoteCalendarSettings(guildId: string, settings: CalendarSettings): Promise<CalendarState>
  saveRemoteActivity(guildId: string, input: ActivityInput): Promise<CalendarState>
  remoteActivityAction(guildId: string, action: ActivityAction): Promise<CalendarState>

  getLisFilms(): Promise<LisFilmsState>
  setLisFilmsSettings(settings: LisFilmsSettings): Promise<LisFilmsState>
  testLisFilms(): Promise<LisFilmsStatus>
  searchLisFilms(query: string): Promise<LisFilmsHit[]>
  getRemoteLisFilms(): Promise<LisFilmsState>
  setRemoteLisFilmsSettings(settings: LisFilmsSettings): Promise<LisFilmsState>
  testRemoteLisFilms(): Promise<LisFilmsStatus>
  searchRemoteLisFilms(query: string): Promise<LisFilmsHit[]>
}
