import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { MemberRecord, MemberSheetSettings, MemberSheetStatus } from '../../shared/types'
import { defaultMemberSheetSettings } from '../../shared/memberSheet'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

// Registo de membros verificados (a fonte da verdade — só o bot escreve aqui) e as definições da
// planilha, por servidor. A chave da conta de serviço do Google fica num ficheiro à parte, só com
// permissão de leitura para o dono, e nunca é devolvida à app.

/** Uma célula como estava antes de um lote numa aba ligada (para desfazer). */
export interface LinkedUndoCell {
  row: number
  col: number
  value: string | number | boolean
  formula: boolean
  /** O que o bot lá escreveu — só se desfaz se a célula ainda tiver isto. */
  after?: string | number
}

export interface LinkedUndoEntry {
  at: string
  tabName: string
  cells: LinkedUndoCell[]
}

interface GuildRegistry {
  settings?: Partial<MemberSheetSettings>
  status?: Partial<MemberSheetStatus>
  records: Record<string, MemberRecord>
  /** Por aba ligada: os últimos lotes (mais recente no fim). */
  linkedUndo?: Record<string, LinkedUndoEntry[]>
}

type Data = Record<string, GuildRegistry>

function readAll(): Data {
  return readJsonFile<Data>(paths.memberRegistryFile, {})
}

function guildOf(data: Data, guildId: string): GuildRegistry {
  data[guildId] ??= { records: {} }
  data[guildId].records ??= {}
  return data[guildId]
}

export function listRegistryGuilds(): string[] {
  return Object.keys(readAll())
}

export function getSheetSettings(guildId: string): MemberSheetSettings {
  const d = defaultMemberSheetSettings()
  const saved = readAll()[guildId]?.settings ?? {}
  const columns = saved.columns?.length ? [...saved.columns, ...d.columns.filter((c) => !saved.columns!.some((x) => x.key === c.key))] : d.columns
  return { ...d, ...saved, allTab: { ...d.allTab, ...saved.allTab }, otherTab: { ...d.otherTab, ...saved.otherTab }, columns, sections: saved.sections ?? d.sections }
}

export function saveSheetSettings(guildId: string, settings: MemberSheetSettings): MemberSheetSettings {
  const data = readAll()
  guildOf(data, guildId).settings = settings
  writeJsonFile(paths.memberRegistryFile, data)
  return getSheetSettings(guildId)
}

export function getSheetStatus(guildId: string): MemberSheetStatus {
  return { lastSyncAt: null, lastSyncOk: null, lastSyncMessage: '', lastBackupAt: null, ...readAll()[guildId]?.status }
}

export function setSheetStatus(guildId: string, patch: Partial<MemberSheetStatus>): void {
  const data = readAll()
  const g = guildOf(data, guildId)
  g.status = { ...g.status, ...patch }
  writeJsonFile(paths.memberRegistryFile, data)
}

const UNDO_KEEP = 10

export function pushLinkedUndo(guildId: string, tabId: string, entry: LinkedUndoEntry): void {
  if (!entry.cells.length) return
  const data = readAll()
  const g = guildOf(data, guildId)
  g.linkedUndo ??= {}
  g.linkedUndo[tabId] = [...(g.linkedUndo[tabId] ?? []), entry].slice(-UNDO_KEEP)
  writeJsonFile(paths.memberRegistryFile, data)
}

export function peekLinkedUndo(guildId: string, tabId: string): LinkedUndoEntry | null {
  return readAll()[guildId]?.linkedUndo?.[tabId]?.at(-1) ?? null
}

export function popLinkedUndo(guildId: string, tabId: string): void {
  const data = readAll()
  const list = data[guildId]?.linkedUndo?.[tabId]
  if (!list?.length) return
  list.pop()
  writeJsonFile(paths.memberRegistryFile, data)
}

export function linkedUndoSummary(guildId: string): Record<string, { at: string; cells: number }> {
  const all = readAll()[guildId]?.linkedUndo ?? {}
  const out: Record<string, { at: string; cells: number }> = {}
  for (const [tabId, list] of Object.entries(all)) {
    const last = list.at(-1)
    if (last) out[tabId] = { at: last.at, cells: last.cells.length }
  }
  return out
}

export function listRecords(guildId: string): MemberRecord[] {
  return Object.values(readAll()[guildId]?.records ?? {})
}

export function getRecord(guildId: string, userId: string): MemberRecord | null {
  return readAll()[guildId]?.records[userId] ?? null
}

/** Grava (ou junta) vários registos de uma vez. */
export function upsertRecords(guildId: string, records: MemberRecord[]): void {
  if (records.length === 0) return
  const data = readAll()
  const g = guildOf(data, guildId)
  for (const r of records) g.records[r.userId] = r
  writeJsonFile(paths.memberRegistryFile, data)
}

export function removeRecord(guildId: string, userId: string): boolean {
  const data = readAll()
  const g = guildOf(data, guildId)
  if (!g.records[userId]) return false
  delete g.records[userId]
  writeJsonFile(paths.memberRegistryFile, data)
  return true
}

// ---- Chave do Google (conta de serviço) ----

export interface GoogleServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

export function getGoogleKey(): GoogleServiceAccount | null {
  if (!existsSync(paths.googleKeyFile)) return null
  try {
    const k = JSON.parse(readFileSync(paths.googleKeyFile, 'utf-8')) as GoogleServiceAccount
    return k.client_email && k.private_key ? k : null
  } catch {
    return null
  }
}

export function saveGoogleKey(raw: string): GoogleServiceAccount {
  let parsed: Partial<GoogleServiceAccount> & { type?: string }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('O ficheiro não é um JSON válido — usa o ficheiro .json da conta de serviço que o Google Cloud descarregou.')
  }
  if (parsed.type !== 'service_account' || !parsed.client_email || !parsed.private_key?.includes('PRIVATE KEY')) {
    throw new Error('Isto não parece a chave de uma conta de serviço do Google (falta "client_email" ou "private_key").')
  }
  const key: GoogleServiceAccount = { client_email: parsed.client_email, private_key: parsed.private_key, token_uri: parsed.token_uri || 'https://oauth2.googleapis.com/token' }
  mkdirSync(path.dirname(paths.googleKeyFile), { recursive: true })
  writeFileSync(paths.googleKeyFile, JSON.stringify(key), { encoding: 'utf-8', mode: 0o600 })
  try {
    chmodSync(paths.googleKeyFile, 0o600)
  } catch {
    // Windows: as permissões são outras — o ficheiro fica na pasta de dados da app
  }
  return key
}

export function clearGoogleKey(): void {
  if (existsSync(paths.googleKeyFile)) unlinkSync(paths.googleKeyFile)
}
