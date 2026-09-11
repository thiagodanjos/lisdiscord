import type { ScheduleFrequency } from '../../shared/types'

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  const diffMs = date.getTime() - Date.now()
  const diffMin = Math.round(diffMs / 60_000)

  if (Math.abs(diffMin) < 1) return 'agora mesmo'
  if (Math.abs(diffMin) < 60) return relative(diffMin, 'minuto')
  const diffH = Math.round(diffMin / 60)
  if (Math.abs(diffH) < 24) return relative(diffH, 'hora')
  const diffD = Math.round(diffH / 24)
  return relative(diffD, 'dia')
}

function relative(value: number, unit: string): string {
  const abs = Math.abs(value)
  const plural = abs === 1 ? unit : `${unit}s`
  return value < 0 ? `há ${abs} ${plural}` : `daqui a ${abs} ${plural}`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const FREQUENCY_LABEL: Record<ScheduleFrequency, string> = {
  hourly6: 'A cada 6 horas',
  hourly12: 'A cada 12 horas',
  daily: 'Todos os dias',
  daily3: 'A cada 3 dias',
  weekly: 'Toda a semana',
}
