import { randomUUID } from 'node:crypto'
import type { MovNotice, MovNoticeRepeat } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

/** Quantos avisos já terminados (enviados, falhados, cancelados) ficam guardados por servidor, para o histórico da app. */
const MAX_FINISHED_PER_GUILD = 50

const REPEAT_MS: Record<MovNoticeRepeat, number> = { none: 0, daily: 86_400_000, weekly: 7 * 86_400_000 }

function readAll(): MovNotice[] {
  return readJsonFile<MovNotice[]>(paths.movNoticesFile, [])
}

function writeAll(list: MovNotice[]): void {
  // Mantém todos os pendentes e só os últimos N terminados de cada servidor.
  const finishedCount = new Map<string, number>()
  const sorted = [...list].sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt))
  const kept = sorted.filter((n) => {
    if (n.status === 'pending') return true
    const count = (finishedCount.get(n.guildId) ?? 0) + 1
    finishedCount.set(n.guildId, count)
    return count <= MAX_FINISHED_PER_GUILD
  })
  writeJsonFile(paths.movNoticesFile, kept)
}

export function listNotices(guildId: string): MovNotice[] {
  return readAll()
    .filter((n) => n.guildId === guildId)
    .sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (b.status === 'pending' && a.status !== 'pending') return 1
      return a.status === 'pending' ? a.dueAt.localeCompare(b.dueAt) : (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt)
    })
}

export function addNotice(entry: Omit<MovNotice, 'id' | 'createdAt' | 'status'>): MovNotice {
  const notice: MovNotice = { ...entry, id: randomUUID().slice(0, 8), createdAt: new Date().toISOString(), status: 'pending' }
  writeAll([...readAll(), notice])
  return notice
}

export function cancelNotice(guildId: string, id: string): MovNotice | null {
  const all = readAll()
  const notice = all.find((n) => n.id === id && n.guildId === guildId && n.status === 'pending')
  if (!notice) return null
  notice.status = 'cancelled'
  notice.sentAt = new Date().toISOString()
  writeAll(all)
  return notice
}

/** Tira da fila os avisos que já chegaram à hora (marca-os como "a enviar" ao devolver). */
export function takeDueNotices(now = new Date()): MovNotice[] {
  return readAll().filter((n) => n.status === 'pending' && new Date(n.dueAt) <= now)
}

/**
 * Regista o resultado de um envio. Avisos repetidos voltam para a fila com a próxima data (sempre
 * no futuro, mesmo que o bot tenha estado desligado vários dias); os outros ficam no histórico.
 */
export function markNoticeResult(id: string, ok: boolean, error?: string, now = new Date()): MovNotice | null {
  const all = readAll()
  const notice = all.find((n) => n.id === id)
  if (!notice) return null
  notice.sentAt = now.toISOString()
  notice.sentCount = (notice.sentCount ?? 0) + (ok ? 1 : 0)
  notice.error = ok ? undefined : error
  const step = REPEAT_MS[notice.repeat]
  if (step > 0) {
    let next = new Date(notice.dueAt).getTime() + step
    while (next <= now.getTime()) next += step
    notice.dueAt = new Date(next).toISOString()
    notice.status = 'pending'
  } else {
    notice.status = ok ? 'sent' : 'failed'
  }
  writeAll(all)
  return notice
}
