import type { LinkedCellView, LinkedColumn, LinkedSource, LinkedTab, LinkedTabView } from './types'

// Abas ligadas: o bot trabalha dentro de uma aba que já existe (ex.: "Mov Call" da planilha da
// staff), com o formato, as listas e as regras dela. Só escreve célula a célula — nunca limpa a aba
// nem mexe na formatação, exceto as cores das linhas se isso estiver ligado.
// Este ficheiro não fala com o Google nem com o Discord: recebe a grelha lida e os membros, e
// devolve o plano (que células escrever, que linhas acrescentar, que linhas pintar).

export interface GridCell {
  /** Valor como aparece (formattedValue). */
  v: string
  /** Valor guardado (para desfazer): texto, número, booleano ou fórmula. */
  raw?: string | number | boolean
  formula?: boolean
  bg?: string
  fg?: string
  b?: boolean
}

export interface Grid {
  sheetId: number
  title: string
  rowCount: number
  rows: GridCell[][]
  merges: { r0: number; r1: number; c0: number; c1: number }[]
  /** Opções das listas (validação), por coluna. */
  options: Record<number, string[]>
}

export interface PlanMember {
  userId: string
  displayName: string
  tag: string
  roleIds: string[]
  inServer: boolean
  verifiedAt: string | null
  verified: boolean
  points: number
  seconds: number
}

export interface CellWrite {
  row: number
  col: number
  value: string | number
  before: string | number | boolean
  beforeFormula: boolean
}

export interface LinkedPlan {
  writes: CellWrite[]
  /** Linhas usadas para os novos (índice 0 = linha 1). */
  added: { row: number; userId: string; name: string }[]
  /** Linhas acrescentadas no fim da tabela (precisam do formato da última linha). */
  newRowsFrom: number | null
  newRowsCount: number
  /** Linha de onde se copia o formato e as listas. */
  templateRow: number
  colors: { row: number; bg: string; fg: string }[]
  rowStatus: Record<number, 'in' | 'out'>
  /** Células mudadas nas linhas que já existiam. */
  updates: number
}

export const LINKED_SOURCE_LABELS: Record<LinkedSource, string> = {
  keep: 'Não mexer (manual)',
  name: 'Nome no servidor',
  username: 'Utilizador do Discord',
  id: 'ID do Discord',
  role: 'Lista ligada a cargos',
  nextRole: 'Próximo cargo (a seguir na lista)',
  date: 'Data',
  status: 'Estado (no servidor / saiu)',
  points: 'Pontos MOV',
  hours: 'Horas MOV',
  fixed: 'Texto fixo',
}

export const colLetter = (c: number): string => (c < 26 ? String.fromCharCode(65 + c) : colLetter(Math.floor(c / 26) - 1) + String.fromCharCode(65 + (c % 26)))

export const parseUserId = (s: string | undefined): string | null => s?.match(/\d{17,20}/)?.[0] ?? null

export const formatId = (id: string, fmt: LinkedTab['idFormat']) => (fmt === 'mention' ? `<@${id}>` : id)

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const optionKey = (s: string) => norm(s).replace(/^\d+\s*/, '')
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** "dd/MM/yy", "dd/MM/yyyy", "dd-MM-yyyy HH:mm"… no fuso pedido. */
export function formatDateFmt(date: Date, fmt: string, tz: string): string {
  let parts: Record<string, string>
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(date)
        .map((p) => [p.type, p.value]),
    )
  } catch {
    return formatDateFmt(date, fmt, 'UTC')
  }
  return (fmt || 'dd/MM/yy').replace(/yyyy|yy|MM|dd|HH|mm/g, (t) =>
    t === 'yyyy' ? parts.year : t === 'yy' ? parts.year.slice(-2) : t === 'MM' ? parts.month : t === 'dd' ? parts.day : t === 'HH' ? parts.hour : parts.minute,
  )
}

/** A ordem das opções para "próximo cargo": pelo número no início (1 pearl, 2 …) se todas o tiverem; senão a ordem da lista. */
export function orderedOptions(options: string[]): string[] {
  const num = (o: string) => Number(o.trim().match(/^(\d+)/)?.[1] ?? NaN)
  if (options.length && options.every((o) => !Number.isNaN(num(o)))) return [...options].sort((a, b) => num(a) - num(b))
  return options
}

