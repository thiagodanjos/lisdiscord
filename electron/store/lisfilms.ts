import type { LisFilmsSettings } from '../../shared/types'
import { defaultLisFilmsSettings } from '../../shared/lisfilms'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

// Definições da integração com o LisFilms — uma só para o bot (a API do site é a mesma para todos os
// servidores); os embeds de cada resposta são personalizados por servidor nos templates.

export function getLisFilmsSettings(): LisFilmsSettings {
  const d = defaultLisFilmsSettings()
  const saved = readJsonFile<Partial<LisFilmsSettings>>(paths.lisfilmsFile, {})
  return { ...d, ...saved, commands: { ...d.commands, ...saved.commands }, linkButton: { ...d.linkButton, ...saved.linkButton } }
}

export function saveLisFilmsSettings(settings: LisFilmsSettings): LisFilmsSettings {
  writeJsonFile(paths.lisfilmsFile, settings)
  return getLisFilmsSettings()
}
