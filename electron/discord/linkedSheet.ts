import type { Guild } from 'discord.js'
import type { LinkedTab, LinkedTabView } from '../../shared/types'
import { buildLinkedView, detectLinkedTab, linkedCandidates as candidates, linkedWidth as widthOf, MAX_VIEW_ROWS, planLinkedTab, type PlanMember } from '../../shared/linkedSheet'
import * as store from '../store/memberRegistry'
import * as movPoints from '../store/movPoints'
import { colorRows, prepareRows, readGrid, writeCells } from './googleSheets'

// Abas ligadas (ver shared/linkedSheet.ts): o bot lê a aba como ela está, vê pelo ID quem está no
// servidor, acrescenta quem falta nas linhas vazias da tabela (com o formato e as listas dela) e,
// se pedido, atualiza colunas e pinta as linhas. Antes de cada lote guarda o valor anterior de cada
// célula que muda, para dar para desfazer.

const busy = new Set<string>()

function need() {
  const key = store.getGoogleKey()
  if (!key) throw new Error('Falta a chave da conta de serviço do Google (em Ligação ao Google).')
  return key
}


async function serverMembers(guild: Guild): Promise<Map<string, PlanMember>> {
  let list
  try {
    list = [...(await guild.members.fetch()).values()]
  } catch {
    throw new Error('Não consegui ler a lista de membros do servidor — confirma que a "Server Members Intent" do bot está ligada no Discord Developer Portal.')
  }
  const records = new Map(store.listRecords(guild.id).map((r) => [r.userId, r]))
  const pts = new Map(movPoints.getLeaderboard(guild.id).map((e) => [e.userId, e]))
  const out = new Map<string, PlanMember>()
  for (const m of list) {
    if (m.user.bot) continue
    const rec = records.get(m.id)
    out.set(m.id, {
      userId: m.id,
      displayName: m.displayName,
      tag: m.user.tag.replace(/#0$/, ''),
      roleIds: [...m.roles.cache.keys()],
      inServer: true,
      verifiedAt: rec?.verifiedAt ?? null,
      verified: rec?.source === 'verificacao' && Boolean(rec.verifiedAt),
      points: pts.get(m.id)?.points ?? 0,
      seconds: pts.get(m.id)?.totalSeconds ?? 0,
    })
  }
  return out
}

async function load(guild: Guild, tab: LinkedTab, rows = 1000) {
  const key = need()
  const settings = store.getSheetSettings(guild.id)
  if (!settings.spreadsheetId) throw new Error('Falta o link da planilha.')
  await guild.roles.fetch().catch(() => undefined)
  const grid = await readGrid(key, settings.spreadsheetId, tab.tabName, widthOf(tab), rows)
  const members = await serverMembers(guild)
  const rolePos = new Map([...guild.roles.cache.values()].map((r) => [r.id, r.position]))
  return { key, settings, grid, members, rolePos }
}

/** Lê a aba e sugere a ligação (cabeçalhos, ID, colunas, cargos, cores) — ainda não é guardada. */
export async function detectLinked(guild: Guild, tabName: string): Promise<{ tab: LinkedTab; view: LinkedTabView }> {
  const key = need()
  const settings = store.getSheetSettings(guild.id)
  if (!settings.spreadsheetId) throw new Error('Falta o link da planilha.')
  await guild.roles.fetch().catch(() => undefined)
  const sample = await readGrid(key, settings.spreadsheetId, tabName, 26, 80)
  const roles = [...guild.roles.cache.values()].filter((r) => r.id !== guild.id && !r.managed).map((r) => ({ id: r.id, name: r.name }))
  const tab = detectLinkedTab(sample, sample.title, roles, `lk${Date.now().toString(36)}`)
  return { tab, view: await viewLinked(guild, tab) }
}

export async function viewLinked(guild: Guild, tab: LinkedTab): Promise<LinkedTabView> {
  const { settings, grid, members, rolePos } = await load(guild, tab, MAX_VIEW_ROWS)
  return buildLinkedView(tab, grid, grid.spreadsheetTitle, `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/edit#gid=${grid.sheetId}`, { members, rolePos, tz: settings.timezone })
}

/**
 * Um lote numa aba ligada. "auto" = o que o lote automático faz (acrescenta verificados, atualiza as
 * colunas marcadas, pinta); "missing" = acrescenta toda a gente do servidor que pertence à aba e falta.
 */
export async function runLinked(guild: Guild, tab: LinkedTab, mode: 'auto' | 'missing'): Promise<string> {
  const lock = `${guild.id}:${tab.id}`
  if (busy.has(lock)) return `Aba "${tab.tabName}": já está a ser atualizada.`
  busy.add(lock)
  try {
    const { key, settings, grid, members, rolePos } = await load(guild, tab)
    const plan = planLinkedTab(tab, grid, { members, addIds: candidates(tab, members, mode), now: new Date(), tz: settings.timezone, rolePos })
    if (!plan.writes.length && !plan.colors.length) return `Aba "${tab.tabName}": nada a mudar.`
    if (plan.newRowsFrom !== null && plan.newRowsCount) await prepareRows(key, settings.spreadsheetId, grid, plan.templateRow, plan.newRowsFrom, plan.newRowsCount, widthOf(tab))
    if (plan.writes.length) {
      store.pushLinkedUndo(guild.id, tab.id, {
        at: new Date().toISOString(),
        tabName: tab.tabName,
        cells: plan.writes.map((w) => ({ row: w.row, col: w.col, value: w.before, formula: w.beforeFormula, after: w.value })),
      })
      try {
        await writeCells(key, settings.spreadsheetId, tab.tabName, plan.writes.map((w) => ({ row: w.row, col: w.col, value: w.value })))
      } catch (err) {
        store.popLinkedUndo(guild.id, tab.id)
        throw err
      }
    }
    if (plan.colors.length) await colorRows(key, settings.spreadsheetId, grid.sheetId, tab.colors.fromCol, tab.colors.toCol, plan.colors)
    const parts: string[] = []
    if (plan.added.length) parts.push(`+${plan.added.length} membro(s) (${plan.added.slice(0, 8).map((a) => a.name).join(', ')}${plan.added.length > 8 ? '…' : ''})`)
    if (plan.updates) parts.push(`${plan.updates} célula(s) atualizada(s)`)
    if (plan.colors.length) parts.push(`${plan.colors.length} linha(s) pintada(s)`)
    return `Aba "${tab.tabName}": ${parts.join(', ') || 'nada a mudar'}.`
  } finally {
    busy.delete(lock)
  }
}

/** Volta a pôr como estavam as células do último lote — só as que ninguém mudou depois. */
export async function undoLinked(guild: Guild, tab: LinkedTab): Promise<string> {
  const entry = store.peekLinkedUndo(guild.id, tab.id)
  if (!entry) throw new Error('Não há nenhum lote para desfazer nesta aba.')
  const key = need()
  const settings = store.getSheetSettings(guild.id)
  const width = Math.max(...entry.cells.map((c) => c.col)) + 1
  const maxRow = Math.max(...entry.cells.map((c) => c.row)) + 1
  const grid = await readGrid(key, settings.spreadsheetId, entry.tabName, width, maxRow)
  const ok = entry.cells.filter((c) => String(grid.rows[c.row]?.[c.col]?.raw ?? grid.rows[c.row]?.[c.col]?.v ?? '') === String(c.after ?? ''))
  if (ok.length) await writeCells(key, settings.spreadsheetId, entry.tabName, ok.map((c) => ({ row: c.row, col: c.col, value: c.value, formula: c.formula })))
  store.popLinkedUndo(guild.id, tab.id)
  const skipped = entry.cells.length - ok.length
  return `Desfeito: ${ok.length} célula(s) voltaram a como estavam${skipped ? ` (${skipped} não, porque alguém já as tinha mudado)` : ''}. As cores ficam como estão.`
}
