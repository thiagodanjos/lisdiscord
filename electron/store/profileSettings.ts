import type { ProfileSettings } from '../../shared/types'
import { defaultProfileSettings } from '../../shared/movFeatures'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

function readAll(): Record<string, Partial<ProfileSettings>> {
  return readJsonFile<Record<string, Partial<ProfileSettings>>>(paths.profileSettingsFile, {})
}

export function getProfileSettings(guildId: string): ProfileSettings {
  const d = defaultProfileSettings()
  const saved = readAll()[guildId] ?? {}
  return {
    ...d,
    ...saved,
    refreshButton: { ...d.refreshButton, ...saved.refreshButton },
    rankingButton: { ...d.rankingButton, ...saved.rankingButton },
    linkButton: { ...d.linkButton, ...saved.linkButton },
  }
}

export function saveProfileSettings(guildId: string, settings: ProfileSettings): ProfileSettings {
  const all = readAll()
  all[guildId] = settings
  writeJsonFile(paths.profileSettingsFile, all)
  return settings
}
