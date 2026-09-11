import { safeStorage, shell } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import type { AppSettings } from '../../shared/types'
import { paths } from './paths'

interface StoredSettings {
  theme: 'dark' | 'light'
}

function readStored(): StoredSettings {
  if (!existsSync(paths.settingsFile)) return { theme: 'dark' }
  try {
    return { theme: 'dark', ...JSON.parse(readFileSync(paths.settingsFile, 'utf-8')) }
  } catch {
    return { theme: 'dark' }
  }
}

function writeStored(settings: StoredSettings): void {
  writeFileSync(paths.settingsFile, JSON.stringify(settings, null, 2), 'utf-8')
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
