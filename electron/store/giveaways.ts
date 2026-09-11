import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Giveaway } from '../../shared/types'
import { paths } from './paths'

function readAll(): Giveaway[] {
  if (!existsSync(paths.giveawaysFile)) return []
  try {
    return JSON.parse(readFileSync(paths.giveawaysFile, 'utf-8')) as Giveaway[]
  } catch {
    return []
  }
}

function writeAll(giveaways: Giveaway[]): void {
  writeFileSync(paths.giveawaysFile, JSON.stringify(giveaways, null, 2), 'utf-8')
}

export function listGiveaways(): Giveaway[] {
  return readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function createGiveaway(input: Omit<Giveaway, 'id' | 'createdAt' | 'ended' | 'winners'>): Giveaway {
  const giveaway: Giveaway = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), ended: false, winners: [] }
  writeAll([giveaway, ...readAll()])
  return giveaway
}

export function markConcluded(id: string, winners: string[]): Giveaway | null {
  const all = readAll()
  const idx = all.findIndex((g) => g.id === id)
  if (idx === -1) return null
  all[idx] = { ...all[idx], ended: true, winners }
  writeAll(all)
  return all[idx]
}

export function deleteGiveaway(id: string): void {
  writeAll(readAll().filter((g) => g.id !== id))
}

export function getGiveaway(id: string): Giveaway | null {
  return readAll().find((g) => g.id === id) ?? null
}
