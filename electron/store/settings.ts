import { safeStorage, shell } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import type { AppSettings } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

interface StoredSettings {
  theme: 'dark' | 'light'
}

function readStored(): StoredSettings {
  return { theme: 'dark', ...readJsonFile<Partial<StoredSettings>>(paths.settingsFile, {}) }
}

function writeStored(settings: StoredSettings): void {
  writeJsonFile(paths.settingsFile, settings)
}

export function getAppSettings(): AppSettings {
  return { hasToken: hasStoredToken(), theme: readStored().theme, dataDir: paths.root }
}

export function setTheme(theme: 'dark' | 'light'): void {
  writeStored({ ...readStored(), theme })
}

export function hasStoredToken(): boolean {
  return existsSync(paths.tokenFile)
}

export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O sistema operativo não disponibiliza encriptação segura para guardar o token.')
  }
  writeFileSync(paths.tokenFile, safeStorage.encryptString(token))
}

export function loadToken(): string | null {
  if (!hasStoredToken()) return null
  try {
    return safeStorage.decryptString(readFileSync(paths.tokenFile))
  } catch {
    return null
  }
}

export function clearToken(): void {
  if (existsSync(paths.tokenFile)) unlinkSync(paths.tokenFile)
}

export async function openDataDir(): Promise<void> {
  await shell.openPath(paths.root)
}
