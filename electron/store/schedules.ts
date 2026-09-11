import cron, { type ScheduledTask } from 'node-cron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { ScheduleConfig, ScheduleFrequency } from '../../shared/types'
import { paths } from './paths'

const CRON_BY_FREQUENCY: Record<ScheduleFrequency, string> = {
  hourly6: '0 */6 * * *',
  hourly12: '0 */12 * * *',
  daily: '0 3 * * *',
  daily3: '0 3 */3 * *',
  weekly: '0 3 * * 0',
}

const jobs = new Map<string, ScheduledTask>()
let onTick: ((schedule: ScheduleConfig) => Promise<void>) | null = null

function readAll(): ScheduleConfig[] {
  if (!existsSync(paths.schedulesFile)) return []
  try {
    return JSON.parse(readFileSync(paths.schedulesFile, 'utf-8')) as ScheduleConfig[]
  } catch {
    return []
  }
}

function writeAll(schedules: ScheduleConfig[]): void {
  writeFileSync(paths.schedulesFile, JSON.stringify(schedules, null, 2), 'utf-8')
}

function startJob(schedule: ScheduleConfig): void {
  stopJob(schedule.id)
  if (!schedule.enabled) return

  const task = cron.schedule(
    CRON_BY_FREQUENCY[schedule.frequency],
    async () => {
      const current = readAll().find((s) => s.id === schedule.id)
      if (!current || !onTick) return
      await onTick(current)
      patch(schedule.id, { lastRunAt: new Date().toISOString() })
    },
    { name: schedule.id },
  )
  jobs.set(schedule.id, task)

  const next = task.getNextRun()
  if (next) patch(schedule.id, { nextRunAt: next.toISOString() })
}

function stopJob(id: string): void {
  const task = jobs.get(id)
  if (task) {
    task.stop()
    jobs.delete(id)
  }
}

function patch(id: string, fields: Partial<ScheduleConfig>): void {
  const all = readAll()
  const idx = all.findIndex((s) => s.id === id)
  if (idx === -1) return
  all[idx] = { ...all[idx], ...fields }
  writeAll(all)
}

/** Chamado uma vez no arranque da app: religa os agendamentos guardados. onRun corre um backup real. */
export function initSchedules(onRun: (schedule: ScheduleConfig) => Promise<void>): void {
  onTick = onRun
  for (const schedule of readAll()) startJob(schedule)
}

export function listSchedules(): ScheduleConfig[] {
  return readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function createSchedule(
  guildId: string,
  guildName: string,
  frequency: ScheduleFrequency,
  includeBans: boolean,
): ScheduleConfig {
  const schedule: ScheduleConfig = {
    id: randomUUID(),
    guildId,
    guildName,
    frequency,
    includeBans,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    nextRunAt: null,
    keepLast: 10,
  }
  writeAll([...readAll(), schedule])
  startJob(schedule)
  return readAll().find((s) => s.id === schedule.id) as ScheduleConfig
}

export function updateSchedule(
  id: string,
  fields: Partial<Pick<ScheduleConfig, 'enabled' | 'frequency' | 'includeBans'>>,
): ScheduleConfig {
  patch(id, fields)
  const updated = readAll().find((s) => s.id === id)
  if (!updated) throw new Error('Agendamento não encontrado.')
  startJob(updated)
  return updated
}

export function deleteSchedule(id: string): void {
  stopJob(id)
  writeAll(readAll().filter((s) => s.id !== id))
}
