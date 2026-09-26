import { randomUUID } from 'node:crypto'
import type { VerificationEntry, VerificationSettings } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

/** Quantas verificações já decididas ficam no histórico de cada servidor. */
const MAX_HISTORY_PER_GUILD = 200

export const DEFAULT_PING_TEXT = '{cargo}'

export function defaultVerificationSettings(): VerificationSettings {
  return {
    channelId: null,
    channelName: null,
    pingRoleId: null,
    pingRoleName: null,
    pingText: DEFAULT_PING_TEXT,
    approverRoleIds: [],
    addRoleIds: [],
    removeRoleIds: [],
    logChannelId: null,
    logChannelName: null,
    deleteNonImage: true,
  }
}

// ---- Definições ----

function readSettings(): Record<string, VerificationSettings> {
  return readJsonFile<Record<string, VerificationSettings>>(paths.verificationSettingsFile, {})
}

export function getVerificationSettings(guildId: string): VerificationSettings {
  return { ...defaultVerificationSettings(), ...readSettings()[guildId] }
}

export function saveVerificationSettings(guildId: string, settings: VerificationSettings): VerificationSettings {
  const all = readSettings()
  all[guildId] = settings
  writeJsonFile(paths.verificationSettingsFile, all)
  return settings
}

/** Servidor cujo canal de verificação é este canal (ou null). */
export function guildForVerificationChannel(guildId: string, channelId: string): VerificationSettings | null {
  const settings = readSettings()[guildId]
  return settings?.channelId === channelId ? { ...defaultVerificationSettings(), ...settings } : null
}

// ---- Pedidos (pendentes + histórico) ----

function readEntries(): VerificationEntry[] {
  return readJsonFile<VerificationEntry[]>(paths.verificationsFile, [])
}

function writeEntries(list: VerificationEntry[]): void {
  const perGuild = new Map<string, number>()
  const sorted = [...list].sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt))
  const kept = sorted.filter((e) => {
    if (e.status === 'pending') return true
    const n = (perGuild.get(e.guildId) ?? 0) + 1
    perGuild.set(e.guildId, n)
    return n <= MAX_HISTORY_PER_GUILD
  })
  writeJsonFile(paths.verificationsFile, kept)
}

export function listVerifications(guildId: string): VerificationEntry[] {
  return readEntries()
    .filter((e) => e.guildId === guildId)
    .sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (b.status === 'pending' && a.status !== 'pending') return 1
      return (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt)
    })
}

export function addPending(entry: Omit<VerificationEntry, 'id' | 'createdAt' | 'status'>): VerificationEntry {
  const created: VerificationEntry = { ...entry, id: randomUUID().slice(0, 8), createdAt: new Date().toISOString(), status: 'pending' }
  writeEntries([...readEntries(), created])
  return created
}

export function findPendingByMessage(embedMessageId: string): VerificationEntry | null {
  return readEntries().find((e) => e.status === 'pending' && e.embedMessageId === embedMessageId) ?? null
}

export function findPendingByUser(guildId: string, userId: string): VerificationEntry | null {
  return readEntries().find((e) => e.status === 'pending' && e.guildId === guildId && e.userId === userId) ?? null
}

/** Remove um pedido pendente sem o pôr no histórico (ex.: foi substituído por uma foto nova). */
export function dropPending(id: string): void {
  writeEntries(readEntries().filter((e) => e.id !== id))
}

export function decide(
  id: string,
  status: 'approved' | 'rejected',
  moderator: { id: string; tag: string },
  roles: { added: string[]; removed: string[] },
): VerificationEntry | null {
  const all = readEntries()
  const entry = all.find((e) => e.id === id && e.status === 'pending')
  if (!entry) return null
  entry.status = status
  entry.decidedAt = new Date().toISOString()
  entry.moderatorId = moderator.id
  entry.moderatorTag = moderator.tag
  entry.rolesAdded = roles.added
  entry.rolesRemoved = roles.removed
  writeEntries(all)
  return entry
}
