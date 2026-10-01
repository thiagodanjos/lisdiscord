import { randomUUID } from 'node:crypto'
import type { VoiceHoursSettings, VoiceSessionRecord } from '../../shared/types'
import { defaultVoiceHoursSettings } from '../../shared/movFeatures'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

// Horas automáticas: definições, sessões em curso (gravadas a cada minuto — sobrevivem a um
// reinício do bot), histórico das sessões e quanto cada membro já ganhou hoje (limite diário).

const MAX_HISTORY_PER_GUILD = 300

export interface ActiveSession {
  userId: string
  tag: string
  channelId: string
  channelName: string
  startedAt: string
  /** Última vez que o bot viu a pessoa a contar. */
  lastSeenAt: string
  /** Segundos que contaram (pausas — sozinho, mutado… — não entram). */
  seconds: number
}

interface GuildData {
  settings?: VoiceHoursSettings
  active: Record<string, ActiveSession>
  history: VoiceSessionRecord[]
  /** `YYYY-MM-DD` → userId → segundos creditados nesse dia. */
  daily: Record<string, Record<string, number>>
}

type Data = Record<string, GuildData>

function readAll(): Data {
  return readJsonFile<Data>(paths.voiceHoursFile, {})
}

function guildOf(data: Data, guildId: string): GuildData {
  data[guildId] ??= { active: {}, history: [], daily: {} }
  data[guildId].active ??= {}
  data[guildId].history ??= []
  data[guildId].daily ??= {}
  return data[guildId]
}

export function getVoiceHoursSettings(guildId: string): VoiceHoursSettings {
  return { ...defaultVoiceHoursSettings(), ...readAll()[guildId]?.settings }
}

export function saveVoiceHoursSettings(guildId: string, settings: VoiceHoursSettings): VoiceHoursSettings {
  const data = readAll()
  guildOf(data, guildId).settings = settings
  writeJsonFile(paths.voiceHoursFile, data)
  return settings
}

export function listGuildsWithVoiceHours(): string[] {
  return Object.entries(readAll())
    .filter(([, g]) => g.settings?.enabled || Object.keys(g.active ?? {}).length > 0)
    .map(([id]) => id)
}

export function getActiveSessions(guildId: string): Record<string, ActiveSession> {
  return readAll()[guildId]?.active ?? {}
}

/** Grava o estado de todas as sessões em curso de um servidor (uma escrita por minuto). */
export function saveActiveSessions(guildId: string, active: Record<string, ActiveSession>): void {
  const data = readAll()
  guildOf(data, guildId).active = active
  writeJsonFile(paths.voiceHoursFile, data)
}

export function dayKey(date: Date, timeZone = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function creditedToday(guildId: string, userId: string, now = new Date()): number {
  return readAll()[guildId]?.daily?.[dayKey(now)]?.[userId] ?? 0
}

/** Regista uma sessão terminada no histórico (e soma ao dia, se foi creditada). */
export function recordSession(guildId: string, session: Omit<VoiceSessionRecord, 'id' | 'guildId'>): VoiceSessionRecord {
  const data = readAll()
  const g = guildOf(data, guildId)
  const record: VoiceSessionRecord = { ...session, id: randomUUID().slice(0, 8), guildId }
  g.history = [record, ...g.history].slice(0, MAX_HISTORY_PER_GUILD)
  if (record.credited) {
    const key = dayKey(new Date(record.endedAt))
    g.daily[key] ??= {}
    g.daily[key][record.userId] = (g.daily[key][record.userId] ?? 0) + record.seconds
    // Só guarda os últimos dias.
    const keep = Object.keys(g.daily).sort().slice(-3)
    g.daily = Object.fromEntries(keep.map((k) => [k, g.daily[k]]))
  }
  writeJsonFile(paths.voiceHoursFile, data)
  return record
}

export function listSessionHistory(guildId: string): VoiceSessionRecord[] {
  return readAll()[guildId]?.history ?? []
}
