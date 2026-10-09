import type { LinkedTab, LinkedTabView, RolePickerEntry } from '../../shared/types'
import { buildLinkedView, detectLinkedTab, linkedCandidates, planLinkedTab, type Grid, type GridCell, type PlanMember } from '../../shared/linkedSheet'

// Modo demonstração das abas ligadas: uma aba "Mov Call" fictícia (nomes e IDs inventados), com a
// mesma lógica do bot (shared/linkedSheet.ts) — ligar, ver, adicionar quem falta e desfazer.

export const DEMO_LINKED_ROLES: RolePickerEntry[] = [
  { id: '700000000000000101', name: 'Líder', color: '#F0B232' },
  { id: '700000000000000102', name: 'Sub Líder', color: '#E67E22' },
  { id: '700000000000000103', name: 'Gerente', color: '#9B59B6' },
  { id: '700000000000000104', name: 'Staff', color: '#95A5A6' },
  { id: '700000000000000111', name: 'pearl', color: '#B9BBBE' },
  { id: '700000000000000112', name: 'infa', color: '#3498DB' },
  { id: '700000000000000113', name: 'affection', color: '#1ABC9C' },
  { id: '700000000000000114', name: 'dior', color: '#2ECC71' },
  { id: '700000000000000115', name: 'fame', color: '#E91E63' },
]
const SUP = '700000000000000004'
const R = Object.fromEntries(DEMO_LINKED_ROLES.map((r) => [r.name, r.id]))

const CARGOS = ['1 pearl', '2 infa', '3 affection', '4 dior', '5 fame']
const HIER = ['LIDER', 'SUB LIDER', 'GERENTE', 'SUPERVISOR', 'STAFF']
const ATIV = ['Ativo', 'Inativo', 'Saiu']
const BLACK = '#000000'
const WHITE = '#ffffff'
const GREY = '#b7b7b7'

const id = (n: number) => `1000000000000${String(n).padStart(5, '0')}`
const cell = (v: string, bg: string, fg = BLACK, b = false): GridCell => ({ v, raw: v || undefined, bg, fg, b: b || undefined })
const line = (vals: string[], bg: string, fg = BLACK) => Array.from({ length: 7 }, (_, i) => cell(vals[i] ?? '', bg, fg))

const people: [string, number, string, string, string, string, string[]][] = [
  ['luna', 1, '04/10/26', '5 fame', '', 'LIDER', [R['Líder'], R.fame]],
  ['kai', 2, '04/10/26', '4 dior', '5 fame', 'SUB LIDER', [R['Sub Líder'], R.dior]],
  ['mel', 3, '00/00/00', '4 dior', '5 fame', 'SUPERVISOR', [SUP, R.dior]],
  ['theo', 4, '00/00/00', '3 affection', '4 dior', 'SUPERVISOR', [SUP, R.affection]],
  ['nina', 5, '00/00/00', '2 infa', '3 affection', 'STAFF', [R.Staff, R.infa]],
  ['rafa', 6, '00/00/00', '1 pearl', '2 infa', 'STAFF', [R.Staff, R.pearl]],
  ['bia', 7, '00/00/00', '1 pearl', '', 'STAFF', [R.Staff, R.pearl]],
  ['vini', 8, '00/00/00', '1 pearl', '', 'STAFF', []],
]

function freshGrid(): Grid {
  const rows: GridCell[][] = [
    [cell('Mov Call', BLACK, WHITE, true), ...Array.from({ length: 6 }, () => cell('', BLACK, WHITE))],
    ['Nome', 'ID', 'DATA UP', 'Cargo', 'Próx.Cargo', 'Hierarquia', 'Atividade'].map((h) => cell(h, WHITE, BLACK, true)),
    ...people.map(([name, n, date, cargo, prox, hier]) => line([name, `<@${id(n)}>`, date, cargo, prox, hier, 'Ativo'], hier === 'STAFF' ? GREY : BLACK, hier === 'STAFF' ? BLACK : WHITE)),
    ...Array.from({ length: 6 }, () => line(['', '<@>', '', '', '', 'STAFF', 'Ativo'], GREY)),
  ]
  return { sheetId: 7, title: 'Mov Call', rowCount: rows.length, rows, merges: [{ r0: 0, r1: 1, c0: 0, c1: 7 }], options: { 3: CARGOS, 4: CARGOS, 5: HIER, 6: ATIV } }
}

