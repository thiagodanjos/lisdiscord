import { safeStorage } from 'electron'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { AuthState, AuthUser, LoginHistoryEntry } from '../../shared/types'
import { execute, queryAll, queryOne } from '../db/database'
import { clearToken, loadToken } from '../store/settings'

const SESSION_DAYS = 30
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/

interface UserRow extends Record<string, unknown> {
  id: number
  username: string
  password_hash: string
  password_salt: string
  created_at: string
  last_login_at: string | null
}

/** Quem tem a sessão aberta neste momento (só no processo principal — a UI pergunta por IPC). */
let currentUserId: number | null = null

function toUser(row: UserRow): AuthUser {
  return { id: row.id, username: row.username, createdAt: row.created_at, lastLoginAt: row.last_login_at }
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

function verifyPassword(password: string, row: UserRow): boolean {
  const expected = Buffer.from(row.password_hash, 'hex')
  const actual = Buffer.from(hashPassword(password, row.password_salt), 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function now(): string {
  return new Date().toISOString()
}

export function getAuthState(): AuthState {
  const hasAccount = Boolean(queryOne('SELECT id FROM users LIMIT 1'))
  if (currentUserId === null) {
    // Sessão "manter sessão iniciada" ainda válida → entra sozinho.
    const session = queryOne<{ user_id: number }>('SELECT user_id FROM sessions WHERE expires_at > ? ORDER BY created_at DESC LIMIT 1', [now()])
    if (session) {
      currentUserId = session.user_id
      execute('UPDATE users SET last_login_at = ? WHERE id = ?', [now(), session.user_id])
    }
  }
  const row = currentUserId === null ? null : queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [currentUserId])
  if (!row) currentUserId = null
  return {
    hasAccount,
    user: row ? toUser(row) : null,
    hasBotToken: row ? hasBotToken(row.id) : false,
  }
}

export function register(username: string, password: string, remember: boolean): AuthState {
  const name = username.trim()
  if (!USERNAME_PATTERN.test(name)) throw new Error('O nome de utilizador tem de ter 3 a 32 caracteres: letras, números, _ . ou -')
  if (password.length < 6) throw new Error('A palavra-passe tem de ter pelo menos 6 caracteres.')
  if (queryOne('SELECT id FROM users WHERE username = ?', [name])) throw new Error('Já existe uma conta com esse nome.')

  const salt = randomBytes(16).toString('hex')
  const id = execute('INSERT INTO users (username, password_hash, password_salt, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)', [
    name,
    hashPassword(password, salt),
    salt,
    now(),
    now(),
  ])
  startSession(id, name, remember)
  migrateLegacyToken(id)
  return getAuthState()
}

export function login(username: string, password: string, remember: boolean): AuthState {
  const row = queryOne<UserRow>('SELECT * FROM users WHERE username = ?', [username.trim()])
  const ok = Boolean(row && verifyPassword(password, row))
  execute('INSERT INTO login_history (user_id, username, success, created_at) VALUES (?, ?, ?, ?)', [row?.id ?? null, username.trim(), ok ? 1 : 0, now()])
  if (!row || !ok) throw new Error('Nome de utilizador ou palavra-passe errados.')

  execute('UPDATE users SET last_login_at = ? WHERE id = ?', [now(), row.id])
  startSession(row.id, row.username, remember, false)
  migrateLegacyToken(row.id)
  return getAuthState()
}

function startSession(userId: number, username: string, remember: boolean, logHistory = true): void {
  currentUserId = userId
  execute('DELETE FROM sessions WHERE user_id = ? OR expires_at <= ?', [userId, now()])
  if (remember) {
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()
    execute('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [randomBytes(32).toString('hex'), userId, now(), expires])
  }
  if (logHistory) execute('INSERT INTO login_history (user_id, username, success, created_at) VALUES (?, ?, 1, ?)', [userId, username, now()])
}

export function logout(): void {
  if (currentUserId !== null) execute('DELETE FROM sessions WHERE user_id = ?', [currentUserId])
  currentUserId = null
}

export function isLoggedIn(): boolean {
  return currentUserId !== null
}

export function changePassword(current: string, next: string): void {
  const row = currentUserId === null ? null : queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [currentUserId])
  if (!row) throw new Error('Não tens sessão iniciada.')
  if (!verifyPassword(current, row)) throw new Error('A palavra-passe atual está errada.')
  if (next.length < 6) throw new Error('A nova palavra-passe tem de ter pelo menos 6 caracteres.')
  const salt = randomBytes(16).toString('hex')
  execute('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?', [hashPassword(next, salt), salt, row.id])
}

export function listLoginHistory(): LoginHistoryEntry[] {
  if (currentUserId === null) return []
  return queryAll<{ username: string; success: number; created_at: string }>(
    'SELECT username, success, created_at FROM login_history WHERE user_id = ? ORDER BY id DESC LIMIT 20',
    [currentUserId],
  ).map((r) => ({ username: r.username, success: r.success === 1, date: r.created_at }))
}

// ---- Token do bot, guardado por conta ----

function hasBotToken(userId: number): boolean {
  return Boolean(queryOne('SELECT user_id FROM bot_credentials WHERE user_id = ?', [userId]))
}

export function saveBotToken(token: string, botTag: string | null): void {
  if (currentUserId === null) return
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O sistema operativo não disponibiliza encriptação segura para guardar o token.')
  }
  execute(
    `INSERT INTO bot_credentials (user_id, token_encrypted, bot_tag, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET token_encrypted = excluded.token_encrypted, bot_tag = excluded.bot_tag, updated_at = excluded.updated_at`,
    [currentUserId, new Uint8Array(safeStorage.encryptString(token)), botTag, now()],
  )
}

export function loadBotToken(): string | null {
  if (currentUserId === null) return null
  const row = queryOne<{ token_encrypted: Uint8Array }>('SELECT token_encrypted FROM bot_credentials WHERE user_id = ?', [currentUserId])
  if (!row) return null
  try {
    return safeStorage.decryptString(Buffer.from(row.token_encrypted))
  } catch {
    return null
  }
}

export function forgetBotToken(): void {
  if (currentUserId !== null) execute('DELETE FROM bot_credentials WHERE user_id = ?', [currentUserId])
}

/** Versões antigas guardavam o token num ficheiro solto (token.enc) — passa-o para a conta e apaga o ficheiro. */
function migrateLegacyToken(userId: number): void {
  if (hasBotToken(userId)) return
  const legacy = loadToken()
  if (!legacy) return
  saveBotToken(legacy, null)
  clearToken()
}