export function nextOption(options: string[], current: string): string {
  const list = orderedOptions(options)
  const i = list.findIndex((o) => same(o, current))
  return i >= 0 && i < list.length - 1 ? list[i + 1] : ''
}

/** A opção da lista que corresponde ao cargo mais alto (no Discord) que o membro tem. */
export function roleOption(col: LinkedColumn, roleIds: string[], rolePos: Map<string, number>): string | null {
  let best: { option: string; pos: number } | null = null
  for (const [option, roleId] of Object.entries(col.optionRoles)) {
    if (!roleId || !roleIds.includes(roleId)) continue
    const pos = rolePos.get(roleId) ?? 0
    if (!best || pos > best.pos) best = { option, pos }
  }
  return best?.option ?? null
}

/** Sugere a que cargo do Discord corresponde cada opção da lista, pelo nome (ignora o número do início, acentos e símbolos). */
export function suggestOptionRoles(options: string[], roles: { id: string; name: string }[]): Record<string, string> {
  const out: Record<string, string> = {}
  const keyed = roles.map((r) => ({ id: r.id, key: optionKey(r.name), full: norm(r.name) }))
  for (const o of options) {
    const k = optionKey(o)
    if (!k) continue
    const exact = keyed.filter((r) => r.key === k || r.full === norm(o))
    const loose = exact.length ? exact : keyed.filter((r) => k.length >= 3 && r.key.length >= 3 && (r.key.includes(k) || k.includes(r.key)))
    if (loose.length === 1 || exact.length >= 1) out[o] = (exact[0] ?? loose[0]).id
  }
  return out
}

export function emptyColumn(col: number, header: string, source: LinkedSource = 'keep'): LinkedColumn {
  return { col, header, source, updateExisting: false, optionRoles: {}, fallback: '', fromCol: null, dateOf: 'added', dateFormat: 'dd/MM/yy', activeValue: '', leftValue: '' }
}

/** A coluna do cargo "principal" (a do próximo cargo, ou a primeira lista de cargos que não é a das cores). */
export function mainRoleCol(tab: LinkedTab): number | null {
  const next = tab.columns.find((c) => c.source === 'nextRole' && c.fromCol !== null)
  if (next) return next.fromCol
  return tab.columns.find((c) => c.source === 'role' && c.col !== tab.colors.col)?.col ?? tab.columns.find((c) => c.source === 'role')?.col ?? null
}

/** Quem pertence à aba: os cargos escolhidos, ou (vazio) quem tem algum cargo ligado nas colunas de cargo. */
export function belongs(tab: LinkedTab, m: PlanMember): boolean {
  if (tab.roleIds.length) return m.roleIds.some((id) => tab.roleIds.includes(id))
  const mapped = new Set(tab.columns.filter((c) => c.source === 'role').flatMap((c) => Object.values(c.optionRoles).filter(Boolean)))
  return m.roleIds.some((id) => mapped.has(id))
}

