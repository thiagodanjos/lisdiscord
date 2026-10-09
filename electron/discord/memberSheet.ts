import { AttachmentBuilder, type Client, type Guild, type GuildMember, PermissionFlagsBits } from 'discord.js'
import type { LinkedSource, LinkedTab, MemberRecord, MemberSheetAction, MemberSheetSettings, MemberSheetState, SheetColumnKey } from '../../shared/types'
import { buildSheetTabs, defaultMemberSheetSettings, parseSpreadsheetId, SHEET_COLUMN_LABELS } from '../../shared/memberSheet'
import * as store from '../store/memberRegistry'
import * as movPoints from '../store/movPoints'
import { colLetter } from '../../shared/linkedSheet'
import { inspectSpreadsheet, writeTabs } from './googleSheets'
import { detectLinked, runLinked, undoLinked, viewLinked } from './linkedSheet'

// Registo de membros + planilha: quem é verificado fica gravado no registo do bot (com os cargos),
// e de tempos a tempos o bot reescreve a planilha do Google a partir do registo. A planilha é só uma
// cópia — se alguém a apagar ou mexer, o lote seguinte volta a pô-la certa. Há backup automático do
// registo para um canal e dá para repor os cargos de quem os perdeu.

const TICK_MS = 60_000
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const syncing = new Set<string>()

function rolesOf(m: GuildMember): { ids: string[]; names: string[] } {
  const roles = [...m.roles.cache.values()].filter((r) => r.id !== m.guild.id && !r.managed).sort((a, b) => b.position - a.position)
  return { ids: roles.map((r) => r.id), names: roles.map((r) => r.name) }
}

