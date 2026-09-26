import { ipcMain, type BrowserWindow } from 'electron'
import type { Guild } from 'discord.js'
import type {
  AppSettings,
  AuthState,
  BackupOptions,
  BackupSummary,
  BotEmoji,
  BotStatus,
  ChannelKind,
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
  MovNotice,
  MovNoticeInput,
  VerificationDiagnostics,
  VerificationEntry,
  VerificationSettings,
  LoginHistoryEntry,
  MemberProfile,
  MemberSearchResult,
  ModerationLogEntry,
  MovPointsBoardConfig,
  MovPointsEntry,
  MovPointsLogEntry,
  RemoteBotConfig,
  RestoreOptions,
  RoleGoal,
  RolePickerEntry,
  ScheduleConfig,
  ScheduleFrequency,
  SendMessageOptions,
  SendMessageResult,
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
import { registerCommandsForGuild } from '../discord/games'
import { GAMES } from '../discord/games/catalog'
import { refreshBoard } from '../discord/movcall'
import { getMemberProfile, listGuildRoles } from '../discord/memberProfile'
import { buildFullLeaderboard } from '../discord/leaderboard'
import { concludeGiveawayById, startGiveawayScheduler, startScheduledBackups } from '../discord/automation'
import * as backupsStore from '../store/backups'
import * as transcriptsStore from '../store/transcripts'
import * as schedulesStore from '../store/schedules'
import * as giveawaysStore from '../store/giveaways'
import * as gameSettingsStore from '../store/gameSettings'
import * as moderationLogStore from '../store/moderationLog'
import * as movPointsStore from '../store/movPoints'
import * as movPointsLogStore from '../store/movPointsLog'
import * as cleanLogStore from '../store/cleanLog'
import * as justificationSettingsStore from '../store/justificationSettings'
import { applyJustificationChannel, postJustificationMessage } from '../discord/justifications'
import { addBotEmoji, deleteBotEmoji, listBotEmojis } from '../discord/botEmojis'
import { remoteApi, testRemoteBotConnection } from '../discord/remoteBotClient'
import * as roleGoalsStore from '../store/roleGoals'
import * as excludedMembersStore from '../store/excludedMembers'
import * as remoteBotStore from '../store/remoteBot'
import * as embedTemplatesStore from '../store/embedTemplates'
import { getAppSettings, openDataDir } from '../store/settings'
import * as auth from '../auth/auth'
import * as movNoticesStore from '../store/movNotices'
import * as verificationStore from '../store/verification'
import { createNotice } from '../discord/movNotices'
import { applyVerificationSettings, getVerificationDiagnostics } from '../discord/verification'

/** Identifica no log de pontos ações feitas pela app desktop (em vez de comandos do Discord). */
const DESKTOP_APP_ACTOR = 'Aplicação desktop'

const CHANNEL_KIND_MAP: Record<number, ChannelKind | undefined> = {
  0: 'text',
  2: 'voice',
  4: 'category',
  5: 'announcement',
  13: 'stage',
  15: 'forum',
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // ---- Conta local (SQLite) ----
  ipcMain.handle(IPC.getAuthState, async (): Promise<AuthState> => auth.getAuthState())
  ipcMain.handle(IPC.register, async (_e, username: string, password: string, remember: boolean): Promise<AuthState> =>
    auth.register(username, password, remember),
  )
  ipcMain.handle(IPC.login, async (_e, username: string, password: string, remember: boolean): Promise<AuthState> =>
    auth.login(username, password, remember),
  )
  ipcMain.handle(IPC.logout, async (): Promise<void> => {
    auth.logout()
    await discordManager.disconnect()
  })
  ipcMain.handle(IPC.changePassword, async (_e, current: string, next: string): Promise<void> => auth.changePassword(current, next))
  ipcMain.handle(IPC.listLoginHistory, async (): Promise<LoginHistoryEntry[]> => auth.listLoginHistory())
  ipcMain.handle(IPC.forgetBotToken, async (): Promise<void> => {
    auth.forgetBotToken()
    await discordManager.disconnect()
  })

  // Liga com o token guardado na conta. Se já houver uma ligação a decorrer (ex.: a UI pediu duas
  // vezes), espera por essa em vez de abrir outra — era esta corrida que fazia a app pedir o
  // token de novo a cada arranque: a janela perguntava o estado antes de a ligação terminar.
  let connecting: Promise<BotStatus> | null = null
  ipcMain.handle(IPC.autoConnectBot, async (): Promise<BotStatus> => {
    if (!auth.isLoggedIn()) throw new Error('Inicia sessão primeiro.')
    if (discordManager.isConnected()) return discordManager.getStatus()
    const token = auth.loadBotToken()
    if (!token) throw new Error('Esta conta ainda não tem um token de bot guardado.')
    connecting ??= discordManager.connect(token).finally(() => {
      connecting = null
    })
    return connecting
  })

  ipcMain.handle(IPC.connectBot, async (_e, token: string): Promise<BotStatus> => {
    const status = await discordManager.connect(token)
    auth.saveBotToken(token, status.botTag)
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

  ipcMain.handle(IPC.getSettings, async (): Promise<AppSettings> => ({ ...getAppSettings(), hasToken: auth.getAuthState().hasBotToken }))
  ipcMain.handle(IPC.openDataDir, async (): Promise<void> => openDataDir())

  // ---- Mensagens ----
  ipcMain.handle(
    IPC.sendEmbed,
    async (_e, guildId: string, channelId: string, embed: EmbedDraft, options?: SendMessageOptions): Promise<SendMessageResult> => {
      const guild = await discordManager.getClient().guilds.fetch(guildId)
      return sendEmbedMessage(guild, channelId, embed, options)
    },
  )

  ipcMain.handle(
    IPC.sendRemoteEmbed,
    async (_e, guildId: string, channelId: string, embed: EmbedDraft, options?: SendMessageOptions): Promise<SendMessageResult> => {
      const result = await remoteApi(requireRemoteCredentials()).sendEmbed<SendMessageResult | { ok: true }>(guildId, channelId, embed, options)
      // Um bot remoto ainda não atualizado responde só { ok: true } — continua a contar como enviado.
      return 'url' in result ? result : { url: '', viaWebhook: false }
    },
  )

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
  ipcMain.handle(IPC.listMovPoints, async (_e, guildId: string): Promise<MovPointsEntry[]> => {
    if (!discordManager.isConnected()) return movPointsStore.getLeaderboard(guildId)
    const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
    if (!guild) return movPointsStore.getLeaderboard(guildId)
    return buildFullLeaderboard(guild).catch(() => movPointsStore.getLeaderboard(guildId))
  })

  ipcMain.handle(IPC.addMovPoints, async (_e, guildId: string, userId: string, amount: number): Promise<MovPointsEntry[]> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const member = await guild.members.fetch(userId)
    movPointsStore.addPoints(guildId, userId, member.user.tag, amount, DESKTOP_APP_ACTOR)
    await refreshBoard(guild).catch(() => undefined)
    return buildFullLeaderboard(guild).catch(() => movPointsStore.getLeaderboard(guildId))
  })

  ipcMain.handle(IPC.removeMovPoints, async (_e, guildId: string, userId: string, amount: number): Promise<MovPointsEntry[]> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const member = await guild.members.fetch(userId)
    movPointsStore.removePoints(guildId, userId, member.user.tag, amount, DESKTOP_APP_ACTOR)
    await refreshBoard(guild).catch(() => undefined)
    return buildFullLeaderboard(guild).catch(() => movPointsStore.getLeaderboard(guildId))
  })

  ipcMain.handle(IPC.addMovHours, async (_e, guildId: string, userId: string, seconds: number): Promise<MovPointsEntry[]> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const member = await guild.members.fetch(userId)
    movPointsStore.addHours(guildId, userId, member.user.tag, seconds, DESKTOP_APP_ACTOR)
    await refreshBoard(guild).catch(() => undefined)
    return buildFullLeaderboard(guild).catch(() => movPointsStore.getLeaderboard(guildId))
  })

  ipcMain.handle(IPC.removeMovHours, async (_e, guildId: string, userId: string, seconds: number): Promise<MovPointsEntry[]> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const member = await guild.members.fetch(userId)
    movPointsStore.removeHours(guildId, userId, member.user.tag, seconds, DESKTOP_APP_ACTOR)
    await refreshBoard(guild).catch(() => undefined)
    return buildFullLeaderboard(guild).catch(() => movPointsStore.getLeaderboard(guildId))
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

  ipcMain.handle(IPC.resetMovPoints, async (_e, guildId: string): Promise<MovPointsEntry[]> => {
    movPointsStore.resetGuild(guildId, DESKTOP_APP_ACTOR)
    if (discordManager.isConnected()) {
      const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
      if (guild) {
        await refreshBoard(guild).catch(() => undefined)
        return buildFullLeaderboard(guild).catch(() => movPointsStore.getLeaderboard(guildId))
      }
    }
    return movPointsStore.getLeaderboard(guildId)
  })

  ipcMain.handle(IPC.listMovPointsLog, async (_e, guildId: string): Promise<MovPointsLogEntry[]> => movPointsLogStore.listMovPointsLog(guildId))

  ipcMain.handle(IPC.listCleanLog, async (_e, guildId: string): Promise<CleanLogEntry[]> => cleanLogStore.listCleanLog(guildId))
  ipcMain.handle(IPC.listRemoteCleanLog, async (_e, guildId: string): Promise<CleanLogEntry[]> =>
    remoteApi(requireRemoteCredentials()).listCleanLog(guildId),
  )

  ipcMain.handle(IPC.listExcludedMembers, async (_e, guildId: string): Promise<ExcludedMember[]> => excludedMembersStore.listExcluded(guildId))

  ipcMain.handle(
    IPC.setMemberExcluded,
    async (_e, guildId: string, userId: string, tag: string, excluded: boolean): Promise<ExcludedMember[]> => {
      const updated = excludedMembersStore.setExcluded(guildId, userId, tag, excluded)
      if (discordManager.isConnected()) {
        const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
        if (guild) await refreshBoard(guild).catch(() => undefined)
      }
      return updated
    },
  )

  // ---- Avisos MOV (/avisomov) ----
  ipcMain.handle(IPC.listMovNotices, async (_e, guildId: string): Promise<MovNotice[]> => movNoticesStore.listNotices(guildId))
  ipcMain.handle(IPC.createMovNotice, async (_e, guildId: string, input: MovNoticeInput): Promise<MovNotice> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    const username = auth.getAuthState().user?.username
    return createNotice(guild, input, { id: 'app', tag: username ? `${username} (app)` : 'Aplicação LisDiscord', avatar: null }, 'app')
  })
  ipcMain.handle(IPC.cancelMovNotice, async (_e, guildId: string, id: string): Promise<MovNotice[]> => {
    movNoticesStore.cancelNotice(guildId, id)
    return movNoticesStore.listNotices(guildId)
  })
  ipcMain.handle(IPC.listRemoteMovNotices, async (_e, guildId: string): Promise<MovNotice[]> =>
    remoteApi(requireRemoteCredentials()).listMovNotices(guildId),
  )
  ipcMain.handle(IPC.createRemoteMovNotice, async (_e, guildId: string, input: MovNoticeInput): Promise<MovNotice> =>
    remoteApi(requireRemoteCredentials()).createMovNotice(guildId, { ...input, author: auth.getAuthState().user?.username ?? null }),
  )
  ipcMain.handle(IPC.cancelRemoteMovNotice, async (_e, guildId: string, id: string): Promise<MovNotice[]> =>
    remoteApi(requireRemoteCredentials()).cancelMovNotice(guildId, id),
  )

  // ---- Verificação por foto ----
  ipcMain.handle(IPC.getVerificationSettings, async (_e, guildId: string): Promise<VerificationSettings> => verificationStore.getVerificationSettings(guildId))
  ipcMain.handle(IPC.setVerificationSettings, async (_e, guildId: string, settings: VerificationSettings): Promise<VerificationSettings> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    return applyVerificationSettings(guild, settings)
  })
  ipcMain.handle(IPC.listVerifications, async (_e, guildId: string): Promise<VerificationEntry[]> => verificationStore.listVerifications(guildId))
  ipcMain.handle(IPC.getRemoteVerificationSettings, async (_e, guildId: string): Promise<VerificationSettings> =>
    remoteApi(requireRemoteCredentials()).getVerificationSettings(guildId),
  )
  ipcMain.handle(IPC.setRemoteVerificationSettings, async (_e, guildId: string, settings: VerificationSettings): Promise<VerificationSettings> =>
    remoteApi(requireRemoteCredentials()).setVerificationSettings(guildId, settings),
  )
  ipcMain.handle(IPC.getVerificationDiagnostics, async (_e, guildId: string): Promise<VerificationDiagnostics> =>
    getVerificationDiagnostics(discordManager.isConnected() ? discordManager.getClient() : null, guildId),
  )
  ipcMain.handle(IPC.getRemoteVerificationDiagnostics, async (_e, guildId: string): Promise<VerificationDiagnostics> =>
    remoteApi(requireRemoteCredentials()).getVerificationDiagnostics(guildId),
  )
  ipcMain.handle(IPC.listRemoteVerifications, async (_e, guildId: string): Promise<VerificationEntry[]> =>
    remoteApi(requireRemoteCredentials()).listVerifications(guildId),
  )

  // ---- Justificativas (fixas e diárias) ----
  ipcMain.handle(IPC.getJustificationSettings, async (_e, guildId: string): Promise<JustificationSettings> => justificationSettingsStore.getSettings(guildId))

  ipcMain.handle(
    IPC.setJustificationChannel,
    async (_e, guildId: string, kind: JustificationChannelKind, channelId: string | null): Promise<JustificationSettings> => {
      const guild = discordManager.isConnected() ? await discordManager.getClient().guilds.fetch(guildId).catch(() => null) : null
      return applyJustificationChannel(guild, guildId, kind, channelId)
    },
  )

  // ---- Bot remoto (gerir Justificativas contra o bot autónomo, sem duas ligações em simultâneo) ----
  ipcMain.handle(IPC.getRemoteBotConfig, async (): Promise<RemoteBotConfig> => remoteBotStore.getRemoteBotConfig())

  ipcMain.handle(IPC.setRemoteBotConfig, async (_e, url: string, apiKey: string): Promise<RemoteBotConfig> => {
    remoteBotStore.setRemoteBotConnection(url, apiKey)
    return remoteBotStore.getRemoteBotConfig()
  })

  ipcMain.handle(IPC.clearRemoteBotConfig, async (): Promise<RemoteBotConfig> => {
    remoteBotStore.clearRemoteBotConnection()
    return remoteBotStore.getRemoteBotConfig()
  })

  ipcMain.handle(IPC.testRemoteBotConnection, async (_e, url: string, apiKey: string) => testRemoteBotConnection(url, apiKey))

  function requireRemoteCredentials(): { url: string; apiKey: string } {
    const creds = remoteBotStore.loadRemoteBotCredentials()
    if (!creds) throw new Error('O bot remoto ainda não está configurado — define o endereço e a chave de API.')
    return creds
  }

  ipcMain.handle(IPC.listRemoteGuilds, async (): Promise<GuildSummary[]> => remoteApi(requireRemoteCredentials()).listGuilds())

  ipcMain.handle(IPC.listRemoteChannels, async (_e, guildId: string): Promise<ChannelPickerEntry[]> =>
    remoteApi(requireRemoteCredentials()).listChannels(guildId),
  )

  ipcMain.handle(IPC.getRemoteJustificationSettings, async (_e, guildId: string): Promise<JustificationSettings> =>
    remoteApi(requireRemoteCredentials()).getJustificationSettings(guildId),
  )

  ipcMain.handle(
    IPC.setRemoteJustificationChannel,
    async (_e, guildId: string, kind: JustificationChannelKind, channelId: string | null): Promise<JustificationSettings> =>
      remoteApi(requireRemoteCredentials()).setJustificationChannel(guildId, kind, channelId),
  )

  // ---- Biblioteca de emojis do bot ----
  ipcMain.handle(IPC.listEmojis, async (): Promise<BotEmoji[]> => listBotEmojis(discordManager.getClient()))
  ipcMain.handle(IPC.addEmoji, async (_e, name: string, imageDataUrl: string): Promise<BotEmoji> =>
    addBotEmoji(discordManager.getClient(), name, imageDataUrl),
  )
  ipcMain.handle(IPC.deleteEmoji, async (_e, id: string): Promise<void> => deleteBotEmoji(discordManager.getClient(), id))

  ipcMain.handle(IPC.listRemoteEmojis, async (): Promise<BotEmoji[]> => remoteApi(requireRemoteCredentials()).listEmojis())
  ipcMain.handle(IPC.addRemoteEmoji, async (_e, name: string, imageDataUrl: string): Promise<BotEmoji> =>
    remoteApi(requireRemoteCredentials()).addEmoji(name, imageDataUrl),
  )
  ipcMain.handle(IPC.deleteRemoteEmoji, async (_e, id: string): Promise<void> => remoteApi(requireRemoteCredentials()).deleteEmoji(id))

  // ---- Bot remoto: Pontos de Mov. Call ----
  ipcMain.handle(IPC.listRemoteMovPoints, async (_e, guildId: string): Promise<MovPointsEntry[]> =>
    remoteApi(requireRemoteCredentials()).listMovPoints(guildId),
  )
  ipcMain.handle(IPC.addRemoteMovPoints, async (_e, guildId: string, userId: string, amount: number): Promise<MovPointsEntry[]> =>
    remoteApi(requireRemoteCredentials()).addMovPoints(guildId, userId, amount),
  )
  ipcMain.handle(IPC.removeRemoteMovPoints, async (_e, guildId: string, userId: string, amount: number): Promise<MovPointsEntry[]> =>
    remoteApi(requireRemoteCredentials()).removeMovPoints(guildId, userId, amount),
  )
  ipcMain.handle(IPC.addRemoteMovHours, async (_e, guildId: string, userId: string, seconds: number): Promise<MovPointsEntry[]> =>
    remoteApi(requireRemoteCredentials()).addMovHours(guildId, userId, seconds),
  )
  ipcMain.handle(IPC.removeRemoteMovHours, async (_e, guildId: string, userId: string, seconds: number): Promise<MovPointsEntry[]> =>
    remoteApi(requireRemoteCredentials()).removeMovHours(guildId, userId, seconds),
  )
  ipcMain.handle(IPC.getRemoteMovPointsBoard, async (_e, guildId: string): Promise<MovPointsBoardConfig> =>
    remoteApi(requireRemoteCredentials()).getMovPointsBoard(guildId),
  )
  ipcMain.handle(IPC.setRemoteMovPointsBoard, async (_e, guildId: string, channelId: string | null): Promise<MovPointsBoardConfig> =>
    remoteApi(requireRemoteCredentials()).setMovPointsBoard(guildId, channelId),
  )
  ipcMain.handle(IPC.resetRemoteMovPoints, async (_e, guildId: string): Promise<MovPointsEntry[]> =>
    remoteApi(requireRemoteCredentials()).resetMovPoints(guildId),
  )
  ipcMain.handle(IPC.listRemoteMovPointsLog, async (_e, guildId: string): Promise<MovPointsLogEntry[]> =>
    remoteApi(requireRemoteCredentials()).listMovPointsLog(guildId),
  )
  ipcMain.handle(IPC.listRemoteExcludedMembers, async (_e, guildId: string): Promise<ExcludedMember[]> =>
    remoteApi(requireRemoteCredentials()).listExcludedMembers(guildId),
  )
  ipcMain.handle(
    IPC.setRemoteMemberExcluded,
    async (_e, guildId: string, userId: string, tag: string, excluded: boolean): Promise<ExcludedMember[]> =>
      remoteApi(requireRemoteCredentials()).setMemberExcluded(guildId, userId, tag, excluded),
  )

  ipcMain.handle(IPC.searchRemoteMembers, async (_e, guildId: string, query: string): Promise<MemberSearchResult[]> =>
    remoteApi(requireRemoteCredentials()).searchMembers(guildId, query),
  )
  ipcMain.handle(IPC.getRemoteMemberProfile, async (_e, guildId: string, userId: string): Promise<MemberProfile> =>
    remoteApi(requireRemoteCredentials()).getMemberProfile(guildId, userId),
  )
  ipcMain.handle(IPC.listRemoteRoles, async (_e, guildId: string): Promise<RolePickerEntry[]> =>
    remoteApi(requireRemoteCredentials()).listRoles(guildId),
  )

  ipcMain.handle(IPC.listRemoteRoleGoals, async (_e, guildId: string): Promise<RoleGoal[]> =>
    remoteApi(requireRemoteCredentials()).listRoleGoals(guildId),
  )
  ipcMain.handle(
    IPC.setRemoteRoleGoal,
    async (_e, guildId: string, roleId: string, roleName: string, pointsGoal: number, hoursGoal: number): Promise<RoleGoal[]> =>
      remoteApi(requireRemoteCredentials()).setRoleGoal(guildId, roleId, roleName, pointsGoal, hoursGoal),
  )
  ipcMain.handle(IPC.removeRemoteRoleGoal, async (_e, guildId: string, roleId: string): Promise<RoleGoal[]> =>
    remoteApi(requireRemoteCredentials()).removeRoleGoal(guildId, roleId),
  )

  // ---- Upamentos (metas de cargo) ----
  ipcMain.handle(IPC.listRoles, async (_e, guildId: string): Promise<RolePickerEntry[]> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    return listGuildRoles(guild)
  })

  ipcMain.handle(IPC.getMemberProfile, async (_e, guildId: string, userId: string): Promise<MemberProfile> => {
    const guild = await discordManager.getClient().guilds.fetch(guildId)
    return getMemberProfile(guild, userId)
  })

  ipcMain.handle(IPC.listRoleGoals, async (_e, guildId: string): Promise<RoleGoal[]> => roleGoalsStore.listGoals(guildId))

  ipcMain.handle(
    IPC.setRoleGoal,
    async (_e, guildId: string, roleId: string, roleName: string, pointsGoal: number, hoursGoal: number): Promise<RoleGoal[]> =>
      roleGoalsStore.setGoal(guildId, roleId, roleName, pointsGoal, hoursGoal),
  )

  ipcMain.handle(
    IPC.removeRoleGoal,
    async (_e, guildId: string, roleId: string): Promise<RoleGoal[]> => roleGoalsStore.removeGoal(guildId, roleId),
  )

  // ---- Templates de embed (placar de pontos, inativos, mensagens de justificativas) ----
  ipcMain.handle(IPC.getEmbedTemplate, async (_e, guildId: string, kind: EmbedTemplateKind): Promise<EmbedTemplateResponse> => ({
    draft: embedTemplatesStore.getTemplate(guildId, kind),
    customized: embedTemplatesStore.isCustomized(guildId, kind),
  }))

  ipcMain.handle(
    IPC.setEmbedTemplate,
    async (_e, guildId: string, kind: EmbedTemplateKind, draft: EmbedDraft): Promise<EmbedTemplateResponse> => {
      embedTemplatesStore.setTemplate(guildId, kind, draft)
      if (discordManager.isConnected()) {
        const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
        if (guild) await refreshEmbedTemplateTarget(guild, kind)
      }
      return { draft, customized: true }
    },
  )

  ipcMain.handle(IPC.resetEmbedTemplate, async (_e, guildId: string, kind: EmbedTemplateKind): Promise<EmbedTemplateResponse> => {
    const draft = embedTemplatesStore.resetTemplate(guildId, kind)
    if (discordManager.isConnected()) {
      const guild = await discordManager.getClient().guilds.fetch(guildId).catch(() => null)
      if (guild) await refreshEmbedTemplateTarget(guild, kind)
    }
    return { draft, customized: false }
  })

  ipcMain.handle(IPC.getRemoteEmbedTemplate, async (_e, guildId: string, kind: EmbedTemplateKind): Promise<EmbedTemplateResponse> =>
    remoteApi(requireRemoteCredentials()).getEmbedTemplate(guildId, kind),
  )
  ipcMain.handle(
    IPC.setRemoteEmbedTemplate,
    async (_e, guildId: string, kind: EmbedTemplateKind, draft: EmbedDraft): Promise<EmbedTemplateResponse> =>
      remoteApi(requireRemoteCredentials()).setEmbedTemplate(guildId, kind, draft),
  )
  ipcMain.handle(IPC.resetRemoteEmbedTemplate, async (_e, guildId: string, kind: EmbedTemplateKind): Promise<EmbedTemplateResponse> =>
    remoteApi(requireRemoteCredentials()).resetEmbedTemplate(guildId, kind),
  )
}

