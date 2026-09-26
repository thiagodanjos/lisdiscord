import { randomUUID } from 'node:crypto'
import type { CleanLogEntry } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

const MAX_ENTRIES = 2000

function readAll(): CleanLogEntry[] {
  return readJsonFile<CleanLogEntry[]>(paths.cleanLogFile, [])
}

export function listCleanLog(guildId: string): CleanLogEntry[] {
  return readAll()
    .filter((e) => e.guildId === guildId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function logClean(entry: Omit<CleanLogEntry, 'id' | 'date'>): CleanLogEntry {
  const record: CleanLogEntry = { id: randomUUID(), date: new Date().toISOString(), ...entry }
  writeJsonFile(paths.cleanLogFile, [record, ...readAll()].slice(0, MAX_ENTRIES))
  return record
}