function recordFrom(m: GuildMember, prev: MemberRecord | null, patch: Partial<MemberRecord> = {}): MemberRecord {
  const roles = rolesOf(m)
  return {
    userId: m.id,
    tag: m.user.tag.replace(/#0$/, ''),
    displayName: m.displayName,
    roleIds: roles.ids,
    roleNames: roles.names,
    verifiedAt: prev?.verifiedAt ?? null,
    verifiedByTag: prev?.verifiedByTag ?? null,
    joinedAt: m.joinedAt?.toISOString() ?? prev?.joinedAt ?? null,
    source: prev?.source ?? 'manual',
    inServer: true,
    leftAt: null,
    updatedAt: new Date().toISOString(),
    ...patch,
  }
}

/** Chamado pela verificação quando o ticket é finalizado: grava o membro com os cargos que ficou. */
export async function registerVerifiedMember(guild: Guild, userId: string, moderatorTag: string): Promise<void> {
  const settings = store.getSheetSettings(guild.id)
  if (!settings.autoRegister) return
  const m = await guild.members.fetch({ user: userId, force: true }).catch(() => null)
  if (!m) return
  const prev = store.getRecord(guild.id, userId)
  store.upsertRecords(guild.id, [recordFrom(m, prev, { verifiedAt: new Date().toISOString(), verifiedByTag: moderatorTag, source: 'verificacao' })])
}

// ==========================================================================
// Lote: atualizar o registo com o servidor e reescrever a planilha
// ==========================================================================

/**
 * Atualiza nomes/cargos de quem está no servidor e marca quem saiu. Proteção contra "bagunça": se
 * muita gente perder cargos de uma vez (ex.: alguém apagou cargos), os cargos guardados não mudam
 * nesta ronda — continuam disponíveis para os repor.
 */
async function refreshRecords(guild: Guild): Promise<string> {
  const records = store.listRecords(guild.id)
  if (records.length === 0) return ''
  let members: Map<string, GuildMember> | null = null
  try {
    members = new Map((await guild.members.fetch()).map((m) => [m.id, m]))
  } catch {
    members = null // sem a intent Server Members: só atualiza quem o bot já tem em cache
  }
  const lookup = (id: string) => members?.get(id) ?? guild.members.cache.get(id) ?? null
  const shrinking = records.filter((r) => {
    const m = lookup(r.userId)
    return m && r.roleIds.some((id) => !m.roles.cache.has(id) && guild.roles.cache.has(id))
  }).length
  const suspicious = shrinking >= Math.max(5, Math.ceil(records.length * 0.3))
  const now = new Date().toISOString()
  const next: MemberRecord[] = []
  for (const r of records) {
    const m = lookup(r.userId)
    if (m) {
      const fresh = recordFrom(m, r)
      next.push(suspicious ? { ...fresh, roleIds: [...new Set([...r.roleIds, ...fresh.roleIds])], roleNames: r.roleNames } : fresh)
    } else if (members && r.inServer) {
      next.push({ ...r, inServer: false, leftAt: now, updatedAt: now })
    }
  }
  store.upsertRecords(guild.id, next)
  return suspicious ? `⚠️ ${shrinking} membros perderam cargos de uma vez — os cargos guardados no registo não foram mexidos (usa "Repor cargos" se foi bagunça).` : ''
}

function extras(guild: Guild) {
  return {
    points: new Map(movPoints.getLeaderboard(guild.id).map((e) => [e.userId, { points: e.points, totalSeconds: e.totalSeconds }])),
    roleNames: new Map([...guild.roles.cache.values()].map((r) => [r.id, r.name])),
  }
}

function skippedText(names: string[], before = false): string {
  const one = names.length === 1
  const list = names.map((n) => `"${n}"`).join(', ')
  const head = before
    ? `⚠️ ${one ? 'A aba' : 'As abas'} ${list} já ${one ? 'existe' : 'existem'} na planilha com dados teus — o bot não ${one ? 'lhe' : 'lhes'} vai tocar.`
    : `⚠️ Não mexi ${one ? 'na aba' : 'nas abas'} ${list}: já ${one ? 'existia' : 'existiam'} na planilha com dados teus.`
  return `${head} Na app, em "Abas", escolhe outra aba ou carrega em "Usar esta aba" se queres mesmo que o bot escreva lá (o que lá está é substituído).`
}

function sheetTabs(guild: Guild) {
  return buildSheetTabs(store.getSheetSettings(guild.id), store.listRecords(guild.id), extras(guild))
}

export async function syncSheet(guild: Guild): Promise<string> {
  if (syncing.has(guild.id)) return 'Já está a sincronizar.'
  syncing.add(guild.id)
  try {
    const settings = store.getSheetSettings(guild.id)
    const key = store.getGoogleKey()
    if (!key) throw new Error('Falta a chave da conta de serviço do Google (em Planilha → Ligação ao Google).')
    if (!settings.spreadsheetId) throw new Error('Falta o link da planilha.')
    await guild.roles.fetch().catch(() => undefined)
    const warning = await refreshRecords(guild)
    const linked = settings.linkedTabs.filter((t) => t.enabled)
    const linkedNames = new Set(linked.map((t) => t.tabName))
    const allTabs = sheetTabs(guild)
    // Uma aba ligada nunca é reescrita como "aba do bot".
    const clash = allTabs.filter((t) => linkedNames.has(t.name)).map((t) => t.name)
    const tabs = allTabs.filter((t) => !linkedNames.has(t.name))
    if (tabs.length === 0 && linked.length === 0) throw new Error('Não há nenhuma aba — liga uma aba da planilha (Abas ligadas), a aba "Todos" ou adiciona cargos.')
    const parts: string[] = []
    let ok = true
    let title = ''
    if (tabs.length) {
      const r = await writeTabs(key, settings.spreadsheetId, tabs, settings.claimedTabs)
      title = r.title
      parts.push(`${tabs.length - r.skipped.length} aba(s) do bot, ${r.rows} linha(s).`)
      if (r.skipped.length) {
        ok = false
        parts.push(skippedText(r.skipped))
      }
    }
    if (clash.length) {
      ok = false
      parts.push(`⚠️ ${clash.map((n) => `"${n}"`).join(', ')} já é uma aba ligada — desliga essa aba em "Abas por cargo" ou dá-lhe outro nome.`)
    }
    for (const t of linked) {
      try {
        parts.push(await runLinked(guild, t, 'auto'))
      } catch (err) {
        ok = false
        parts.push(`❌ Aba "${t.tabName}": ${errText(err)}`)
      }
    }
    const message = `${title ? `Planilha "${title}": ` : ''}${parts.join(' ')}${warning ? ` ${warning}` : ''}`
    store.setSheetStatus(guild.id, { lastSyncAt: new Date().toISOString(), lastSyncOk: ok, lastSyncMessage: message })
    return message
  } catch (err) {
    store.setSheetStatus(guild.id, { lastSyncAt: new Date().toISOString(), lastSyncOk: false, lastSyncMessage: errText(err) })
    throw err
  } finally {
    syncing.delete(guild.id)
  }
}

// ==========================================================================
// Backup (ficheiro .json num canal) e repor cargos
// ==========================================================================

function backupJson(guild: Guild): string {
  return JSON.stringify({ kind: 'lisdiscord-member-registry', version: 1, guildId: guild.id, guildName: guild.name, exportedAt: new Date().toISOString(), records: store.listRecords(guild.id) }, null, 2)
}

export async function sendBackup(guild: Guild): Promise<string> {
  const settings = store.getSheetSettings(guild.id)
  if (!settings.backupChannelId) throw new Error('Escolhe primeiro o canal dos backups.')
  const channel = await guild.channels.fetch(settings.backupChannelId).catch(() => null)
  if (!channel?.isTextBased()) throw new Error('O canal dos backups já não existe.')
  const count = store.listRecords(guild.id).length
  const date = new Date().toISOString().slice(0, 10)
  await channel.send({
    content: `🗄️ Backup do registo de membros — ${count} membro(s). Guarda este ficheiro: dá para restaurar tudo na app (Planilha → Backup).`,
    files: [new AttachmentBuilder(Buffer.from(backupJson(guild), 'utf8'), { name: `registo-membros-${date}.json` })],
    allowedMentions: { parse: [] },
  })
  store.setSheetStatus(guild.id, { lastBackupAt: new Date().toISOString() })
  return `Backup enviado para #${'name' in channel ? channel.name : 'canal'} (${count} membros).`
}

/** Dá de volta os cargos guardados no registo que o membro já não tem (só os que o bot consegue dar). */
export async function restoreRoles(guild: Guild, userId: string | null): Promise<string> {
  await guild.roles.fetch().catch(() => undefined)
  const me = guild.members.me ?? (await guild.members.fetchMe())
  const top = me.roles.highest.position
  const records = userId ? [store.getRecord(guild.id, userId)].filter((r): r is MemberRecord => Boolean(r)) : store.listRecords(guild.id).filter((r) => r.inServer)
  let given = 0
  let people = 0
  let blocked = 0
  for (const r of records) {
    const m = await guild.members.fetch(r.userId).catch(() => null)
    if (!m) continue
    const missing = r.roleIds.filter((id) => !m.roles.cache.has(id))
    const ok = missing.filter((id) => {
      const role = guild.roles.cache.get(id)
      return role && !role.managed && role.position < top
    })
    blocked += missing.length - ok.length
    if (ok.length === 0) continue
    await m.roles
      .add(ok, 'Repor cargos a partir do registo (LisDiscord)')
      .then(() => {
        given += ok.length
        people++
      })
      .catch(() => undefined)
  }
  const extra = blocked ? ` ${blocked} cargo(s) ficaram de fora (apagados ou acima do cargo do bot).` : ''
  return given ? `${given} cargo(s) repostos em ${people} membro(s).${extra}` : `Ninguém precisava de cargos repostos.${extra}`
}

async function importMembers(guild: Guild, roleIds: string[]): Promise<string> {
  let all: GuildMember[]
  try {
    all = [...(await guild.members.fetch()).values()]
  } catch {
    throw new Error('Para importar todos os membros, liga a "Server Members Intent" no Developer Portal do bot.')
  }
  const targets = all.filter((m) => !m.user.bot && (roleIds.length === 0 || roleIds.some((id) => m.roles.cache.has(id))))
  const records = targets.map((m) => {
    const prev = store.getRecord(guild.id, m.id)
    return recordFrom(m, prev, { source: prev?.source ?? 'importado' })
  })
  store.upsertRecords(guild.id, records)
  return `${records.length} membro(s) no registo (importados ou atualizados).`
}

function importJson(guild: Guild, json: string): string {
  let data: { kind?: string; records?: MemberRecord[] }
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('O ficheiro não é um backup válido (JSON).')
  }
  if (data.kind !== 'lisdiscord-member-registry' || !Array.isArray(data.records)) throw new Error('Este ficheiro não é um backup do registo de membros.')
  const valid = data.records.filter((r) => r && /^\d{15,21}$/.test(r.userId) && Array.isArray(r.roleIds))
  // Junta: o que está no backup volta, sem apagar quem entrou depois.
  store.upsertRecords(
    guild.id,
    valid.map((r) => ({ ...r, roleNames: Array.isArray(r.roleNames) ? r.roleNames : [], updatedAt: new Date().toISOString() })),
  )
  return `${valid.length} membro(s) restaurados do backup.`
}

