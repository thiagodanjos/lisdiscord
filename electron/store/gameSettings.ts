import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { GameId, GameSettings } from '../../shared/types'
import { GAMES } from '../discord/games'
import { paths } from './paths'

type StoredSettings = Record<string, GameSettings>

function defaultSettings(): GameSettings {
  const enabled = {} as Record<GameId, boolean>
  for (const g of GAMES) enabled[g.id] = true
  return { enabled }
}

function readAll(): StoredSettings {
  if (!existsSync(paths.gameSettingsFile)) return {}
  try {
    return JSON.parse(readFileSync(paths.gameSettingsFile, 'utf-8')) as StoredSettings
  } catch {
    return {}
  }
}

function writeAll(settings: StoredSettings): void {
  writeFileSync(paths.gameSettingsFile, JSON.stringify(settings, null, 2), 'utf-8')
}

export function getGameSettings(guildId: string): GameSettings {
  return readAll()[guildId] ?? defaultSettings()
}

export function setGameSetting(guildId: string, gameId: GameId, enabled: boolean): GameSettings {
  const all = readAll()
  const current = all[guildId] ?? defaultSettings()
  const updated: GameSettings = { enabled: { ...current.enabled, [gameId]: enabled } }
  all[guildId] = updated
  writeAll(all)
  return updated
}

export function enabledGameIds(guildId: string): GameId[] {
  const settings = getGameSettings(guildId)
  return GAMES.map((g) => g.id).filter((id) => settings.enabled[id])
}