let grid = freshGrid()
const undo: Record<string, { at: string; cells: { row: number; col: number; value: string | number | boolean }[] }[]> = {}

function members(): Map<string, PlanMember> {
  const out = new Map<string, PlanMember>()
  const add = (n: number, name: string, roleIds: string[], verified = false) =>
    out.set(id(n), { userId: id(n), displayName: name, tag: name, roleIds, inServer: true, verifiedAt: verified ? new Date(Date.now() - 86_400_000).toISOString() : null, verified, points: 40 + n * 5, seconds: n * 5400 })
  for (const [name, n, , , , , roles] of people) if (n !== 8) add(n, name, roles) // vini saiu do servidor
  add(20, 'zoe', [R.Staff, R.pearl], true)
  add(21, 'gabi', [R.Staff, R.infa], true)
  add(22, 'davi', [R.pearl])
  return out
}
const rolePos = new Map([...DEMO_LINKED_ROLES.map((r, i) => [r.id, 50 - i] as const), [SUP, 46]])
const URL = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=7'
const ctx = () => ({ members: members(), rolePos, tz: 'America/Sao_Paulo' })

export function demoLinkedDetect(tabName: string, roles: RolePickerEntry[]): { tab: LinkedTab; view: LinkedTabView } {
  const tab = detectLinkedTab(grid, tabName, roles, `lk${Date.now().toString(36)}`)
  return { tab, view: demoLinkedView(tab) }
}

export function demoLinkedView(tab: LinkedTab): LinkedTabView {
  return buildLinkedView(tab, grid, 'Planilha Staff', URL, ctx())
}

export function demoLinkedRun(tab: LinkedTab, mode: 'auto' | 'missing'): string {
  const c = ctx()
  const plan = planLinkedTab(tab, grid, { ...c, addIds: linkedCandidates(tab, c.members, mode), now: new Date() })
  if (!plan.writes.length && !plan.colors.length) return `Aba "${tab.tabName}": nada a mudar.`
  const rows = grid.rows.map((r) => r.map((x) => ({ ...x })))
  const ensure = (r: number) => {
    while (rows.length <= r) rows.push(rows[plan.templateRow].map((x) => ({ ...x, v: '', raw: undefined })))
  }
  undo[tab.id] = [...(undo[tab.id] ?? []), { at: new Date().toISOString(), cells: plan.writes.map((w) => ({ row: w.row, col: w.col, value: w.before })) }]
  for (const w of plan.writes) {
    ensure(w.row)
    rows[w.row][w.col] = { ...rows[w.row][w.col], v: String(w.value), raw: w.value }
  }
  for (const k of plan.colors) for (let x = tab.colors.fromCol; x <= tab.colors.toCol; x++) rows[k.row][x] = { ...rows[k.row][x], ...(k.bg ? { bg: k.bg } : {}), ...(k.fg ? { fg: k.fg } : {}) }
  grid = { ...grid, rows, rowCount: Math.max(grid.rowCount, rows.length) }
  const parts = [plan.added.length ? `+${plan.added.length} membro(s) (${plan.added.map((a) => a.name).join(', ')})` : '', plan.updates ? `${plan.updates} célula(s) atualizada(s)` : '', plan.colors.length ? `${plan.colors.length} linha(s) pintada(s)` : ''].filter(Boolean)
  return `Aba "${tab.tabName}": ${parts.join(', ')} (demonstração).`
}

export function demoLinkedUndo(tab: LinkedTab): string {
  const entry = undo[tab.id]?.pop()
  if (!entry) throw new Error('Não há nenhum lote para desfazer nesta aba.')
  const rows = grid.rows.map((r) => r.map((x) => ({ ...x })))
  for (const c of entry.cells) if (rows[c.row]) rows[c.row][c.col] = { ...rows[c.row][c.col], v: String(c.value ?? ''), raw: c.value }
  grid = { ...grid, rows }
  return `Desfeito: ${entry.cells.length} célula(s) voltaram a como estavam (demonstração).`
}

export function demoLinkedUndoSummary(): Record<string, { at: string; cells: number }> {
  return Object.fromEntries(
    Object.entries(undo)
      .filter(([, l]) => l.length)
      .map(([k, l]) => [k, { at: l[l.length - 1].at, cells: l[l.length - 1].cells.length }]),
  )
}
