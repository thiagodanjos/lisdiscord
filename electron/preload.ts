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
}

contextBridge.exposeInMainWorld('lisdiscord', bridge)
