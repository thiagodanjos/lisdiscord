import type { MovListMember, MovListSettings } from '../../shared/types'
import { defaultMovListSettings } from '../../shared/movList'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

// Listagem de Mov Call: definições (canal, botões, textos) e a lista de membros, por servidor.

function readSettings(): Record<string, MovListSettings> {
  return readJsonFile<Record<string, MovListSettings>>(paths.movListSettingsFile, {})
}

export function getMovListSettings(guildId: string): MovListSettings {
  return { ...defaultMovListSettings(), ...readSettings()[guildId] }
}

export function saveMovListSettings(guildId: string, settings: MovListSettings): MovListSettings {
  const all = readSettings()
  all[guildId] = settings
  writeJsonFile(paths.movListSettingsFile, all)
  return settings
}

export function setMovListMessageId(guildId: string, messageId: string | null): void {
  const all = readSettings()
  all[guildId] = { ...defaultMovListSettings(), ...all[guildId], messageId }
  writeJsonFile(paths.movListSettingsFile, all)
}

function readMembers(): Record<string, MovListMember[]> {
  return readJsonFile<Record<string, MovListMember[]>>(paths.movListMembersFile, {})
}

function writeMembers(guildId: string, list: MovListMember[]): MovListMember[] {
  const all = readMembers()
  all[guildId] = list
  writeJsonFile(paths.movListMembersFile, all)
  return list
}

export function listMovListMembers(guildId: string): MovListMember[] {
  return readMembers()[guildId] ?? []
}

/** Junta membros ao fim da lista (pela ordem dada). Os que já lá estavam só atualizam o nome. */
export function addMovListMembers(guildId: string, members: Omit<MovListMember, 'addedAt'>[]): { added: MovListMember[]; already: MovListMember[]; list: MovListMember[] } {
  const list = listMovListMembers(guildId)
  const added: MovListMember[] = []
  const already: MovListMember[] = []
  const now = new Date().toISOString()
  for (const m of members) {
    const existing = list.find((e) => e.userId === m.userId)
    if (existing) {
      existing.username = m.username || existing.username
      existing.displayName = m.displayName || existing.displayName
      if (!already.includes(existing)) already.push(existing)
      continue
    }
    const entry: MovListMember = { ...m, addedAt: now }
    list.push(entry)
    added.push(entry)
  }
  return { added, already, list: writeMembers(guildId, list) }
}

export function removeMovListMembers(guildId: string, userIds: string[]): { removed: MovListMember[]; list: MovListMember[] } {
  const ids = new Set(userIds)
  const list = listMovListMembers(guildId)
  const removed = list.filter((m) => ids.has(m.userId))
  return { removed, list: writeMembers(guildId, list.filter((m) => !ids.has(m.userId))) }
}

/** Sobe/desce um membro na lista (muda o número dele). */
export function moveMovListMember(guildId: string, userId: string, delta: number): MovListMember[] {
  const list = listMovListMembers(guildId)
  const from = list.findIndex((m) => m.userId === userId)
  if (from < 0) return list
  const to = Math.min(list.length - 1, Math.max(0, from + Math.round(delta)))
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  return writeMembers(guildId, list)
}

export function clearMovList(guildId: string): MovListMember[] {
  return writeMembers(guildId, [])
}
