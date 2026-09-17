import { safeStorage } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import type { RemoteBotConfig } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

interface StoredRemoteBot {
  url: string | null
}

function readStored(): StoredRemoteBot {
  return { url: null, ...readJsonFile<Partial<StoredRemoteBot>>(paths.remoteBotFile, {}) }
}

/** A chave de API é guardada encriptada, tal como o token do bot — dá acesso de gestão ao bot remoto a quem a tiver. */
export function getRemoteBotConfig(): RemoteBotConfig {
  return { url: readStored().url, hasApiKey: existsSync(paths.remoteBotKeyFile) }
}

export function setRemoteBotConnection(url: string, apiKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O sistema operativo não disponibiliza encriptação segura para guardar a chave.')
  }
  writeJsonFile(paths.remoteBotFile, { url })
  writeFileSync(paths.remoteBotKeyFile, safeStorage.encryptString(apiKey))
}

export function clearRemoteBotConnection(): void {
  writeJsonFile(paths.remoteBotFile, { url: null })
  if (existsSync(paths.remoteBotKeyFile)) unlinkSync(paths.remoteBotKeyFile)
}

export function loadRemoteBotCredentials(): { url: string; apiKey: string } | null {
  const { url } = readStored()
  if (!url || !existsSync(paths.remoteBotKeyFile)) return null
  try {
    const apiKey = safeStorage.decryptString(readFileSync(paths.remoteBotKeyFile))
    return { url, apiKey }
  } catch {
    return null
  }
}
