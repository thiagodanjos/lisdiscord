import { randomUUID } from 'node:crypto'
import type { Activity, CalendarSettings, CustomButton } from '../../shared/types'
import { defaultCalendarSettings } from '../../shared/calendar'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

// Agenda de atividades: definições e atividades por servidor. Atividades terminadas há mais de 60 dias
// saem do ficheiro (o histórico recente fica para a app).

const KEEP_DAYS = 60

interface GuildCalendar {
  settings?: Partial<CalendarSettings>
  activities: Activity[]
  nextNumber: number
}

type Data = Record<string, GuildCalendar>

function readAll(): Data {
  return readJsonFile<Data>(paths.calendarFile, {})
}

function guildOf(data: Data, guildId: string): GuildCalendar {
  data[guildId] ??= { activities: [], nextNumber: 1 }
  data[guildId].activities ??= []
  data[guildId].nextNumber ??= 1
  return data[guildId]
}

function write(data: Data): void {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000
  for (const g of Object.values(data)) g.activities = (g.activities ?? []).filter((a) => new Date(a.startAt).getTime() >= cutoff)
  writeJsonFile(paths.calendarFile, data)
}

export function getCalendarSettings(guildId: string): CalendarSettings {
  const d = defaultCalendarSettings()
  const saved = readAll()[guildId]?.settings ?? {}
  const btn = (key: 'joinButton' | 'unavailableButton' | 'organizeButton' | 'leaveButton'): CustomButton => ({ ...d[key], ...saved[key] })
  return {
    ...d,
    ...saved,
    categories: saved.categories?.length ? saved.categories : d.categories,
    joinButton: btn('joinButton'),
    unavailableButton: btn('unavailableButton'),
    organizeButton: btn('organizeButton'),
    leaveButton: btn('leaveButton'),
  }
}

export function saveCalendarSettings(guildId: string, settings: CalendarSettings): CalendarSettings {
  const data = readAll()
  guildOf(data, guildId).settings = settings
  write(data)
  return getCalendarSettings(guildId)
}

export function setBoardMessageId(guildId: string, messageId: string | null): void {
  const data = readAll()
  const g = guildOf(data, guildId)
  g.settings = { ...g.settings, boardMessageId: messageId }
  write(data)
}

export function listActivities(guildId: string): Activity[] {
  return [...(readAll()[guildId]?.activities ?? [])].sort((a, b) => a.startAt.localeCompare(b.startAt))
}

export function listCalendarGuilds(): string[] {
  return Object.keys(readAll())
}

export function getActivity(guildId: string, idOrNumber: string): Activity | null {
  const clean = idOrNumber.replace(/^#/, '').trim()
  return listActivities(guildId).find((a) => a.id === clean || String(a.number) === clean) ?? null
}

export function createActivity(guildId: string, input: Omit<Activity, 'id' | 'guildId' | 'number' | 'createdAt' | 'updatedAt'>): Activity {
  const data = readAll()
  const g = guildOf(data, guildId)
  const now = new Date().toISOString()
  const activity: Activity = { ...input, id: randomUUID().slice(0, 8), guildId, number: g.nextNumber++, createdAt: now, updatedAt: now }
  g.activities.push(activity)
  write(data)
  return activity
}

/** Aplica uma alteração a uma atividade (lida de fresco — evita perder cliques simultâneos). */
export function updateActivity(guildId: string, id: string, change: (a: Activity) => void): Activity | null {
  const data = readAll()
  const a = guildOf(data, guildId).activities.find((x) => x.id === id)
  if (!a) return null
  change(a)
  a.updatedAt = new Date().toISOString()
  write(data)
  return a
}

export function deleteActivity(guildId: string, id: string): Activity | null {
  const data = readAll()
  const g = guildOf(data, guildId)
  const a = g.activities.find((x) => x.id === id) ?? null
  g.activities = g.activities.filter((x) => x.id !== id)
  write(data)
  return a
}