// ==========================================================================
// Ciclo
// ==========================================================================

async function tickGuild(guild: Guild): Promise<void> {
  const settings = store.getSheetSettings(guild.id)
  const status = store.getSheetStatus(guild.id)
  const now = Date.now()
  if (settings.syncMinutes > 0 && settings.spreadsheetId && store.getGoogleKey()) {
    const last = status.lastSyncAt ? new Date(status.lastSyncAt).getTime() : 0
    // Depois de uma falha, espera pelo menos 10 minutos antes de tentar outra vez.
    const wait = status.lastSyncOk === false ? Math.max(10, settings.syncMinutes) : settings.syncMinutes
    if (now - last >= wait * 60_000) await syncSheet(guild).catch((err) => console.error(`[planilha] ${guild.name}:`, errText(err)))
  }
  if (settings.backupChannelId && settings.backupHours > 0 && store.listRecords(guild.id).length > 0) {
    const last = status.lastBackupAt ? new Date(status.lastBackupAt).getTime() : 0
    if (now - last >= settings.backupHours * 3_600_000) await sendBackup(guild).catch((err) => console.error(`[planilha] backup ${guild.name}:`, errText(err)))
  }
}

export function startMemberSheetLoop(client: Client): () => void {
  let running = false
  const tick = async () => {
    if (running || !client.isReady()) return
    running = true
    try {
      for (const id of store.listRegistryGuilds()) {
        const guild = client.guilds.cache.get(id)
        if (guild) await tickGuild(guild)
      }
    } finally {
      running = false
    }
  }
  const interval = setInterval(() => void tick(), TICK_MS)
  return () => clearInterval(interval)
}

