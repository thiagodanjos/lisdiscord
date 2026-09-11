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
}

export function ensureDataDirs(): void {
  mkdirSync(paths.backupsDir, { recursive: true })
  mkdirSync(paths.transcriptsDir, { recursive: true })
}
