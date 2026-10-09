import { createSign } from 'node:crypto'
import type { GoogleServiceAccount } from '../store/memberRegistry'
import type { SheetTab } from '../../shared/memberSheet'
import type { SpreadsheetInspect } from '../../shared/types'
import { colLetter, type Grid, type GridCell } from '../../shared/linkedSheet'

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

// ==========================================================================
// Abas ligadas: ler a grelha (valores, cores, listas) e escrever célula a célula
// ==========================================================================

type GColor = { red?: number; green?: number; blue?: number }
const toHex = (c: GColor | undefined, fallback: string) => {
  if (!c) return fallback
  const h = (v = 0) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
  return `#${h(c.red)}${h(c.green)}${h(c.blue)}`
}
const fromHex = (hex: string): GColor => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 })

interface GCellData {
  formattedValue?: string
  userEnteredValue?: { stringValue?: string; numberValue?: number; boolValue?: boolean; formulaValue?: string }
  effectiveFormat?: { backgroundColor?: GColor; textFormat?: { foregroundColor?: GColor; bold?: boolean } }
  dataValidation?: { condition?: { type?: string; values?: { userEnteredValue?: string }[] } }
}

const GRID_FIELDS =
  'properties.title,sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),merges,data(rowData(values(formattedValue,userEnteredValue,effectiveFormat(backgroundColor,textFormat(foregroundColor,bold)),dataValidation(condition(type,values(userEnteredValue)))))))'

/** Lê uma aba tal como está: valores, cores, negrito, células juntas e as opções das listas. */
export async function readGrid(key: GoogleServiceAccount, spreadsheetId: string, tabName: string, maxCols: number, maxRows = 1000): Promise<Grid & { spreadsheetTitle: string }> {
  const id = encodeURIComponent(spreadsheetId)
  const range = `${quoteTab(tabName)}!A1:${colLetter(Math.max(0, maxCols - 1))}${maxRows}`
  const res = await call<{
    properties: { title: string }
    sheets?: {
      properties: { sheetId: number; title: string; gridProperties?: { rowCount?: number } }
      merges?: { startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number }[]
      data?: { rowData?: { values?: GCellData[] }[] }[]
    }[]
  }>(key, `${API}/${id}?ranges=${encodeURIComponent(range)}&fields=${encodeURIComponent(GRID_FIELDS)}`)
  const sheet = res.sheets?.[0]
  if (!sheet) throw new Error(`Não encontrei a aba "${tabName}" na planilha.`)
  const rangeRefs: { col: number; ref: string }[] = []
  const options: Record<number, string[]> = {}
  const rows: GridCell[][] = (sheet.data?.[0]?.rowData ?? []).map((row) =>
    (row.values ?? []).map((c, col) => {
      const u = c.userEnteredValue
      const raw = u?.formulaValue ?? u?.stringValue ?? u?.numberValue ?? u?.boolValue
      const cond = c.dataValidation?.condition
      if (cond && options[col] === undefined) {
        if (cond.type === 'ONE_OF_LIST') options[col] = (cond.values ?? []).map((v) => v.userEnteredValue ?? '').filter(Boolean)
        else if (cond.type === 'ONE_OF_RANGE' && cond.values?.[0]?.userEnteredValue) {
          options[col] = []
          rangeRefs.push({ col, ref: cond.values[0].userEnteredValue.replace(/^=/, '').replace(/\$/g, '') })
        }
      }
      return {
        v: c.formattedValue ?? '',
        raw,
        formula: u?.formulaValue !== undefined,
        bg: toHex(c.effectiveFormat?.backgroundColor, '#ffffff'),
        fg: toHex(c.effectiveFormat?.textFormat?.foregroundColor, '#000000'),
        b: c.effectiveFormat?.textFormat?.bold || undefined,
      }
    }),
  )
  // Listas que vêm de um intervalo (ex.: =Listas!A2:A40).
  if (rangeRefs.length) {
    const refs = rangeRefs.map((r) => (r.ref.includes('!') ? r.ref : `${quoteTab(tabName)}!${r.ref}`))
    const got = await batchGet(key, id, refs).catch(() => ({ valueRanges: [] as { values?: unknown[][] }[] }))
    rangeRefs.forEach((r, i) => {
      options[r.col] = (got.valueRanges?.[i]?.values ?? []).flat().map((v) => String(v ?? '').trim()).filter(Boolean)
    })
  }
  return {
    spreadsheetTitle: res.properties.title,
    sheetId: sheet.properties.sheetId,
    title: sheet.properties.title,
    rowCount: sheet.properties.gridProperties?.rowCount ?? rows.length,
    rows,
    merges: (sheet.merges ?? []).map((m) => ({ r0: m.startRowIndex ?? 0, r1: m.endRowIndex ?? 0, c0: m.startColumnIndex ?? 0, c1: m.endColumnIndex ?? 0 })),
    options,
  }
}