// ==========================================================================
// App
// ==========================================================================

export function getMemberSheetState(guildId: string): MemberSheetState {
  const records = store.listRecords(guildId).sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt'))
  return {
    settings: store.getSheetSettings(guildId),
    status: store.getSheetStatus(guildId),
    records,
    googleEmail: store.getGoogleKey()?.client_email ?? null,
    linkedUndo: store.linkedUndoSummary(guildId),
  }
}

const LINKED_SOURCES: LinkedSource[] = ['keep', 'name', 'username', 'id', 'role', 'nextRole', 'date', 'status', 'points', 'hours', 'fixed']

function cleanLinkedTabs(guild: Guild, input: unknown, tab: (v: string) => string, txt: (v: unknown, max: number, fb: string) => string): LinkedTab[] {
  const int = (v: unknown, min: number, max: number, fb: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb
  }
  const optCol = (v: unknown) => (v === null || v === undefined || v === '' ? null : int(v, 0, 51, 0))
  const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '')
  const list = Array.isArray(input) ? (input as Partial<LinkedTab>[]) : []
  const names = new Set<string>()
  const ids = new Set<string>()
  const out: LinkedTab[] = []
  for (const [i, t] of list.slice(0, 8).entries()) {
    if (!t || typeof t.tabName !== 'string') continue
    const tabName = tab(t.tabName)
    if (!tabName || names.has(tabName)) continue
    names.add(tabName)
    let id = typeof t.id === 'string' && t.id ? t.id.slice(0, 40) : `lk${i}`
    if (ids.has(id)) id = `${id}-${i}`
    ids.add(id)
    const seen = new Set<number>()
    const columns = (Array.isArray(t.columns) ? t.columns : [])
      .filter((c) => c && Number.isInteger(c.col) && c.col >= 0 && c.col < 52 && !seen.has(c.col) && Boolean(seen.add(c.col)))
      .slice(0, 52)
      .map((c) => ({
        col: c.col,
        header: txt(c.header, 100, colLetter(c.col)),
        source: LINKED_SOURCES.includes(c.source) ? c.source : ('keep' as const),
        updateExisting: Boolean(c.updateExisting),
        optionRoles: Object.fromEntries(
          Object.entries(c.optionRoles && typeof c.optionRoles === 'object' ? c.optionRoles : {})
            .filter(([o, r]) => o.length <= 200 && typeof r === 'string' && guild.roles.cache.has(r))
            .slice(0, 300),
        ),
        fallback: typeof c.fallback === 'string' ? c.fallback.slice(0, 200) : '',
        fromCol: optCol(c.fromCol),
        dateOf: c.dateOf === 'verified' || c.dateOf === 'roleChange' ? c.dateOf : ('added' as const),
        dateFormat: txt(c.dateFormat, 30, 'dd/MM/yy'),
        activeValue: typeof c.activeValue === 'string' ? c.activeValue.slice(0, 100) : '',
        leftValue: typeof c.leftValue === 'string' ? c.leftValue.slice(0, 100) : '',
      }))
      .sort((a, b) => a.col - b.col)
    const fromCol = int(t.colors?.fromCol, 0, 51, 0)
    out.push({
      id,
      enabled: t.enabled !== false,
      tabName,
      headerRow: int(t.headerRow, 1, 50, 1),
      idCol: int(t.idCol, 0, 51, 0),
      idFormat: t.idFormat === 'plain' ? 'plain' : 'mention',
      columns,
      roleIds: [...new Set(Array.isArray(t.roleIds) ? t.roleIds : [])].filter((r) => typeof r === 'string' && guild.roles.cache.has(r)),
      autoAdd: t.autoAdd !== false,
      colors: {
        enabled: Boolean(t.colors?.enabled),
        col: optCol(t.colors?.col),
        fromCol,
        toCol: Math.max(fromCol, int(t.colors?.toCol, 0, 51, fromCol)),
        rules: (Array.isArray(t.colors?.rules) ? t.colors.rules : [])
          .slice(0, 40)
          .map((r) => ({ value: typeof r?.value === 'string' ? r.value.slice(0, 100) : '', bg: hex(r?.bg), fg: hex(r?.fg) }))
          .filter((r) => r.value.trim()),
      },
    })
  }
  return out
}

