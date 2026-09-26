import { createHash } from 'node:crypto'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

// A Discord só deixa criar ~200 comandos por dia (por aplicação e por servidor). Reenviar a lista
// inteira a cada arranque do bot gastava esse limite à toa — e, quando estourava, o pedido ficava à
// espera do reset (horas), prendendo a ligação. Guardamos um "resumo" da última lista enviada para
// só voltar a registar quando os comandos mudam mesmo.

type SyncData = Record<string, string>

export function commandsHash(defs: unknown): string {
  return createHash('sha1').update(JSON.stringify(defs)).digest('hex')
}

function readAll(): SyncData {
  try {
    return readJsonFile<SyncData>(paths.commandSyncFile, {})
  } catch {
    return {}
  }
}

export function isUpToDate(key: string, hash: string): boolean {
  return readAll()[key] === hash
}

export function markSynced(key: string, hash: string): void {
  writeJsonFile(paths.commandSyncFile, { ...readAll(), [key]: hash })
}
