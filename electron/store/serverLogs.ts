import type { ServerLogSettings } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

export function defaultServerLogSettings(): ServerLogSettings {
  return {
    messageDeleteChannelId: null,
    messageDeleteChannelName: null,
    messageEditChannelId: null,
    messageEditChannelName: null,
    pointsChannelId: null,
    pointsChannelName: null,
    hoursChannelId: null,
    hoursChannelName: null,
    ignoreBots: true,
  }
}

function readAll(): Record<string, ServerLogSettings> {
  return readJsonFile<Record<string, ServerLogSettings>>(paths.serverLogSettingsFile, {})
}

export function getServerLogSettings(guildId: string): ServerLogSettings {
  return { ...defaultServerLogSettings(), ...readAll()[guildId] }
}

export function saveServerLogSettings(guildId: string, settings: ServerLogSettings): ServerLogSettings {
  const all = readAll()
  all[guildId] = settings
  writeJsonFile(paths.serverLogSettingsFile, all)
  return settings
}
