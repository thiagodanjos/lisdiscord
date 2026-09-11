import { ipcMain, type BrowserWindow } from 'electron'
import type {
  AppSettings,
  BackupOptions,
  BackupSummary,
  BotStatus,
  ChannelKind,
  ChannelPickerEntry,
  DiffEntry,
  GuildSummary,
  RestoreOptions,
  ScheduleConfig,
  ScheduleFrequency,
  TranscriptSummary,
} from '../../shared/types'
import { IPC } from '../../shared/ipc'
import { discordManager } from '../discord/client'
import { createBackup } from '../discord/backup'
import { restoreBackup } from '../discord/restore'
import { diffBackups } from '../discord/diff'
import { exportTranscript, newTranscriptId } from '../discord/transcript'
import * as backupsStore from '../store/backups'
import * as transcriptsStore from '../store/transcripts'
import * as schedulesStore from '../store/schedules'
import { getAppSettings, loadToken, openDataDir, saveToken } from '../store/settings'

const CHANNEL_KIND_MAP: Record<number, ChannelKind | undefined> = {
  0: 'text',
  2: 'voice',
  4: 'category',
  5: 'announcement',
  13: 'stage',
  15: 'forum',
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.connectBot, async (_e, token: string): Promise<BotStatus> => {
    const status = await discordManager.connect(token)
    saveToken(token)
    return status
  })

  ipcMain.handle(IPC.disconnectBot, async (): Promise<void> => {
    await discordManager.disconnect()
  })

  ipcMain.handle(IPC.getStatus, async (): Promise<BotStatus> => discordManager.getStatus())

  ipcMain.handle(IPC.listGuilds, async (): Promise<GuildSummary[]> => discordManager.listGuilds())

  ipcMain.handle(IPC.listChannels, async (_e, guildId: string): Promise<ChannelPickerEntry[]> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    await guild.channels.fetch()
    return [...guild.channels.cache.values()]
      .filter((c) => c.isTextBased() && !c.isThread())
      .map((c) => ({ id: c.id, name: c.name, kind: CHANNEL_KIND_MAP[c.type] ?? 'text' }))
  })

  ipcMain.handle(IPC.createBackup, async (_e, guildId: string, options: BackupOptions): Promise<BackupSummary> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const backup = await createBackup(guild, options)
    return backupsStore.saveBackup(backup, options.origin)
  })

  ipcMain.handle(IPC.listBackups, async (): Promise<BackupSummary[]> => backupsStore.listBackups())

  ipcMain.handle(IPC.getBackup, async (_e, id: string) => backupsStore.getBackup(id))

  ipcMain.handle(IPC.deleteBackup, async (_e, id: string): Promise<void> => backupsStore.deleteBackup(id))

  ipcMain.handle(
    IPC.restoreBackup,
    async (_e, backupId: string, targetGuildId: string, options: RestoreOptions): Promise<void> => {
      const backup = backupsStore.getBackup(backupId)
      if (!backup) throw new Error('Backup não encontrado.')
      const guild = await discordManager.getClient().guilds.fetch(targetGuildId)

      await restoreBackup(guild, backup, options, (partial) => {
        getWindow()?.webContents.send(IPC.restoreProgress, { backupId, targetGuildId, ...partial })
      })
    },
  )

  ipcMain.handle(IPC.diffBackups, async (_e, idA: string, idB: string): Promise<DiffEntry[]> => {
    const a = backupsStore.getBackup(idA)
    const b = backupsStore.getBackup(idB)
    if (!a || !b) throw new Error('Um dos backups não foi encontrado.')
    return diffBackups(a, b)
  })

  ipcMain.handle(
    IPC.exportTranscript,
    async (_e, guildId: string, channelId: string, limit: number): Promise<TranscriptSummary> => {
      const guild = await discordManager.getClient().guilds.fetch(guildId)
      const channel = await guild.channels.fetch(channelId)
      if (!channel || !channel.isTextBased()) throw new Error('Este canal não suporta exportação de mensagens.')

      const transcript = await exportTranscript(guild, channel, channel.name, limit)
      return transcriptsStore.saveTranscript(newTranscriptId(), transcript)
    },
  )

  ipcMain.handle(IPC.listTranscripts, async (): Promise<TranscriptSummary[]> => transcriptsStore.listTranscripts())
  ipcMain.handle(IPC.getTranscript, async (_e, id: string) => transcriptsStore.getTranscript(id))
  ipcMain.handle(IPC.deleteTranscript, async (_e, id: string): Promise<void> => transcriptsStore.deleteTranscript(id))

  ipcMain.handle(IPC.listSchedules, async (): Promise<ScheduleConfig[]> => schedulesStore.listSchedules())

  ipcMain.handle(
    IPC.createSchedule,
    async (_e, guildId: string, frequency: ScheduleFrequency, includeBans: boolean): Promise<ScheduleConfig> => {
      const guilds = await discordManager.listGuilds()
      const guild = guilds.find((g) => g.id === guildId)
      if (!guild) throw new Error('Servidor não encontrado.')
      return schedulesStore.createSchedule(guildId, guild.name, frequency, includeBans)
    },
  )

  ipcMain.handle(
    IPC.updateSchedule,
    async (_e, id: string, patch: Partial<Pick<ScheduleConfig, 'enabled' | 'frequency' | 'includeBans'>>) =>
      schedulesStore.updateSchedule(id, patch),
  )

  ipcMain.handle(IPC.deleteSchedule, async (_e, id: string): Promise<void> => schedulesStore.deleteSchedule(id))

  ipcMain.handle(IPC.getSettings, async (): Promise<AppSettings> => getAppSettings())
  ipcMain.handle(IPC.openDataDir, async (): Promise<void> => openDataDir())
}

/** Corre à parte do registo dos handlers: religa agendamentos e, se houver token guardado, liga o bot sozinho. */
export async function bootstrap(): Promise<void> {
  const token = loadToken()
  if (token) {
    await discordManager.connect(token).catch((err) => {
      console.error('Falha ao religar o bot automaticamente:', err)
    })
  }

  schedulesStore.initSchedules(async (schedule) => {
    if (!discordManager.isConnected()) return
    const guild = await discordManager.getClient().guilds.fetch(schedule.guildId).catch(() => null)
    if (!guild) return
    const backup = await createBackup(guild, { includeBans: schedule.includeBans, origin: 'scheduled' })
    backupsStore.saveBackup(backup, 'scheduled')
    backupsStore.pruneOldBackups(schedule.guildId, schedule.keepLast)
  })
}
