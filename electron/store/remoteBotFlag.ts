import { existsSync } from 'node:fs'
import { readJsonFile } from './fileStore'
import { paths } from './paths'

/**
 * Diz se esta instalação está ligada a um bot remoto (sem precisar do `electron`, para poder ser
 * usado também pelo cliente da Discord partilhado com o bot autónomo). Com um bot remoto, é ele que
 * atende o Discord — a ligação local da app fica passiva, para não responder duas vezes a tudo.
 */
export function isRemoteBotConfigured(): boolean {
  try {
    const stored = readJsonFile<{ url?: string | null }>(paths.remoteBotFile, {})
    return Boolean(stored.url) && existsSync(paths.remoteBotKeyFile)
  } catch {
    return false
  }
}