function linkedTabOf(guildId: string, tabId: string): LinkedTab {
  const t = store.getSheetSettings(guildId).linkedTabs.find((x) => x.id === tabId)
  if (!t) throw new Error('Essa aba ligada não está guardada — carrega em Guardar primeiro.')
  return t
}

export async function applyMemberSheetSettings(guild: Guild, input: MemberSheetSettings): Promise<MemberSheetState> {
  const d = defaultMemberSheetSettings()
  await guild.roles.fetch().catch(() => undefined)
  const txt = (v: unknown, max: number, fb: string) => (typeof v === 'string' ? v.slice(0, max).trim() || fb : fb)
  // O Google aceita quase tudo no nome de uma aba (o nome vai sempre entre aspas) — só se tiram
  // caracteres de controlo, para poder escolher abas que já existem com o nome exato.
  // eslint-disable-next-line no-control-regex
  const tab = (v: string) => v.replace(/[\u0000-\u001f]/g, '').slice(0, 100).trim()
  const keys = Object.keys(SHEET_COLUMN_LABELS) as SheetColumnKey[]
  const spreadsheetId = input.spreadsheetId ? parseSpreadsheetId(input.spreadsheetId) : ''
  if (input.spreadsheetId && !spreadsheetId) throw new Error('Não percebi o link da planilha — cola o link completo (https://docs.google.com/spreadsheets/d/…).')
  const seenSections = new Set<string>()
  const next: MemberSheetSettings = {
    autoRegister: input.autoRegister !== false,
    spreadsheetId,
    syncMinutes: Math.min(1440, Math.max(0, Math.round(Number(input.syncMinutes) || 0))),
    sections: (Array.isArray(input.sections) ? input.sections : [])
      .filter((s) => s && guild.roles.cache.has(s.roleId) && !seenSections.has(s.roleId) && Boolean(seenSections.add(s.roleId)))
      .slice(0, 30)
      .map((s, i) => ({ id: typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : `sec${i}`, roleId: s.roleId, tabName: tab(s.tabName || '') || guild.roles.cache.get(s.roleId)!.name.slice(0, 90) })),
    placement: input.placement === 'all' ? 'all' : 'first',
    allTab: { enabled: input.allTab?.enabled !== false, name: tab(input.allTab?.name ?? '') || d.allTab.name },
    otherTab: { enabled: Boolean(input.otherTab?.enabled), name: tab(input.otherTab?.name ?? '') || d.otherTab.name },
    includeLeft: input.includeLeft !== false,
    columns: [
      ...(Array.isArray(input.columns) ? input.columns : [])
        .filter((c, i, arr) => c && keys.includes(c.key) && arr.findIndex((x) => x.key === c.key) === i)
        .map((c) => ({ key: c.key, header: txt(c.header, 60, SHEET_COLUMN_LABELS[c.key]), show: Boolean(c.show) })),
    ],
    sortBy: input.sortBy === 'verificadoEm' || input.sortBy === 'pontos' ? input.sortBy : 'nome',
    trackedRoleIds: [...new Set(Array.isArray(input.trackedRoleIds) ? input.trackedRoleIds : [])].filter((id) => guild.roles.cache.has(id)),
    timezone: txt(input.timezone, 60, d.timezone),
    textActive: txt(input.textActive, 40, d.textActive),
    textLeft: txt(input.textLeft, 40, d.textLeft),
    backupChannelId: input.backupChannelId || null,
    backupHours: Math.min(720, Math.max(0, Math.round(Number(input.backupHours) || 0))),
    claimedTabs: [],
    linkedTabs: [],
  }
  for (const k of keys) if (!next.columns.some((c) => c.key === k)) next.columns.push({ key: k, header: SHEET_COLUMN_LABELS[k], show: false })
  // Autorizações só valem para abas que o bot vai mesmo usar.
  const used = new Set([...(next.allTab.enabled ? [next.allTab.name] : []), ...next.sections.map((x) => x.tabName), ...(next.otherTab.enabled ? [next.otherTab.name] : [])])
  next.linkedTabs = cleanLinkedTabs(guild, input.linkedTabs, tab, txt)
  next.claimedTabs = [...new Set((Array.isArray(input.claimedTabs) ? input.claimedTabs : []).filter((n): n is string => typeof n === 'string').map(tab))].filter((n) => used.has(n)).slice(0, 40)
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: next.timezone })
  } catch {
    next.timezone = d.timezone
  }
  if (next.backupChannelId) {
    const ch = await guild.channels.fetch(next.backupChannelId).catch(() => null)
    const me = guild.members.me ?? (await guild.members.fetchMe())
    if (!ch?.isTextBased() || !ch.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles])) {
      throw new Error('O bot não consegue enviar ficheiros no canal dos backups.')
    }
  }
  store.saveSheetSettings(guild.id, next)
  return getMemberSheetState(guild.id)
}

