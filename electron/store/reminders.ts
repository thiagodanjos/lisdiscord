import { randomUUID } from 'node:crypto'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

export interface Reminder {
  id: string
  userId: string
  guildId: string
  channelId: string
  text: string
  createdAt: string
  dueAt: string
}

function readAll(): Reminder[] {
  return readJsonFile<Reminder[]>(paths.remindersFile, [])
}

function writeAll(list: Reminder[]): void {
  writeJsonFile(paths.remindersFile, list)
}

export function addReminder(entry: Omit<Reminder, 'id' | 'createdAt'>): Reminder {
  const reminder: Reminder = { id: randomUUID().slice(0, 8), createdAt: new Date().toISOString(), ...entry }
  writeAll([...readAll(), reminder])
  return reminder
}

export function listUserReminders(guildId: string, userId: string): Reminder[] {
  return readAll()
    .filter((r) => r.guildId === guildId && r.userId === userId)
    .sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1))
}

export function removeReminder(id: string, userId: string): boolean {
  const all = readAll()
  const next = all.filter((r) => !(r.id === id && r.userId === userId))
  if (next.length === all.length) return false
  writeAll(next)
  return true
}

/** Tira da lista e devolve os lembretes que já chegaram à hora. */
export function takeDueReminders(now = new Date()): Reminder[] {
  const all = readAll()
  const due = all.filter((r) => new Date(r.dueAt) <= now)
  if (due.length > 0) writeAll(all.filter((r) => new Date(r.dueAt) > now))
  return due
}
