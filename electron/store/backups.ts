import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { BackupData, BackupSummary } from '../../shared/types'
import { paths } from './paths'

/** Forma como um backup fica gravado em disco: os dados + o metadado de origem. */
type StoredBackup = BackupData & { origin: BackupSummary['origin'] }

function filePath(id: string): string {
  return path.join(paths.backupsDir, `${id}.json`)
}

export function saveBackup(backup: BackupData, origin: BackupSummary['origin']): BackupSummary {
  const file = filePath(backup.id)
  const stored: StoredBackup = { ...backup, origin }
  writeFileSync(file, JSON.stringify(stored, null, 2), 'utf-8')
  return toSummary(stored, statSync(file).size)
}

export function listBackups(): BackupSummary[] {
  if (!existsSync(paths.backupsDir)) return []
  const files = readdirSync(paths.backupsDir).filter((f) => f.endsWith('.json'))

  const summaries = files.map((file) => {
    const full = path.join(paths.backupsDir, file)
    const stored = JSON.parse(readFileSync(full, 'utf-8')) as StoredBackup
    return toSummary(stored, statSync(full).size)
  })

  return summaries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function getBackup(id: string): BackupData | null {
  const file = filePath(id)
  if (!existsSync(file)) return null
  const stored = JSON.parse(readFileSync(file, 'utf-8')) as StoredBackup
  const { origin, ...backup } = stored
  void origin // fica só no ficheiro em disco; a app usa sempre BackupData sem este campo
  return backup
}

export function deleteBackup(id: string): void {
  const file = filePath(id)
  if (existsSync(file)) unlinkSync(file)
}

export function pruneOldBackups(guildId: string, keepLast: number): void {
  const guildBackups = listBackups()
    .filter((b) => b.guildId === guildId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  for (const old of guildBackups.slice(keepLast)) {
    deleteBackup(old.id)
  }
}

function toSummary(backup: StoredBackup, sizeBytes: number): BackupSummary {
  return {
    id: backup.id,
    createdAt: backup.createdAt,
    guildId: backup.guildId,
    guildName: backup.guildName,
    guildIconUrl: backup.guildIconUrl,
    channelCount: backup.channels.length,
    roleCount: backup.roles.length,
    emojiCount: backup.emojis.length,
    banCount: backup.bans.length,
    memberCountAtBackup: backup.memberCountAtBackup,
    sizeBytes,
    origin: backup.origin ?? 'manual',
  }
}
