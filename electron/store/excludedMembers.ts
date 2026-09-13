import type { ExcludedMember } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

type ExcludedMembersData = Record<string, ExcludedMember[]>

function readAll(): ExcludedMembersData {
  return readJsonFile<ExcludedMembersData>(paths.excludedMembersFile, {})
}

function writeAll(data: ExcludedMembersData): void {
  writeJsonFile(paths.excludedMembersFile, data)
}

export function listExcluded(guildId: string): ExcludedMember[] {
  return readAll()[guildId] ?? []
}

/** Adiciona ou remove alguém da lista de membros escondidos do ranking de Mov. Call. */
export function setExcluded(guildId: string, userId: string, tag: string, excluded: boolean): ExcludedMember[] {
  const data = readAll()
  const current = data[guildId] ?? []
  const without = current.filter((m) => m.userId !== userId)
  const updated = excluded ? [...without, { userId, tag }] : without
  data[guildId] = updated
  writeAll(data)
  return updated
}