/** Lê a aba e adivinha a ligação: cabeçalhos, coluna do ID, o que vai em cada coluna, cargos e cores. */
export function detectLinkedTab(grid: Grid, tabName: string, roles: { id: string; name: string }[], id: string): LinkedTab {
  const rows = grid.rows
  const filled = (r: GridCell[] | undefined) => (r ?? []).filter((c) => c?.v?.trim()).length
  let h = rows.findIndex((r) => filled(r) >= 3)
  if (h < 0) h = 0
  const header = rows[h] ?? []
  const data = rows.slice(h + 1)
  const width = Math.max(header.length, ...data.slice(0, 50).map((r) => r.length), 1)
  const headers = Array.from({ length: width }, (_, c) => header[c]?.v?.trim() ?? '')
  const idHits = (c: number) => data.filter((r) => parseUserId(r[c]?.v)).length
  let idCol = headers.findIndex((t) => /^(discord\s*)?id$|^id\s*(do\s*)?discord$|^user\s*id$/i.test(t))
  if (idCol < 0) {
    const counts = headers.map((_, c) => idHits(c))
    const best = Math.max(...counts)
    idCol = best > 0 ? counts.indexOf(best) : 0
  }
  const idFormat: LinkedTab['idFormat'] = data.some((r) => r[idCol]?.v?.includes('<@')) ? 'mention' : 'plain'
  const opts = (c: number) => grid.options[c] ?? []
  const findOpt = (c: number, re: RegExp) => opts(c).find((o) => re.test(o)) ?? ''

  const columns: LinkedColumn[] = []
  headers.forEach((t, c) => {
    if (!t && c !== idCol) return
    const col = emptyColumn(c, t || colLetter(c))
    if (c === idCol) col.source = 'id'
    else if (/pr[oó]x/i.test(t)) col.source = 'nextRole'
    else if (/hierarq|posi[cç][aã]o|n[ií]vel/i.test(t)) col.source = 'role'
    else if (/cargo|patente|rank/i.test(t)) col.source = 'role'
    else if (/^(nome|nick|apelido|membro)/i.test(t)) col.source = 'name'
    else if (/usu[aá]rio|utilizador|user/i.test(t)) col.source = 'username'
    else if (/data|dia\b/i.test(t)) {
      col.source = 'date'
      col.dateOf = /up|promo|subiu/i.test(t) ? 'roleChange' : /verif|entr/i.test(t) ? 'verified' : 'added'
      const sample = data.map((r) => r[c]?.v ?? '').find((v) => /\d/.test(v)) ?? ''
      col.dateFormat = /^\d{2}\/\d{2}\/\d{4}/.test(sample) ? 'dd/MM/yyyy' : 'dd/MM/yy'
    } else if (/ativ|estado|status|situa/i.test(t)) {
      col.source = 'status'
      col.activeValue = findOpt(c, /^ativ/i) || (opts(c).length ? '' : 'Ativo')
      // Quem saiu do servidor: "Saiu"/"Fora"/"Desligado" antes de "Inativo" (inativo não é ter saído).
      col.leftValue = findOpt(c, /^sai|saiu|fora|desligad|removid|expuls/i) || findOpt(c, /inativ/i)
    } else if (/ponto/i.test(t)) col.source = 'points'
    else if (/hora/i.test(t)) col.source = 'hours'
    if (col.source === 'role') {
      col.optionRoles = suggestOptionRoles(opts(c), roles)
      if (/hierarq/i.test(t)) col.fallback = findOpt(c, /^staff|^membro/i)
    }
    columns.push(col)
  })
  const cargo = columns.find((x) => x.source === 'role' && /cargo|patente|rank/i.test(x.header)) ?? columns.find((x) => x.source === 'role')
  for (const x of columns) if (x.source === 'nextRole') x.fromCol = cargo?.col ?? null

  // Cores: pela coluna de hierarquia, com as cores que já lá estão (a primeira linha com cada valor).
  const hier = columns.find((x) => /hierarq/i.test(x.header))
  const lastCol = Math.max(...columns.map((x) => x.col), 0)
  const values = hier ? (opts(hier.col).length ? opts(hier.col) : [...new Set(data.map((r) => r[hier.col]?.v?.trim()).filter((v): v is string => Boolean(v)))]) : []
  const rules = values.map((value) => {
    const row = data.find((r) => same(r[hier!.col]?.v ?? '', value) && parseUserId(r[idCol]?.v))
    return { value, bg: row?.[0]?.bg ?? '', fg: row?.[0]?.fg ?? '' }
  })
  return {
    id,
    enabled: true,
    tabName,
    headerRow: h + 1,
    idCol,
    idFormat,
    columns,
    roleIds: [],
    autoAdd: true,
    colors: { enabled: false, col: hier?.col ?? null, fromCol: 0, toCol: lastCol, rules },
  }
}

/**
 * O plano de um lote. `addIds` = quem acrescentar (pela ordem); quem já está na aba (pelo ID) nunca
 * é acrescentado outra vez. Linhas existentes só mudam nas colunas com "também nas linhas que já
 * existem". Nada é apagado.
 */
