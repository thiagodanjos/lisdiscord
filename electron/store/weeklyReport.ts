import type { WeeklyReportSettings } from '../../shared/types'
import { defaultWeeklyReportSettings } from '../../shared/movFeatures'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

// Relatório semanal: definições e os números do período em curso (desde o último relatório),
// somados a cada alteração de pontos/horas — não depende do log, que só guarda as últimas entradas.

export interface PeriodStats {
  points: number
  seconds: number
  tag: string
}

interface GuildReport {
  settings?: Partial<WeeklyReportSettings>
  periodStart: string
  lastSentAt: string | null
  /** Para não mandar duas vezes no mesmo dia agendado. */
  lastSentSlot: string | null
  stats: Record<string, PeriodStats>
  voiceSessions: number
}

type Data = Record<string, GuildReport>

function readAll(): Data {
  return readJsonFile<Data>(paths.weeklyReportFile, {})
}

function guildOf(data: Data, guildId: string): GuildReport {
  data[guildId] ??= { periodStart: new Date().toISOString(), lastSentAt: null, lastSentSlot: null, stats: {}, voiceSessions: 0 }
  data[guildId].stats ??= {}
  data[guildId].voiceSessions ??= 0
  return data[guildId]
}

export function getWeeklyReportSettings(guildId: string): WeeklyReportSettings {
  const d = defaultWeeklyReportSettings()
  const saved = readAll()[guildId]?.settings ?? {}
  return {
    ...d,
    ...saved,
    copyButton: { ...d.copyButton, ...saved.copyButton },
    rankingButton: { ...d.rankingButton, ...saved.rankingButton },
    linkButton: { ...d.linkButton, ...saved.linkButton },
  }
}

export function saveWeeklyReportSettings(guildId: string, settings: WeeklyReportSettings): WeeklyReportSettings {
  const data = readAll()
  guildOf(data, guildId).settings = settings
  writeJsonFile(paths.weeklyReportFile, data)
  return settings
}

export function getReportPeriod(guildId: string): { periodStart: string; lastSentAt: string | null; lastSentSlot: string | null; stats: Record<string, PeriodStats>; voiceSessions: number } {
  const data = readAll()
  const g = data[guildId]
  if (!g) return { periodStart: new Date().toISOString(), lastSentAt: null, lastSentSlot: null, stats: {}, voiceSessions: 0 }
  return { periodStart: g.periodStart, lastSentAt: g.lastSentAt, lastSentSlot: g.lastSentSlot, stats: g.stats ?? {}, voiceSessions: g.voiceSessions ?? 0 }
}

export function listReportGuilds(): string[] {
  return Object.entries(readAll())
    .filter(([, g]) => g.settings?.enabled)
    .map(([id]) => id)
}

/** Soma pontos/horas ao período em curso (negativos para remoções; nunca abaixo de 0). */
export function addPeriodStats(guildId: string, userId: string, tag: string, points: number, seconds: number): void {
  const data = readAll()
  const g = guildOf(data, guildId)
  const s = (g.stats[userId] ??= { points: 0, seconds: 0, tag })
  s.tag = tag || s.tag
  s.points = Math.max(0, s.points + points)
  s.seconds = Math.max(0, s.seconds + seconds)
  writeJsonFile(paths.weeklyReportFile, data)
}

export function countVoiceSession(guildId: string): void {
  const data = readAll()
  guildOf(data, guildId).voiceSessions += 1
  writeJsonFile(paths.weeklyReportFile, data)
}

/** Fecha o período (depois de mandar o relatório, ou à mão) e começa um novo. */
export function resetPeriod(guildId: string, sent: { at: string; slot: string | null } | null): void {
  const data = readAll()
  const g = guildOf(data, guildId)
  g.periodStart = new Date().toISOString()
  g.stats = {}
  g.voiceSessions = 0
  if (sent) {
    g.lastSentAt = sent.at
    g.lastSentSlot = sent.slot
  }
  writeJsonFile(paths.weeklyReportFile, data)
}
