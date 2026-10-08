import { createSign } from 'node:crypto'
import type { GoogleServiceAccount } from '../store/memberRegistry'
import type { SheetTab } from '../../shared/memberSheet'
import type { SpreadsheetInspect } from '../../shared/types'

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

const quoteTab = (name: string) => `'${name.replace(/'/g, "''")}'`
const sameRow = (a: unknown[] = [], b: unknown[] = []) => a.length === b.length && a.every((v, i) => String(v) === String(b[i]))

type Owner = 'tagged' | 'header' | 'empty' | 'theirs'

const batchGet = (key: GoogleServiceAccount, id: string, ranges: string[]) =>
  call<{ valueRanges?: { values?: unknown[][] }[] }>(key, `${API}/${id}/values:batchGet?${ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')}`)

/** De quem é cada aba: etiquetada pelo bot, com o cabeçalho do bot (versões antigas), vazia ou de
 * outra pessoa (com dados). Lê as primeiras linhas de todas as abas de uma vez. */
async function ownership(key: GoogleServiceAccount, id: string, meta: SpreadsheetMeta, names: string[], header: unknown[]): Promise<Map<string, Owner>> {
  const out = new Map<string, Owner>()
  const byName = new Map(meta.sheets.map((s) => [s.properties.title, s]))
  const untagged: string[] = []
  for (const n of new Set(names)) {
    const sheet = byName.get(n)
    if (!sheet) continue
    if (sheet.developerMetadata?.some((m) => m.metadataKey === OWNER_KEY)) out.set(n, 'tagged')
    else untagged.push(n)
  }
  if (!untagged.length) return out
  const first = await batchGet(key, id, untagged.map((n) => `${quoteTab(n)}!1:1`))
  const blankFirst: string[] = []
  untagged.forEach((n, i) => {
    const row = first.valueRanges?.[i]?.values?.[0]
    if (row?.some((c) => String(c ?? '').trim())) out.set(n, header.length && sameRow(row, header) ? 'header' : 'theirs')
    else blankFirst.push(n)
  })
  if (blankFirst.length) {
    // 1.ª linha vazia: só é "vazia" se não houver nada em lado nenhum da aba.
    const all = await batchGet(key, id, blankFirst.map(quoteTab))
    blankFirst.forEach((n, i) => out.set(n, all.valueRanges?.[i]?.values?.some((r) => r.some((c) => String(c ?? '').trim())) ? 'theirs' : 'empty'))
  }
  return out
}

/** Todas as abas da planilha e de quem é cada uma (para a app deixar escolher). */
export async function inspectSpreadsheet(key: GoogleServiceAccount, spreadsheetId: string, header: unknown[]): Promise<SpreadsheetInspect> {
  const id = encodeURIComponent(spreadsheetId)
  const meta = await call<SpreadsheetMeta>(key, `${API}/${id}?fields=${encodeURIComponent(META_FIELDS)}`)
  const names = meta.sheets.map((s) => s.properties.title)
  const owners = await ownership(key, id, meta, names, header)
  return { title: meta.properties.title, tabs: names.map((name) => ({ name, owner: ({ tagged: 'mine', header: 'mine', empty: 'empty', theirs: 'theirs' } as const)[owners.get(name) ?? 'empty'] })) }
}

/** Reescreve as abas do bot (cria as que faltam, com o cabeçalho a negrito e congelado). Abas com o
 * mesmo nome que já tinham dados de outra pessoa só são usadas se estiverem em `claimed` (o dono
 * autorizou na app); as outras não são tocadas e vêm em `skipped`. */
export async function writeTabs(key: GoogleServiceAccount, spreadsheetId: string, tabs: SheetTab[], claimed: string[] = []): Promise<{ title: string; rows: number; skipped: string[] }> {
  const id = encodeURIComponent(spreadsheetId)
  const meta = await call<SpreadsheetMeta>(key, `${API}/${id}?fields=${encodeURIComponent(META_FIELDS)}`)
  const sheetIdOf = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]))
  const owners = await ownership(key, id, meta, tabs.map((t) => t.name), tabs[0]?.rows[0] ?? [])
  const skipped = tabs.filter((t) => owners.get(t.name) === 'theirs' && !claimed.includes(t.name)).map((t) => t.name)
  const writable = tabs.filter((t) => !skipped.includes(t.name))

  const missing = writable.filter((t) => !sheetIdOf.has(t.name))
  const toTag: number[] = writable.filter((t) => sheetIdOf.has(t.name) && owners.get(t.name) !== 'tagged').map((t) => sheetIdOf.get(t.name)!)
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
  return { title: meta.properties.title, rows: writable.reduce((n, t) => n + Math.max(0, t.rows.length - 1), 0), skipped }
}
