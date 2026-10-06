import { randomUUID } from 'node:crypto'
import type { Giveaway, GiveawaySettings } from '../../shared/types'
import { defaultGiveawaySettings } from '../../shared/giveaways'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

function readAll(): Giveaway[] {
  return readJsonFile<Giveaway[]>(paths.giveawaysFile, [])
}

function writeAll(giveaways: Giveaway[]): void {
  writeJsonFile(paths.giveawaysFile, giveaways)
}

export function listGiveaways(): Giveaway[] {
  return readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function createGiveaway(input: Omit<Giveaway, 'id' | 'createdAt' | 'ended' | 'winners'> & { id?: string }): Giveaway {
  const giveaway: Giveaway = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString(), ended: false, winners: [] }
  writeAll([giveaway, ...readAll()])
  return giveaway
}

export function markConcluded(id: string, winners: string[], winnerIds?: string[]): Giveaway | null {
  return updateGiveaway(id, (g) => {
    g.ended = true
    g.winners = winners
    if (winnerIds) {
      g.winnerIds = winnerIds
      g.pastWinnerIds = [...new Set([...(g.pastWinnerIds ?? []), ...winnerIds])]
    }
  })
}

/** Aplica uma alteração lida de fresco (evita perder cliques simultâneos no botão Participar). */
export function updateGiveaway(id: string, change: (g: Giveaway) => void): Giveaway | null {
  const all = readAll()
  const g = all.find((x) => x.id === id)
  if (!g) return null
  change(g)
  writeAll(all)
  return g
}

export function deleteGiveaway(id: string): void {
  writeAll(readAll().filter((g) => g.id !== id))
}

export function getGiveaway(id: string): Giveaway | null {
  return readAll().find((g) => g.id === id) ?? null
}

// ---- Definições por servidor ----

function readSettings(): Record<string, Partial<GiveawaySettings>> {
  return readJsonFile<Record<string, Partial<GiveawaySettings>>>(paths.giveawaySettingsFile, {})
}

export function getGiveawaySettings(guildId: string): GiveawaySettings {
  const d = defaultGiveawaySettings()
  const saved = readSettings()[guildId] ?? {}
  return {
    ...d,
    ...saved,
    joinButton: { ...d.joinButton, ...saved.joinButton },
    participantsButton: { ...d.participantsButton, ...saved.participantsButton },
    rerollButton: { ...d.rerollButton, ...saved.rerollButton },
    start: { ...d.start, ...saved.start },
    ended: { ...d.ended, ...saved.ended },
    winners: { ...d.winners, ...saved.winners },
    reroll: { ...d.reroll, ...saved.reroll },
    noEntrants: { ...d.noEntrants, ...saved.noEntrants },
    winnerDm: { ...d.winnerDm, ...saved.winnerDm },
    participants: { ...d.participants, ...saved.participants },
    wizard: {
      ...d.wizard,
      ...saved.wizard,
      writeButton: { ...d.wizard.writeButton, ...saved.wizard?.writeButton },
      backButton: { ...d.wizard.backButton, ...saved.wizard?.backButton },
      cancelButton: { ...d.wizard.cancelButton, ...saved.wizard?.cancelButton },
    },
  }
}

export function saveGiveawaySettings(guildId: string, settings: GiveawaySettings): GiveawaySettings {
  const all = readSettings()
  all[guildId] = settings
  writeJsonFile(paths.giveawaySettingsFile, all)
  return getGiveawaySettings(guildId)
}
