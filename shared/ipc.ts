import type {
  AppSettings,
  BackupData,
  BackupOptions,
  BackupSummary,
  BotStatus,
  ChannelPickerEntry,
  DiffEntry,
  GuildSummary,
  RestoreOptions,
  RestoreProgressEvent,
  ScheduleConfig,
  ScheduleFrequency,
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
}
