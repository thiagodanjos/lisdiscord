import { ipcMain, type BrowserWindow } from 'electron'
import type {
  AppSettings,
  BackupOptions,
  BackupSummary,
  BotStatus,
  ChannelKind,
  ChannelPickerEntry,
  DiffEntry,
  EmbedDraft,
  GameId,
  GameInfo,
  GameSettings,
  Giveaway,
  GuildSummary,
  MemberSearchResult,
  ModerationLogEntry,
  MovPointsBoardConfig,
  MovPointsEntry,
  RestoreOptions,
  ScheduleConfig,
  ScheduleFrequency,
  TimeoutDuration,
  TranscriptSummary,
} from '../../shared/types'
import { IPC } from '../../shared/ipc'
import { discordManager } from '../discord/client'
import { createBackup } from '../discord/backup'
import { restoreBackup } from '../discord/restore'
import { diffBackups } from '../discord/diff'
import { exportTranscript, newTranscriptId } from '../discord/transcript'
import { sendEmbedMessage } from '../discord/messaging'
import * as moderation from '../discord/moderation'
import { postGiveawayMessage } from '../discord/giveaways'
import { GAMES, registerCommandsForGuild } from '../discord/games'
import { refreshBoard } from '../discord/movcall'
import { concludeGiveawayById, startGiveawayScheduler, startScheduledBackups } from '../discord/automation'
import * as backupsStore from '../store/backups'
import * as transcriptsStore from '../store/transcripts'
import * as schedulesStore from '../store/schedules'
import * as giveawaysStore from '../store/giveaways'
import * as gameSettingsStore from '../store/gameSettings'
import * as moderationLogStore from '../store/moderationLog'
import * as movPointsStore from '../store/movPoints'
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

  // ---- Mensagens ----
  ipcMain.handle(IPC.sendEmbed, async (_e, guildId: string, channelId: string, embed: EmbedDraft): Promise<void> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    await sendEmbedMessage(guild, channelId, embed)
  })

  // ---- Moderação ----
  ipcMain.handle(IPC.searchMembers, async (_e, guildId: string, query: string): Promise<MemberSearchResult[]> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    return moderation.searchMembers(guild, query)
  })

  ipcMain.handle(
    IPC.banMember,
    async (_e, guildId: string, userId: string, reason: string, deleteMessageSeconds: number): Promise<void> => {
      const guild = await discordManager.getClient().guilds.fetch(guildId)
      const member = await guild.members.fetch(userId).catch(() => null)
      await moderation.banMember(guild, userId, reason, deleteMessageSeconds)
      moderationLogStore.logModerationAction({ guildId, guildName: guild.name, action: 'ban', targetTag: member?.user.tag ?? userId, reason: reason || null })
    },
  )

  ipcMain.handle(IPC.kickMember, async (_e, guildId: string, userId: string, reason: string): Promise<void> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const member = await guild.members.fetch(userId)
    const tag = member.user.tag
    await moderation.kickMember(guild, userId, reason)
    moderationLogStore.logModerationAction({ guildId, guildName: guild.name, action: 'kick', targetTag: tag, reason: reason || null })
  })

  ipcMain.handle(
    IPC.timeoutMember,
    async (_e, guildId: string, userId: string, durationMs: TimeoutDuration, reason: string): Promise<void> => {
      const guild = await discordManager.getClient().guilds.fetch(guildId)
      const member = await guild.members.fetch(userId)
      const tag = member.user.tag
      await moderation.timeoutMember(guild, userId, durationMs, reason)
      moderationLogStore.logModerationAction({ guildId, guildName: guild.name, action: 'timeout', targetTag: tag, reason: reason || null })
    },
  )

  ipcMain.handle(IPC.removeTimeout, async (_e, guildId: string, userId: string): Promise<void> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const member = await guild.members.fetch(userId)
    const tag = member.user.tag
    await moderation.removeTimeout(guild, userId)
    moderationLogStore.logModerationAction({ guildId, guildName: guild.name, action: 'removeTimeout', targetTag: tag, reason: null })
  })

  ipcMain.handle(IPC.lockChannel, async (_e, guildId: string, channelId: string): Promise<void> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const channel = await guild.channels.fetch(channelId)
    await moderation.lockChannel(guild, channelId)
    moderationLogStore.logModerationAction({ guildId, guildName: guild.name, action: 'lockChannel', targetTag: `#${channel?.name ?? channelId}`, reason: null })
  })

  ipcMain.handle(IPC.unlockChannel, async (_e, guildId: string, channelId: string): Promise<void> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const channel = await guild.channels.fetch(channelId)
    await moderation.unlockChannel(guild, channelId)
    moderationLogStore.logModerationAction({ guildId, guildName: guild.name, action: 'unlockChannel', targetTag: `#${channel?.name ?? channelId}`, reason: null })
  })

  ipcMain.handle(IPC.listModerationLog, async (): Promise<ModerationLogEntry[]> => moderationLogStore.listModerationLog())

  // ---- Sorteios ----
  ipcMain.handle(
    IPC.createGiveaway,
    async (_e, guildId: string, channelId: string, prize: string, durationMs: number, winnerCount: number): Promise<Giveaway> => {
      const guild = await discordManager.getClient().guilds.fetch(guildId)
      const channel = await guild.channels.fetch(channelId)
      const endsAt = new Date(Date.now() + durationMs).toISOString()
      const messageId = await postGiveawayMessage(guild, channelId, prize, endsAt, winnerCount)
      return giveawaysStore.createGiveaway({
        guildId,
        guildName: guild.name,
        channelId,
        channelName: channel?.name ?? channelId,
        messageId,
        prize,
        winnerCount,
        endsAt,
      })
    },
  )

  ipcMain.handle(IPC.listGiveaways, async (): Promise<Giveaway[]> => giveawaysStore.listGiveaways())

  ipcMain.handle(IPC.endGiveaway, async (_e, id: string): Promise<Giveaway> => concludeGiveawayById(id))

  ipcMain.handle(IPC.deleteGiveaway, async (_e, id: string): Promise<void> => giveawaysStore.deleteGiveaway(id))

  // ---- Jogos ----
  ipcMain.handle(IPC.listGames, async (): Promise<GameInfo[]> => GAMES)
  ipcMain.handle(IPC.getGameSettings, async (_e, guildId: string): Promise<GameSettings> => gameSettingsStore.getGameSettings(guildId))
  ipcMain.handle(IPC.setGameSettings, async (_e, guildId: string, gameId: GameId, enabled: boolean): Promise<GameSettings> => {
    const updated = gameSettingsStore.setGameSetting(guildId, gameId, enabled)
    if (discordManager.isConnected()) {
      const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
      if (guild) await registerCommandsForGuild(guild, gameSettingsStore.enabledGameIds(guildId)).catch(() => undefined)
    }
    return updated
  })

  // ---- Pontos de MOV. Call ----
  ipcMain.handle(IPC.listMovPoints, async (_e, guildId: string): Promise<MovPointsEntry[]> => movPointsStore.getLeaderboard(guildId))

  ipcMain.handle(IPC.addMovPoints, async (_e, guildId: string, userId: string, amount: number): Promise<MovPointsEntry[]> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const member = await guild.members.fetch(userId)
    movPointsStore.addPoints(guildId, userId, member.user.tag, amount)
    await refreshBoard(guild).catch(() => undefined)
    return movPointsStore.getLeaderboard(guildId)
  })

  ipcMain.handle(IPC.removeMovPoints, async (_e, guildId: string, userId: string, amount: number): Promise<MovPointsEntry[]> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const member = await guild.members.fetch(userId)
    movPointsStore.removePoints(guildId, userId, member.user.tag, amount)
    await refreshBoard(guild).catch(() => undefined)
    return movPointsStore.getLeaderboard(guildId)
  })

  ipcMain.handle(IPC.addMovHours, async (_e, guildId: string, userId: string, seconds: number): Promise<MovPointsEntry[]> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const member = await guild.members.fetch(userId)
    movPointsStore.addHours(guildId, userId, member.user.tag, seconds)
    await refreshBoard(guild).catch(() => undefined)
    return movPointsStore.getLeaderboard(guildId)
  })

  ipcMain.handle(IPC.getMovPointsBoard, async (_e, guildId: string): Promise<MovPointsBoardConfig> => movPointsStore.getBoardConfig(guildId))

  ipcMain.handle(IPC.setMovPointsBoard, async (_e, guildId: string, channelId: string | null): Promise<MovPointsBoardConfig> => {
    if (!channelId) return movPointsStore.setBoardChannel(guildId, null, null)
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const channel = await guild.channels.fetch(channelId)
    const config = movPointsStore.setBoardChannel(guildId, channelId, channel?.name ?? channelId)
    await refreshBoard(guild).catch(() => undefined)
    return config
  })
}

/** Corre à parte do registo dos handlers: religa agendamentos e, se houver token guardado, liga o bot sozinho. */
export async function bootstrap(): Promise<void> {
  const token = loadToken()
  if (token) {
    await discordManager.connect(token).catch((err) => {
      console.error('Falha ao religar o bot automaticamente:', err)
    })
  }

  startScheduledBackups()
  startGiveawayScheduler()
}
