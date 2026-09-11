import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { ModerationLogEntry } from '../../shared/types'
import { paths } from './paths'

const MAX_ENTRIES = 200

function readAll(): ModerationLogEntry[] {
  if (!existsSync(paths.moderationLogFile)) return []
  try {
    return JSON.parse(readFileSync(paths.moderationLogFile, 'utf-8')) as ModerationLogEntry[]
  } catch {
    return []
  }
}

export function listModerationLog(): ModerationLogEntry[] {
  return readAll().sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function logModerationAction(entry: Omit<ModerationLogEntry, 'id' | 'date'>): void {
  const all = [{ ...entry, id: randomUUID(), date: new Date().toISOString() }, ...readAll()].slice(0, MAX_ENTRIES)
  writeFileSync(paths.moderationLogFile, JSON.stringify(all, null, 2), 'utf-8')
}
