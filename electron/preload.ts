import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { LisDiscordBridge } from '../shared/ipc'
import type { RestoreProgressEvent } from '../shared/types'

const bridge: LisDiscordBridge = {
  connectBot: (token) => ipcRenderer.invoke(IPC.connectBot, token),
  disconnectBot: () => ipcRenderer.invoke(IPC.disconnectBot),
  getStatus: () => ipcRenderer.invoke(IPC.getStatus),
  listGuilds: () => ipcRenderer.invoke(IPC.listGuilds),
  listChannels: (guildId) => ipcRenderer.invoke(IPC.listChannels, guildId),

  createBackup: (guildId, options) => ipcRenderer.invoke(IPC.createBackup, guildId, options),
  listBackups: () => ipcRenderer.invoke(IPC.listBackups),
  getBackup: (id) => ipcRenderer.invoke(IPC.getBackup, id),
  deleteBackup: (id) => ipcRenderer.invoke(IPC.deleteBackup, id),
  restoreBackup: (backupId, targetGuildId, options) =>
    ipcRenderer.invoke(IPC.restoreBackup, backupId, targetGuildId, options),
  onRestoreProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: RestoreProgressEvent) => listener(payload)
    ipcRenderer.on(IPC.restoreProgress, handler)
    return () => ipcRenderer.off(IPC.restoreProgress, handler)
  },
  diffBackups: (idA, idB) => ipcRenderer.invoke(IPC.diffBackups, idA, idB),

  exportTranscript: (guildId, channelId, limit) => ipcRenderer.invoke(IPC.exportTranscript, guildId, channelId, limit),
  listTranscripts: () => ipcRenderer.invoke(IPC.listTranscripts),
  getTranscript: (id) => ipcRenderer.invoke(IPC.getTranscript, id),
  deleteTranscript: (id) => ipcRenderer.invoke(IPC.deleteTranscript, id),

  listSchedules: () => ipcRenderer.invoke(IPC.listSchedules),
  createSchedule: (guildId, frequency, includeBans) =>
    ipcRenderer.invoke(IPC.createSchedule, guildId, frequency, includeBans),
  updateSchedule: (id, patch) => ipcRenderer.invoke(IPC.updateSchedule, id, patch),
  deleteSchedule: (id) => ipcRenderer.invoke(IPC.deleteSchedule, id),

  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  openDataDir: () => ipcRenderer.invoke(IPC.openDataDir),

  sendEmbed: (guildId, channelId, embed) => ipcRenderer.invoke(IPC.sendEmbed, guildId, channelId, embed),

  searchMembers: (guildId, query) => ipcRenderer.invoke(IPC.searchMembers, guildId, query),
  banMember: (guildId, userId, reason, deleteMessageSeconds) =>
    ipcRenderer.invoke(IPC.banMember, guildId, userId, reason, deleteMessageSeconds),
  kickMember: (guildId, userId, reason) => ipcRenderer.invoke(IPC.kickMember, guildId, userId, reason),
  timeoutMember: (guildId, userId, durationMs, reason) =>
    ipcRenderer.invoke(IPC.timeoutMember, guildId, userId, durationMs, reason),
  removeTimeout: (guildId, userId) => ipcRenderer.invoke(IPC.removeTimeout, guildId, userId),
  lockChannel: (guildId, channelId) => ipcRenderer.invoke(IPC.lockChannel, guildId, channelId),
  unlockChannel: (guildId, channelId) => ipcRenderer.invoke(IPC.unlockChannel, guildId, channelId),
  listModerationLog: () => ipcRenderer.invoke(IPC.listModerationLog),

  createGiveaway: (guildId, channelId, prize, durationMs, winnerCount) =>
    ipcRenderer.invoke(IPC.createGiveaway, guildId, channelId, prize, durationMs, winnerCount),
  listGiveaways: () => ipcRenderer.invoke(IPC.listGiveaways),
  endGiveaway: (id) => ipcRenderer.invoke(IPC.endGiveaway, id),
  deleteGiveaway: (id) => ipcRenderer.invoke(IPC.deleteGiveaway, id),

  listGames: () => ipcRenderer.invoke(IPC.listGames),
  getGameSettings: (guildId) => ipcRenderer.invoke(IPC.getGameSettings, guildId),
  setGameSettings: (guildId, gameId, enabled) => ipcRenderer.invoke(IPC.setGameSettings, guildId, gameId, enabled),

  listMovPoints: (guildId) => ipcRenderer.invoke(IPC.listMovPoints, guildId),
  addMovPoints: (guildId, userId, amount) => ipcRenderer.invoke(IPC.addMovPoints, guildId, userId, amount),
  removeMovPoints: (guildId, userId, amount) => ipcRenderer.invoke(IPC.removeMovPoints, guildId, userId, amount),
  addMovHours: (guildId, userId, seconds) => ipcRenderer.invoke(IPC.addMovHours, guildId, userId, seconds),
  getMovPointsBoard: (guildId) => ipcRenderer.invoke(IPC.getMovPointsBoard, guildId),
  setMovPointsBoard: (guildId, channelId) => ipcRenderer.invoke(IPC.setMovPointsBoard, guildId, channelId),
}

contextBridge.exposeInMainWorld('lisdiscord', bridge)
