import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { LisDiscordBridge } from '../shared/ipc'
import type { RestoreProgressEvent } from '../shared/types'

const bridge: LisDiscordBridge = {
  getAuthState: () => ipcRenderer.invoke(IPC.getAuthState),
  register: (username, password, remember) => ipcRenderer.invoke(IPC.register, username, password, remember),
  login: (username, password, remember) => ipcRenderer.invoke(IPC.login, username, password, remember),
  logout: () => ipcRenderer.invoke(IPC.logout),
  changePassword: (current, next) => ipcRenderer.invoke(IPC.changePassword, current, next),
  listLoginHistory: () => ipcRenderer.invoke(IPC.listLoginHistory),
  forgetBotToken: () => ipcRenderer.invoke(IPC.forgetBotToken),
  autoConnectBot: () => ipcRenderer.invoke(IPC.autoConnectBot),

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

  sendEmbed: (guildId, channelId, embed, options) => ipcRenderer.invoke(IPC.sendEmbed, guildId, channelId, embed, options),
  sendRemoteEmbed: (guildId, channelId, embed, options) => ipcRenderer.invoke(IPC.sendRemoteEmbed, guildId, channelId, embed, options),

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
  removeMovHours: (guildId, userId, seconds) => ipcRenderer.invoke(IPC.removeMovHours, guildId, userId, seconds),
  getMovPointsBoard: (guildId) => ipcRenderer.invoke(IPC.getMovPointsBoard, guildId),
  setMovPointsBoard: (guildId, channelId) => ipcRenderer.invoke(IPC.setMovPointsBoard, guildId, channelId),
  resetMovPoints: (guildId) => ipcRenderer.invoke(IPC.resetMovPoints, guildId),
  listMovPointsLog: (guildId) => ipcRenderer.invoke(IPC.listMovPointsLog, guildId),
  listCleanLog: (guildId) => ipcRenderer.invoke(IPC.listCleanLog, guildId),
  listRemoteCleanLog: (guildId) => ipcRenderer.invoke(IPC.listRemoteCleanLog, guildId),

  getJustificationSettings: (guildId) => ipcRenderer.invoke(IPC.getJustificationSettings, guildId),
  setJustificationChannel: (guildId, kind, channelId) => ipcRenderer.invoke(IPC.setJustificationChannel, guildId, kind, channelId),

  getRemoteBotConfig: () => ipcRenderer.invoke(IPC.getRemoteBotConfig),
  setRemoteBotConfig: (url, apiKey) => ipcRenderer.invoke(IPC.setRemoteBotConfig, url, apiKey),
  clearRemoteBotConfig: () => ipcRenderer.invoke(IPC.clearRemoteBotConfig),
  testRemoteBotConnection: (url, apiKey) => ipcRenderer.invoke(IPC.testRemoteBotConnection, url, apiKey),
  listRemoteGuilds: () => ipcRenderer.invoke(IPC.listRemoteGuilds),
  listRemoteChannels: (guildId) => ipcRenderer.invoke(IPC.listRemoteChannels, guildId),
  getRemoteJustificationSettings: (guildId) => ipcRenderer.invoke(IPC.getRemoteJustificationSettings, guildId),
  setRemoteJustificationChannel: (guildId, kind, channelId) => ipcRenderer.invoke(IPC.setRemoteJustificationChannel, guildId, kind, channelId),

  listRoles: (guildId) => ipcRenderer.invoke(IPC.listRoles, guildId),
  getMemberProfile: (guildId, userId) => ipcRenderer.invoke(IPC.getMemberProfile, guildId, userId),
  listRoleGoals: (guildId) => ipcRenderer.invoke(IPC.listRoleGoals, guildId),
  setRoleGoal: (guildId, roleId, roleName, pointsGoal, hoursGoal) =>
    ipcRenderer.invoke(IPC.setRoleGoal, guildId, roleId, roleName, pointsGoal, hoursGoal),
  removeRoleGoal: (guildId, roleId) => ipcRenderer.invoke(IPC.removeRoleGoal, guildId, roleId),

  listExcludedMembers: (guildId) => ipcRenderer.invoke(IPC.listExcludedMembers, guildId),
  setMemberExcluded: (guildId, userId, tag, excluded) => ipcRenderer.invoke(IPC.setMemberExcluded, guildId, userId, tag, excluded),

  listEmojis: () => ipcRenderer.invoke(IPC.listEmojis),
  addEmoji: (name, imageDataUrl) => ipcRenderer.invoke(IPC.addEmoji, name, imageDataUrl),
  deleteEmoji: (id) => ipcRenderer.invoke(IPC.deleteEmoji, id),
  listRemoteEmojis: () => ipcRenderer.invoke(IPC.listRemoteEmojis),
  addRemoteEmoji: (name, imageDataUrl) => ipcRenderer.invoke(IPC.addRemoteEmoji, name, imageDataUrl),
  deleteRemoteEmoji: (id) => ipcRenderer.invoke(IPC.deleteRemoteEmoji, id),

  listRemoteMovPoints: (guildId) => ipcRenderer.invoke(IPC.listRemoteMovPoints, guildId),
  addRemoteMovPoints: (guildId, userId, amount) => ipcRenderer.invoke(IPC.addRemoteMovPoints, guildId, userId, amount),
  removeRemoteMovPoints: (guildId, userId, amount) => ipcRenderer.invoke(IPC.removeRemoteMovPoints, guildId, userId, amount),
  addRemoteMovHours: (guildId, userId, seconds) => ipcRenderer.invoke(IPC.addRemoteMovHours, guildId, userId, seconds),
  removeRemoteMovHours: (guildId, userId, seconds) => ipcRenderer.invoke(IPC.removeRemoteMovHours, guildId, userId, seconds),
  getRemoteMovPointsBoard: (guildId) => ipcRenderer.invoke(IPC.getRemoteMovPointsBoard, guildId),
  setRemoteMovPointsBoard: (guildId, channelId) => ipcRenderer.invoke(IPC.setRemoteMovPointsBoard, guildId, channelId),
  resetRemoteMovPoints: (guildId) => ipcRenderer.invoke(IPC.resetRemoteMovPoints, guildId),
  listRemoteMovPointsLog: (guildId) => ipcRenderer.invoke(IPC.listRemoteMovPointsLog, guildId),
  listRemoteExcludedMembers: (guildId) => ipcRenderer.invoke(IPC.listRemoteExcludedMembers, guildId),
  setRemoteMemberExcluded: (guildId, userId, tag, excluded) => ipcRenderer.invoke(IPC.setRemoteMemberExcluded, guildId, userId, tag, excluded),

  searchRemoteMembers: (guildId, query) => ipcRenderer.invoke(IPC.searchRemoteMembers, guildId, query),
  getRemoteMemberProfile: (guildId, userId) => ipcRenderer.invoke(IPC.getRemoteMemberProfile, guildId, userId),
  listRemoteRoles: (guildId) => ipcRenderer.invoke(IPC.listRemoteRoles, guildId),

  listRemoteRoleGoals: (guildId) => ipcRenderer.invoke(IPC.listRemoteRoleGoals, guildId),
  setRemoteRoleGoal: (guildId, roleId, roleName, pointsGoal, hoursGoal) =>
    ipcRenderer.invoke(IPC.setRemoteRoleGoal, guildId, roleId, roleName, pointsGoal, hoursGoal),
  removeRemoteRoleGoal: (guildId, roleId) => ipcRenderer.invoke(IPC.removeRemoteRoleGoal, guildId, roleId),

  getEmbedTemplate: (guildId, kind) => ipcRenderer.invoke(IPC.getEmbedTemplate, guildId, kind),
  setEmbedTemplate: (guildId, kind, draft) => ipcRenderer.invoke(IPC.setEmbedTemplate, guildId, kind, draft),
  resetEmbedTemplate: (guildId, kind) => ipcRenderer.invoke(IPC.resetEmbedTemplate, guildId, kind),
  getRemoteEmbedTemplate: (guildId, kind) => ipcRenderer.invoke(IPC.getRemoteEmbedTemplate, guildId, kind),
  setRemoteEmbedTemplate: (guildId, kind, draft) => ipcRenderer.invoke(IPC.setRemoteEmbedTemplate, guildId, kind, draft),
  resetRemoteEmbedTemplate: (guildId, kind) => ipcRenderer.invoke(IPC.resetRemoteEmbedTemplate, guildId, kind),

  listMovNotices: (guildId) => ipcRenderer.invoke(IPC.listMovNotices, guildId),
  createMovNotice: (guildId, input) => ipcRenderer.invoke(IPC.createMovNotice, guildId, input),
  cancelMovNotice: (guildId, id) => ipcRenderer.invoke(IPC.cancelMovNotice, guildId, id),
  listRemoteMovNotices: (guildId) => ipcRenderer.invoke(IPC.listRemoteMovNotices, guildId),
  createRemoteMovNotice: (guildId, input) => ipcRenderer.invoke(IPC.createRemoteMovNotice, guildId, input),
  cancelRemoteMovNotice: (guildId, id) => ipcRenderer.invoke(IPC.cancelRemoteMovNotice, guildId, id),

  getVerificationSettings: (guildId) => ipcRenderer.invoke(IPC.getVerificationSettings, guildId),
  setVerificationSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setVerificationSettings, guildId, settings),
  listVerifications: (guildId) => ipcRenderer.invoke(IPC.listVerifications, guildId),
  getRemoteVerificationSettings: (guildId) => ipcRenderer.invoke(IPC.getRemoteVerificationSettings, guildId),
  setRemoteVerificationSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setRemoteVerificationSettings, guildId, settings),
  listRemoteVerifications: (guildId) => ipcRenderer.invoke(IPC.listRemoteVerifications, guildId),
  getVerificationDiagnostics: (guildId) => ipcRenderer.invoke(IPC.getVerificationDiagnostics, guildId),
  getRemoteVerificationDiagnostics: (guildId) => ipcRenderer.invoke(IPC.getRemoteVerificationDiagnostics, guildId),
  listVerificationTickets: (guildId) => ipcRenderer.invoke(IPC.listVerificationTickets, guildId),
  listRemoteVerificationTickets: (guildId) => ipcRenderer.invoke(IPC.listRemoteVerificationTickets, guildId),
  listCategories: (guildId) => ipcRenderer.invoke(IPC.listCategories, guildId),
  listRemoteCategories: (guildId) => ipcRenderer.invoke(IPC.listRemoteCategories, guildId),
  getServerLogSettings: (guildId) => ipcRenderer.invoke(IPC.getServerLogSettings, guildId),
  setServerLogSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setServerLogSettings, guildId, settings),
  getRemoteServerLogSettings: (guildId) => ipcRenderer.invoke(IPC.getRemoteServerLogSettings, guildId),
  setRemoteServerLogSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setRemoteServerLogSettings, guildId, settings),
  getMovList: (guildId) => ipcRenderer.invoke(IPC.getMovList, guildId),
  setMovListSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setMovListSettings, guildId, settings),
  updateMovListMembers: (guildId, op) => ipcRenderer.invoke(IPC.updateMovListMembers, guildId, op),
  getRemoteMovList: (guildId) => ipcRenderer.invoke(IPC.getRemoteMovList, guildId),
  setRemoteMovListSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setRemoteMovListSettings, guildId, settings),
  updateRemoteMovListMembers: (guildId, op) => ipcRenderer.invoke(IPC.updateRemoteMovListMembers, guildId, op),
  getVoiceHours: (guildId) => ipcRenderer.invoke(IPC.getVoiceHours, guildId),
  setVoiceHoursSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setVoiceHoursSettings, guildId, settings),
  voiceHoursAction: (guildId, action) => ipcRenderer.invoke(IPC.voiceHoursAction, guildId, action),
  getRemoteVoiceHours: (guildId) => ipcRenderer.invoke(IPC.getRemoteVoiceHours, guildId),
  setRemoteVoiceHoursSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setRemoteVoiceHoursSettings, guildId, settings),
  remoteVoiceHoursAction: (guildId, action) => ipcRenderer.invoke(IPC.remoteVoiceHoursAction, guildId, action),
  getProfileSettings: (guildId) => ipcRenderer.invoke(IPC.getProfileSettings, guildId),
  setProfileSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setProfileSettings, guildId, settings),
  getRemoteProfileSettings: (guildId) => ipcRenderer.invoke(IPC.getRemoteProfileSettings, guildId),
  setRemoteProfileSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setRemoteProfileSettings, guildId, settings),
  getWeeklyReport: (guildId) => ipcRenderer.invoke(IPC.getWeeklyReport, guildId),
  setWeeklyReportSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setWeeklyReportSettings, guildId, settings),
  weeklyReportAction: (guildId, action) => ipcRenderer.invoke(IPC.weeklyReportAction, guildId, action),
  getRemoteWeeklyReport: (guildId) => ipcRenderer.invoke(IPC.getRemoteWeeklyReport, guildId),
  setRemoteWeeklyReportSettings: (guildId, settings) => ipcRenderer.invoke(IPC.setRemoteWeeklyReportSettings, guildId, settings),
  remoteWeeklyReportAction: (guildId, action) => ipcRenderer.invoke(IPC.remoteWeeklyReportAction, guildId, action),
}

contextBridge.exposeInMainWorld('lisdiscord', bridge)
