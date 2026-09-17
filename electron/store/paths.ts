import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * A pasta de dados vem de três sítios, por esta ordem: a variável de
 * ambiente `LISDISCORD_DATA_DIR` (usada pelo bot autónomo em servidor),
 * o `app.getPath('userData')` do Electron quando estamos mesmo a correr
 * dentro dele, ou `./data` como último recurso (nunca deve acontecer em
 * produção, só é útil em scripts avulsos).
 *
 * `electron` só é pedido dentro do ramo `process.versions.electron` — em
 * Node puro (o bot autónomo em Docker) esse pacote pode nem estar
 * instalado (é devDependency), por isso uma `import` estática no topo do
 * ficheiro rebentaria já no arranque. `createRequire` adia a resolução
 * para dentro da condição, onde nunca chega a ser tentada fora do Electron.
 */
function resolveRoot(): string {
  if (process.env.LISDISCORD_DATA_DIR) return process.env.LISDISCORD_DATA_DIR
  if (process.versions.electron) {
    const require = createRequire(import.meta.url)
    const { app } = require('electron') as typeof import('electron')
    return app.getPath('userData')
  }
  return path.join(process.cwd(), 'data')
}

const root = resolveRoot()

export const paths = {
  root,
  backupsDir: path.join(root, 'backups'),
  transcriptsDir: path.join(root, 'transcripts'),
  settingsFile: path.join(root, 'settings.json'),
  schedulesFile: path.join(root, 'schedules.json'),
  tokenFile: path.join(root, 'token.enc'),
  giveawaysFile: path.join(root, 'giveaways.json'),
  gameSettingsFile: path.join(root, 'game-settings.json'),
  moderationLogFile: path.join(root, 'moderation-log.json'),
  economyFile: path.join(root, 'economy.json'),
  movPointsFile: path.join(root, 'mov-points.json'),
  movPointsLogFile: path.join(root, 'mov-points-log.json'),
  roleGoalsFile: path.join(root, 'role-goals.json'),
  excludedMembersFile: path.join(root, 'excluded-members.json'),
  justificationSettingsFile: path.join(root, 'justification-settings.json'),
}

export function ensureDataDirs(): void {
  mkdirSync(paths.backupsDir, { recursive: true })
  mkdirSync(paths.transcriptsDir, { recursive: true })
}
