import { randomUUID } from 'node:crypto'
import type { MovPointsLogAction, MovPointsLogEntry } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

const MAX_ENTRIES = 1000

function readAll(): MovPointsLogEntry[] {
  return readJsonFile<MovPointsLogEntry[]>(paths.movPointsLogFile, [])
}

export function listMovPointsLog(guildId: string): MovPointsLogEntry[] {
  return readAll()
    .filter((e) => e.guildId === guildId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function logMovPointsAction(entry: {
  guildId: string
  action: MovPointsLogAction
  targetUserId: string | null
  targetTag: string | null
  amount: number | null
  newTotal: number | null
  actorTag: string
  note?: string | null
}): void {
  const record: MovPointsLogEntry = {
    id: randomUUID(),
    date: new Date().toISOString(),
    guildId: entry.guildId,
    action: entry.action,
    targetUserId: entry.targetUserId,
    targetTag: entry.targetTag,
    amount: entry.amount,
    newTotal: entry.newTotal,
    actorTag: entry.actorTag,
    note: entry.note ?? null,
  }
  const all = [record, ...readAll()].slice(0, MAX_ENTRIES)
  writeJsonFile(paths.movPointsLogFile, all)
}