export function planLinkedTab(
  tab: LinkedTab,
  grid: Grid,
  ctx: { members: Map<string, PlanMember>; addIds: string[]; now: Date; tz: string; rolePos: Map<string, number> },
): LinkedPlan {
  const rows = grid.rows
  const start = Math.max(1, tab.headerRow) // índice 0-based da 1.ª linha de dados
  const writes: CellWrite[] = []
  const rowStatus: Record<number, 'in' | 'out'> = {}
  const existing = new Map<string, number>()
  const empty: number[] = []
  // Linha vazia = sem ID e sem nada nas colunas de nome nem na coluna A (assim uma linha de título
  // ou separador nunca é tomada por vazia).
  const nameCols = [...new Set([0, ...tab.columns.filter((c) => c.source === 'name' || c.source === 'username').map((c) => c.col)])].filter((c) => c !== tab.idCol)
  for (let r = start; r < rows.length; r++) {
    const id = parseUserId(rows[r]?.[tab.idCol]?.v)
    if (id) {
      if (!existing.has(id)) existing.set(id, r)
      rowStatus[r] = ctx.members.get(id)?.inServer ? 'in' : 'out'
    } else if (nameCols.every((c) => !rows[r]?.[c]?.v?.trim())) empty.push(r)
  }
  const cellAt = (r: number, c: number) => rows[r]?.[c]
  const final = new Map<string, string>() // "r:c" → valor depois do lote
  const current = (r: number, c: number) => final.get(`${r}:${c}`) ?? cellAt(r, c)?.v ?? ''
  const put = (r: number, c: number, value: string | number) => {
    const cell = cellAt(r, c)
    if (String(cell?.v ?? '') === String(value) && (cell?.raw === undefined || String(cell.raw) === String(value))) return false
    writes.push({ row: r, col: c, value, before: cell?.raw ?? '', beforeFormula: Boolean(cell?.formula) })
    final.set(`${r}:${c}`, String(value))
    return true
  }
  const hours = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
  const opts = (c: number) => grid.options[c] ?? []
  const ordered = [...tab.columns].sort((a, b) => (a.source === 'nextRole' || a.source === 'date' ? 1 : 0) - (b.source === 'nextRole' || b.source === 'date' ? 1 : 0))

  /** Valores de uma linha. `isNew` = linha acabada de acrescentar. */
  const fillRow = (r: number, m: PlanMember | null, isNew: boolean) => {
    const changed = new Set<number>()
    let n = 0
    for (const c of ordered) {
      if (c.source === 'keep') continue
      if (!isNew && !c.updateExisting) continue
      let value: string | number | null = null
      switch (c.source) {
        case 'name':
          value = m?.displayName ?? null
          break
        case 'username':
          value = m?.tag ?? null
          break
        case 'id':
          value = isNew && m ? formatId(m.userId, tab.idFormat) : null
          break
        case 'role':
          // Linhas que já existem: sem cargo ligado, fica como está (o valor por omissão é só para as novas).
          value = m?.inServer ? (roleOption(c, m.roleIds, ctx.rolePos) ?? (isNew ? c.fallback : null)) : null
          break
        case 'nextRole': {
          const base = c.fromCol !== null ? current(r, c.fromCol) : ''
          if (!isNew && !(c.fromCol !== null && changed.has(c.fromCol))) break
          value = (base && nextOption(opts(c.fromCol ?? -1), base)) || c.fallback || ''
          break
        }
        case 'date': {
          const roleCol = mainRoleCol(tab)
          if (!isNew && c.dateOf === 'roleChange' && !(roleCol !== null && changed.has(roleCol))) break
          if (!isNew && c.dateOf !== 'roleChange') break
          const when = c.dateOf === 'verified' && m?.verifiedAt ? new Date(m.verifiedAt) : ctx.now
          value = formatDateFmt(when, c.dateFormat, ctx.tz)
          break
        }
        case 'status':
          value = m?.inServer ? c.activeValue || null : c.leftValue || null
          break
        case 'points':
          value = m ? m.points : null
          break
        case 'hours':
          value = m ? hours(m.seconds) : null
          break
        case 'fixed':
          value = isNew ? c.fallback : null
          break
      }
      if (value === null) continue
      if (put(r, c.col, value)) {
        changed.add(c.col)
        n++
      }
    }
    return n
  }

  let updates = 0
  for (const [id, r] of existing) updates += fillRow(r, ctx.members.get(id) ?? null, false)

  const added: LinkedPlan['added'] = []
  const toAdd = [...new Set(ctx.addIds)].filter((id) => !existing.has(id) && ctx.members.get(id)?.inServer)
  let next = rows.length
  let newRowsFrom: number | null = null
  for (const id of toAdd) {
    const r = empty.shift() ?? next++
    if (r >= rows.length && newRowsFrom === null) newRowsFrom = r
    const m = ctx.members.get(id)!
    fillRow(r, m, true)
    rowStatus[r] = 'in'
    added.push({ row: r, userId: id, name: m.displayName })
  }

  const colors: LinkedPlan['colors'] = []
  if (tab.colors.enabled && tab.colors.col !== null) {
    const rowsWithId = [...existing.values(), ...added.map((a) => a.row)]
    for (const r of rowsWithId) {
      const value = current(r, tab.colors.col)
      const rule = tab.colors.rules.find((x) => same(x.value, value))
      if (!rule || (!rule.bg && !rule.fg)) continue
      const cell = cellAt(r, tab.colors.fromCol)
      const isNewRow = r >= rows.length
      const bgOk = !rule.bg || (!isNewRow && cell?.bg?.toLowerCase() === rule.bg.toLowerCase())
      const fgOk = !rule.fg || (!isNewRow && cell?.fg?.toLowerCase() === rule.fg.toLowerCase())
      if (!bgOk || !fgOk) colors.push({ row: r, bg: rule.bg, fg: rule.fg })
    }
  }

  // Formato para as linhas novas: o da última linha da tabela.
  let templateRow = rows.length - 1
  while (templateRow > start && !rows[templateRow]?.length) templateRow--
  return { writes, added, newRowsFrom, newRowsCount: newRowsFrom === null ? 0 : next - newRowsFrom, templateRow: Math.max(start, templateRow), colors, rowStatus, updates }
}