/**
 * Depois de guardar ou repor um template, atualiza logo a mensagem já publicada na Discord (o
 * painel de pontos, ou a mensagem instrutiva de justificativas) — sem isto, a alteração só se
 * veria na próxima vez que algo mudasse pontos ou o canal fosse reconfigurado.
 */
async function refreshEmbedTemplateTarget(guild: Guild, kind: EmbedTemplateKind): Promise<void> {
  if (kind === 'pontosBoard') {
    await refreshBoard(guild).catch(() => undefined)
    return
  }
  if (kind === 'justificationFixed' || kind === 'justificationDaily') {
    const type = kind === 'justificationFixed' ? 'fixed' : 'daily'
    const settings = justificationSettingsStore.getSettings(guild.id)
    const channelId = type === 'fixed' ? settings.fixedPostChannelId : settings.dailyPostChannelId
    if (!channelId) return
    const existingMessageId = justificationSettingsStore.getPostMessageId(guild.id, type)
    const messageId = await postJustificationMessage(guild, type, channelId, existingMessageId).catch(() => null)
    if (messageId) justificationSettingsStore.setPostMessageId(guild.id, type, messageId)
  }
}

/**
 * Corre à parte do registo dos handlers: religa os agendamentos. O bot já não liga aqui sozinho —
 * liga depois de a conta entrar (autoConnectBot), com o token guardado nessa conta.
 */
export async function bootstrap(): Promise<void> {
  startScheduledBackups()
  startGiveawayScheduler()
}