export async function applyMemberSheetAction(guild: Guild, action: MemberSheetAction): Promise<MemberSheetState> {
  const done = (message: string, extra: Partial<MemberSheetState> = {}) => ({ ...getMemberSheetState(guild.id), message, ...extra })
  switch (action.kind) {
    case 'sync':
      return done(await syncSheet(guild))
    case 'test': {
      const key = store.getGoogleKey()
      if (!key) throw new Error('Falta a chave da conta de serviço do Google.')
      const settings = store.getSheetSettings(guild.id)
      if (!settings.spreadsheetId) throw new Error('Falta o link da planilha.')
      const tabs = sheetTabs(guild)
      const sheet = await inspectSpreadsheet(key, settings.spreadsheetId, tabs[0]?.rows[0] ?? [])
      const theirs = new Set(sheet.tabs.filter((t) => t.owner === 'theirs').map((t) => t.name))
      const foreign = tabs.map((t) => t.name).filter((n) => theirs.has(n) && !settings.claimedTabs.includes(n))
      const base = `Ligado à planilha "${sheet.title}" (${sheet.tabs.length} aba(s)).`
      return done(foreign.length ? `${base} ${skippedText(foreign, true)}` : `${base} Está tudo pronto — as tuas outras abas ficam como estão.`, { sheet })
    }
    case 'linkDetect': {
      const { tab: draft, view } = await detectLinked(guild, typeof action.tabName === 'string' ? action.tabName : '')
      return done(`Li a aba "${draft.tabName}": cabeçalhos na linha ${draft.headerRow}, ID na coluna ${colLetter(draft.idCol)}. Confere o que vai em cada coluna e carrega em Guardar.`, { linkedDraft: draft, linkedView: view })
    }
    case 'linkedView': {
      const t = linkedTabOf(guild.id, action.tabId)
      return done('', { linkedView: await viewLinked(guild, t) })
    }
    case 'linkedAddMissing': {
      const t = linkedTabOf(guild.id, action.tabId)
      const message = await runLinked(guild, t, 'missing')
      return done(message, { linkedView: await viewLinked(guild, t) })
    }
    case 'linkedUndo': {
      const t = linkedTabOf(guild.id, action.tabId)
      const message = await undoLinked(guild, t)
      return done(message, { linkedView: await viewLinked(guild, t) })
    }
    case 'importMembers':
      return done(await importMembers(guild, Array.isArray(action.roleIds) ? action.roleIds : []))
    case 'restoreRoles':
      return done(await restoreRoles(guild, action.userId))
    case 'remove':
      store.removeRecord(guild.id, action.userId)
      return done('Membro tirado do registo (sai da planilha no próximo lote).')
    case 'register': {
      const m = await guild.members.fetch(action.userId).catch(() => null)
      if (!m) throw new Error('Esse membro não está no servidor.')
      store.upsertRecords(guild.id, [recordFrom(m, store.getRecord(guild.id, m.id))])
      return done(`${m.displayName} adicionado ao registo.`)
    }
    case 'backupNow':
      return done(await sendBackup(guild))
    case 'export':
      return done('Cópia pronta.', { exportJson: backupJson(guild) })
    case 'import':
      return done(importJson(guild, action.json))
  }
  throw new Error('Ação desconhecida.')
}

export function setGoogleKey(raw: string | null): { googleEmail: string | null } {
  if (raw === null) {
    store.clearGoogleKey()
    return { googleEmail: null }
  }
  return { googleEmail: store.saveGoogleKey(raw).client_email }
}
