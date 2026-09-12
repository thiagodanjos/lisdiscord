import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const root = app.getPath('userData')

export const paths = {
  root,
  backupsDir: path.join(root, 'backups'),
  transcriptsDir: path.join(root, 'transcripts'),
  settingsFile: path.join(root, 'settings.json'),
  schedulesFile: path.join(root, 'schedules.json'),
  tokenFile: path.join(root, 'token.enc'),
  giveawaysFile: path.join(root, 'giveaways.json'),
  gameSettingsFile: path.join(root, 'game-settings.json'),
  moderationLogFile: path.join(root, 'moderation-log.json'),
  economyFile: path.join(root, 'economy.json'),
  movPointsFile: path.join(root, 'mov-points.json'),
}

export function ensureDataDirs(): void {
  mkdirSync(paths.backupsDir, { recursive: true })
  mkdirSync(paths.transcriptsDir, { recursive: true })
}
