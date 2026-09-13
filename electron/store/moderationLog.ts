import { randomUUID } from 'node:crypto'
import type { ModerationLogEntry } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

const MAX_ENTRIES = 200

function readAll(): ModerationLogEntry[] {
  return readJsonFile<ModerationLogEntry[]>(paths.moderationLogFile, [])
}

export function listModerationLog(): ModerationLogEntry[] {
  return readAll().sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function logModerationAction(entry: Omit<ModerationLogEntry, 'id' | 'date'>): void {
  const all = [{ ...entry, id: randomUUID(), date: new Date().toISOString() }, ...readAll()].slice(0, MAX_ENTRIES)
  writeJsonFile(paths.moderationLogFile, all)
}
