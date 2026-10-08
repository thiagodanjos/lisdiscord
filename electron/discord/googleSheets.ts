import { createSign } from 'node:crypto'
import type { GoogleServiceAccount } from '../store/memberRegistry'
import type { SheetTab } from '../../shared/memberSheet'

// Cliente mínimo do Google Sheets (sem bibliotecas): conta de serviço → token (JWT RS256) → API v4.
// Só mexe nas abas que o bot gere (marcadas com uma etiqueta invisível); as outras abas da
// planilha — mesmo com o mesmo nome — ficam como estão.

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
  sheets: { properties: { sheetId: number; title: string }; developerMetadata?: { metadataKey?: string }[] }[]
}

// Etiqueta (metadados de programador do Google, invisíveis na planilha) que marca as abas do bot.
// Uma aba com o mesmo nome mas sem etiqueta é de outra pessoa — nunca é apagada.
const OWNER_KEY = 'lisdiscord'
const META_FIELDS = 'properties.title,sheets(properties(sheetId,title),developerMetadata(metadataKey))'

export async function spreadsheetInfo(key: GoogleServiceAccount, spreadsheetId: string): Promise<{ title: string; tabs: string[] }> {
  const meta = await call<SpreadsheetMeta>(key, `${API}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties`)
  return { title: meta.properties.title, tabs: meta.sheets.map((s) => s.properties.title) }
}

const quoteTab = (name: string) => `'${name.replace(/'/g, "''")}'`
const sameRow = (a: unknown[] = [], b: unknown[] = []) => a.length === b.length && a.every((v, i) => String(v) === String(b[i]))

type TabCheck = { name: string; sheetId: number | null; state: 'new' | 'mine' | 'adopt' | 'foreign' }

/** Para cada aba que o bot quer escrever: nova, já dele, livre para adotar (vazia ou com o cabeçalho
 * do bot) ou de outra pessoa (com dados — fica intocada). */
async function checkTabs(key: GoogleServiceAccount, id: string, tabs: SheetTab[]): Promise<{ title: string; checks: TabCheck[] }> {
  const meta = await call<SpreadsheetMeta>(key, `${API}/${id}?fields=${encodeURIComponent(META_FIELDS)}`)
  const byName = new Map(meta.sheets.map((s) => [s.properties.title, s]))
  const checks: TabCheck[] = []
  for (const t of tabs) {
    const sheet = byName.get(t.name)
    if (!sheet) {
      checks.push({ name: t.name, sheetId: null, state: 'new' })
      continue
    }
    const sheetId = sheet.properties.sheetId
    if (sheet.developerMetadata?.some((m) => m.metadataKey === OWNER_KEY)) {
      checks.push({ name: t.name, sheetId, state: 'mine' })
      continue
    }
    // Sem etiqueta: só se adota se estiver vazia ou se a 1.ª linha for exatamente o cabeçalho do bot.
    const first = await call<{ valueRanges?: { values?: unknown[][] }[] }>(key, `${API}/${id}/values:batchGet?ranges=${encodeURIComponent(`${quoteTab(t.name)}!1:1`)}`)
    const firstRow = first.valueRanges?.[0]?.values?.[0]
    let state: TabCheck['state']
    if (firstRow?.length) state = sameRow(firstRow, t.rows[0]) ? 'adopt' : 'foreign'
    else {
      const all = await call<{ valueRanges?: { values?: unknown[][] }[] }>(key, `${API}/${id}/values:batchGet?ranges=${encodeURIComponent(quoteTab(t.name))}`)
      state = all.valueRanges?.[0]?.values?.some((r) => r.some((c) => String(c ?? '').trim())) ? 'foreign' : 'adopt'
    }
    checks.push({ name: t.name, sheetId, state })
  }
  return { title: meta.properties.title, checks }
}

/** Nomes das abas do bot que já existem na planilha com dados de outra pessoa. */
export async function foreignTabs(key: GoogleServiceAccount, spreadsheetId: string, tabs: SheetTab[]): Promise<{ title: string; tabs: string[]; foreign: string[] }> {
  const id = encodeURIComponent(spreadsheetId)
  const [{ title, checks }, info] = await Promise.all([checkTabs(key, id, tabs), spreadsheetInfo(key, spreadsheetId)])
  return { title, tabs: info.tabs, foreign: checks.filter((c) => c.state === 'foreign').map((c) => c.name) }
}

/** Reescreve as abas do bot (cria as que faltam, com o cabeçalho a negrito e congelado). Abas com o
 * mesmo nome que já tinham dados de outra pessoa não são tocadas — vêm em `skipped`. */
export async function writeTabs(key: GoogleServiceAccount, spreadsheetId: string, tabs: SheetTab[]): Promise<{ title: string; rows: number; skipped: string[] }> {
  const id = encodeURIComponent(spreadsheetId)
  const { title, checks } = await checkTabs(key, id, tabs)
  const skipped = checks.filter((c) => c.state === 'foreign').map((c) => c.name)
  const writable = tabs.filter((t) => !skipped.includes(t.name))

  const missing = checks.filter((c) => c.state === 'new')
  const toTag: number[] = checks.filter((c) => c.state === 'adopt' && c.sheetId !== null).map((c) => c.sheetId as number)
  if (missing.length) {
    const created = await call<{ replies: { addSheet?: { properties: { sheetId: number } } }[] }>(key, `${API}/${id}:batchUpdate`, {
      method: 'POST',
      body: { requests: missing.map((t) => ({ addSheet: { properties: { title: t.name, gridProperties: { frozenRowCount: 1 } } } })) },
    })
    toTag.push(...created.replies.map((r) => r.addSheet?.properties.sheetId).filter((x): x is number => typeof x === 'number'))
  }
  if (toTag.length) {
    // Etiqueta + cabeçalho a negrito/congelado. Se a etiqueta falhar, a aba continua a ser reconhecida
    // pelo cabeçalho no lote seguinte.
    await call(key, `${API}/${id}:batchUpdate`, {
      method: 'POST',
      body: {
        requests: toTag.flatMap((sheetId) => [
          { createDeveloperMetadata: { developerMetadata: { metadataKey: OWNER_KEY, metadataValue: 'managed', location: { sheetId }, visibility: 'DOCUMENT' } } },
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
          { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
        ]),
      },
    }).catch(() => undefined)
  }
  if (writable.length) {
    await call(key, `${API}/${id}/values:batchClear`, { method: 'POST', body: { ranges: writable.map((t) => quoteTab(t.name)) } })
    // RAW: o que vem do Discord nunca é interpretado como fórmula (um nome "=…" fica texto).
    await call(key, `${API}/${id}/values:batchUpdate`, {
      method: 'POST',
      body: { valueInputOption: 'RAW', data: writable.map((t) => ({ range: `${quoteTab(t.name)}!A1`, values: t.rows })) },
    })
  }
  return { title, rows: writable.reduce((n, t) => n + Math.max(0, t.rows.length - 1), 0), skipped }
}
