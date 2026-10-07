import { createSign } from 'node:crypto'
import type { GoogleServiceAccount } from '../store/memberRegistry'
import type { SheetTab } from '../../shared/memberSheet'

// Cliente mínimo do Google Sheets (sem bibliotecas): conta de serviço → token (JWT RS256) → API v4.
// Só mexe nas abas que o bot gere; as outras abas da planilha ficam como estão.

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const API = 'https://sheets.googleapis.com/v4/spreadsheets'
let cached: { email: string; token: string; expires: number } | null = null

const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64url')

async function accessToken(key: GoogleServiceAccount): Promise<string> {
  if (cached && cached.email === key.client_email && cached.expires > Date.now() + 60_000) return cached.token
  const now = Math.floor(Date.now() / 1000)
  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token'
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }))}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string }
  if (!res.ok || !data.access_token) throw new Error(`O Google recusou a chave da conta de serviço: ${data.error_description ?? data.error ?? res.status}`)
  cached = { email: key.client_email, token: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return data.access_token
}

async function call<T>(key: GoogleServiceAccount, url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await accessToken(key)
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } }
  if (!res.ok) {
    if (res.status === 403 || res.status === 404) {
      throw new Error(`Sem acesso à planilha — partilha-a (como Editor) com ${key.client_email}. (${data.error?.message ?? res.status})`)
    }
    throw new Error(`Erro do Google Sheets: ${data.error?.message ?? res.status}`)
  }
  return data
}

interface SpreadsheetMeta {
  properties: { title: string }
  sheets: { properties: { sheetId: number; title: string } }[]
}

export async function spreadsheetInfo(key: GoogleServiceAccount, spreadsheetId: string): Promise<{ title: string; tabs: string[] }> {
  const meta = await call<SpreadsheetMeta>(key, `${API}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties`)
  return { title: meta.properties.title, tabs: meta.sheets.map((s) => s.properties.title) }
}

const quoteTab = (name: string) => `'${name.replace(/'/g, "''")}'`

/** Reescreve as abas do bot (cria as que faltam, com o cabeçalho a negrito e congelado). */
export async function writeTabs(key: GoogleServiceAccount, spreadsheetId: string, tabs: SheetTab[]): Promise<{ title: string; rows: number }> {
  const id = encodeURIComponent(spreadsheetId)
  const meta = await call<SpreadsheetMeta>(key, `${API}/${id}?fields=properties.title,sheets.properties`)
  const existing = new Set(meta.sheets.map((s) => s.properties.title))
  const missing = tabs.filter((t) => !existing.has(t.name))
  if (missing.length) {
    const created = await call<{ replies: { addSheet?: { properties: { sheetId: number } } }[] }>(key, `${API}/${id}:batchUpdate`, {
      method: 'POST',
      body: { requests: missing.map((t) => ({ addSheet: { properties: { title: t.name, gridProperties: { frozenRowCount: 1 } } } })) },
    })
    const ids = created.replies.map((r) => r.addSheet?.properties.sheetId).filter((x): x is number => typeof x === 'number')
    if (ids.length) {
      await call(key, `${API}/${id}:batchUpdate`, {
        method: 'POST',
        body: {
          requests: ids.map((sheetId) => ({
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold',
            },
          })),
        },
      }).catch(() => undefined)
    }
  }
  await call(key, `${API}/${id}/values:batchClear`, { method: 'POST', body: { ranges: tabs.map((t) => quoteTab(t.name)) } })
  // RAW: o que vem do Discord nunca é interpretado como fórmula (um nome "=…" fica texto).
  await call(key, `${API}/${id}/values:batchUpdate`, {
    method: 'POST',
    body: { valueInputOption: 'RAW', data: tabs.map((t) => ({ range: `${quoteTab(t.name)}!A1`, values: t.rows })) },
  })
  return { title: meta.properties.title, rows: tabs.reduce((n, t) => n + Math.max(0, t.rows.length - 1), 0) }
}
