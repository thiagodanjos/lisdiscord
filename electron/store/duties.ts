import type { DutiesSettings } from '../../shared/types'
import { defaultDutiesSettings } from '../../shared/duties'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

// Funções da gestão, por servidor.

function readAll(): Record<string, Partial<DutiesSettings>> {
  return readJsonFile<Record<string, Partial<DutiesSettings>>>(paths.dutiesFile, {})
}

export function getDutiesSettings(guildId: string): DutiesSettings {
  const d = defaultDutiesSettings()
  const saved = readAll()[guildId] ?? {}
  return { ...d, ...saved, duties: saved.duties ?? d.duties, buttons: saved.buttons ?? d.buttons }
}

export function saveDutiesSettings(guildId: string, settings: DutiesSettings): DutiesSettings {
  const all = readAll()
  all[guildId] = settings
  writeJsonFile(paths.dutiesFile, all)
  return getDutiesSettings(guildId)
}

export function setDutiesMessage(guildId: string, channelId: string | null, messageId: string | null): void {
  const all = readAll()
  all[guildId] = { ...all[guildId], channelId: channelId ?? all[guildId]?.channelId ?? null, messageId }
  writeJsonFile(paths.dutiesFile, all)
}