/** Escreve só estas células (o resto da aba fica igual). Fórmulas vão como fórmula; o resto em RAW. */
export async function writeCells(key: GoogleServiceAccount, spreadsheetId: string, tabName: string, cells: { row: number; col: number; value: string | number | boolean; formula?: boolean }[]): Promise<void> {
  const id = encodeURIComponent(spreadsheetId)
  const range = (c: { row: number; col: number }) => `${quoteTab(tabName)}!${colLetter(c.col)}${c.row + 1}`
  for (const [mode, list] of [
    ['RAW', cells.filter((c) => !c.formula)],
    ['USER_ENTERED', cells.filter((c) => c.formula)],
  ] as const) {
    if (!list.length) continue
    await call(key, `${API}/${id}/values:batchUpdate`, { method: 'POST', body: { valueInputOption: mode, data: list.map((c) => ({ range: range(c), values: [[c.value]] })) } })
  }
}

/** Linhas novas no fim da tabela: garante que existem e copia o formato e as listas da linha-modelo. */
export async function prepareRows(key: GoogleServiceAccount, spreadsheetId: string, grid: { sheetId: number; rowCount: number }, templateRow: number, from: number, count: number, width: number): Promise<void> {
  if (count <= 0) return
  const requests: unknown[] = []
  if (from + count > grid.rowCount) requests.push({ appendDimension: { sheetId: grid.sheetId, dimension: 'ROWS', length: from + count - grid.rowCount } })
  const source = { sheetId: grid.sheetId, startRowIndex: templateRow, endRowIndex: templateRow + 1, startColumnIndex: 0, endColumnIndex: width }
  const destination = { sheetId: grid.sheetId, startRowIndex: from, endRowIndex: from + count, startColumnIndex: 0, endColumnIndex: width }
  for (const pasteType of ['PASTE_FORMAT', 'PASTE_DATA_VALIDATION']) requests.push({ copyPaste: { source, destination, pasteType, pasteOrientation: 'NORMAL' } })
  await call(key, `${API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, { method: 'POST', body: { requests } })
}

/** Pinta linhas (fundo e/ou texto) de uma coluna a outra. Não mexe em mais nada da formatação. */
export async function colorRows(key: GoogleServiceAccount, spreadsheetId: string, sheetId: number, c0: number, c1: number, items: { row: number; bg: string; fg: string }[]): Promise<void> {
  if (!items.length) return
  const requests = items.map((it) => {
    const fields: string[] = []
    const format: Record<string, unknown> = {}
    if (it.bg) {
      format.backgroundColor = fromHex(it.bg)
      format.backgroundColorStyle = { rgbColor: fromHex(it.bg) }
      fields.push('userEnteredFormat.backgroundColor', 'userEnteredFormat.backgroundColorStyle')
    }
    if (it.fg) {
      format.textFormat = { foregroundColor: fromHex(it.fg), foregroundColorStyle: { rgbColor: fromHex(it.fg) } }
      fields.push('userEnteredFormat.textFormat.foregroundColor', 'userEnteredFormat.textFormat.foregroundColorStyle')
    }
    return { repeatCell: { range: { sheetId, startRowIndex: it.row, endRowIndex: it.row + 1, startColumnIndex: c0, endColumnIndex: c1 + 1 }, cell: { userEnteredFormat: format }, fields: fields.join(',') } }
  })
  await call(key, `${API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, { method: 'POST', body: { requests } })
}