export const MAX_VIEW_ROWS = 400

/** Quantas colunas a aba usa (as ligadas + as pintadas). */
export const linkedWidth = (tab: LinkedTab) => Math.max(tab.idCol, ...tab.columns.map((c) => c.col), tab.colors.enabled ? tab.colors.toCol : 0) + 1

/** Quem acrescentar: "missing" = todos os do servidor que pertencem à aba; "auto" = só os verificados. */
export function linkedCandidates(tab: LinkedTab, members: Map<string, PlanMember>, mode: 'auto' | 'missing'): string[] {
  const list = [...members.values()].filter((m) => belongs(tab, m))
  if (mode === 'missing') return list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt')).map((m) => m.userId)
  if (!tab.autoAdd) return []
  return list
    .filter((m) => m.verified)
    .sort((a, b) => (a.verifiedAt ?? '').localeCompare(b.verifiedAt ?? ''))
    .map((m) => m.userId)
}

export function buildLinkedView(tab: LinkedTab, grid: Grid, spreadsheetTitle: string, url: string, ctx: { members: Map<string, PlanMember>; rolePos: Map<string, number>; tz: string }): LinkedTabView {
  const base = { members: ctx.members, now: new Date(), tz: ctx.tz, rolePos: ctx.rolePos }
  const auto = planLinkedTab(tab, grid, { ...base, addIds: linkedCandidates(tab, ctx.members, 'auto') })
  const missing = planLinkedTab(tab, grid, { ...base, addIds: linkedCandidates(tab, ctx.members, 'missing') })
  const width = linkedWidth(tab)
  const rows: LinkedCellView[][] = grid.rows.slice(0, MAX_VIEW_ROWS).map((r) =>
    Array.from({ length: width }, (_, c) => {
      const cell = r[c]
      if (!cell) return { v: '' }
      return { v: cell.v, ...(cell.bg && cell.bg !== '#ffffff' ? { bg: cell.bg } : {}), ...(cell.fg && cell.fg !== '#000000' ? { fg: cell.fg } : {}), ...(cell.b ? { b: true } : {}) }
    }),
  )
  return {
    tabId: tab.id,
    spreadsheetTitle,
    tabName: grid.title,
    url,
    headerRow: tab.headerRow,
    rows,
    merges: grid.merges.filter((m) => m.r0 < MAX_VIEW_ROWS && m.c0 < width),
    rowStatus: auto.rowStatus,
    options: grid.options,
    autoAdd: auto.added.map((a) => ({ userId: a.userId, name: a.name })),
    missing: missing.added.map((a) => ({ userId: a.userId, name: a.name })),
    updates: auto.updates,
    recolor: auto.colors.length,
  }
}

