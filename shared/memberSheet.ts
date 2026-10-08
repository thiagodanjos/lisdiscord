import type { MemberRecord, MemberSheetSettings, SheetColumn, SheetColumnKey } from './types'

// Registo de membros → linhas da planilha. Partilhado entre o bot (que escreve no Google Sheets) e a
// app (pré-visualização), para a app mostrar exatamente o que vai para a planilha.

export const SHEET_COLUMN_LABELS: Record<SheetColumnKey, string> = {
  nome: 'Nome',
  utilizador: 'Utilizador',
  id: 'ID',
  cargo: 'Cargo principal',
  cargos: 'Cargos',
  verificadoEm: 'Verificado em',
  verificadoPor: 'Verificado por',
  entrouEm: 'Entrou no servidor',
  pontos: 'Pontos',
  horas: 'Horas',
  estado: 'Estado',
}

export function defaultSheetColumns(): SheetColumn[] {
  const on: SheetColumnKey[] = ['nome', 'utilizador', 'id', 'cargo', 'verificadoEm', 'verificadoPor', 'estado']
  return (Object.keys(SHEET_COLUMN_LABELS) as SheetColumnKey[]).map((key) => ({ key, header: SHEET_COLUMN_LABELS[key], show: on.includes(key) }))
}

export function defaultMemberSheetSettings(): MemberSheetSettings {
  return {
    autoRegister: true,
    spreadsheetId: '',
    syncMinutes: 30,
    sections: [],
    placement: 'first',
    allTab: { enabled: true, name: 'Todos' },
    otherTab: { enabled: false, name: 'Outros' },
    includeLeft: true,
    columns: defaultSheetColumns(),
    sortBy: 'nome',
    trackedRoleIds: [],
    timezone: 'America/Sao_Paulo',
    textActive: 'Ativo',
    textLeft: 'Saiu',
    backupChannelId: null,
    backupHours: 24,
    claimedTabs: [],
  }
}

/** Aceita o link completo da planilha ou só o ID. */
export function parseSpreadsheetId(raw: string): string {
  const v = raw.trim()
  const m = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)
  if (m) return m[1]
  return /^[a-zA-Z0-9_-]{20,}$/.test(v) ? v : ''
}

export interface SheetExtras {
  points?: Map<string, { points: number; totalSeconds: number }>
  roleNames?: Map<string, string>
}

function formatDate(iso: string | null, tz: string): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}

function hours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** O cargo principal: o primeiro da lista de abas que o membro tem. */
export function mainSection(s: MemberSheetSettings, r: MemberRecord) {
  return s.sections.find((sec) => r.roleIds.includes(sec.roleId)) ?? null
}

function cell(key: SheetColumnKey, s: MemberSheetSettings, r: MemberRecord, extras: SheetExtras): string | number {
  const roleName = (id: string) => extras.roleNames?.get(id) ?? r.roleNames[r.roleIds.indexOf(id)] ?? id
  switch (key) {
    case 'nome':
      return r.displayName
    case 'utilizador':
      return r.tag
    case 'id':
      // Vai como texto (RAW) — o Sheets não o arredonda como se fosse um número.
      return r.userId
    case 'cargo': {
      const sec = mainSection(s, r)
      return sec ? roleName(sec.roleId) : ''
    }
    case 'cargos':
      return r.roleIds
        .filter((id) => s.trackedRoleIds.length === 0 || s.trackedRoleIds.includes(id))
        .map(roleName)
        .join(', ')
    case 'verificadoEm':
      return formatDate(r.verifiedAt, s.timezone)
    case 'verificadoPor':
      return r.verifiedByTag ?? ''
    case 'entrouEm':
      return formatDate(r.joinedAt, s.timezone)
    case 'pontos':
      return extras.points?.get(r.userId)?.points ?? 0
    case 'horas':
      return hours(extras.points?.get(r.userId)?.totalSeconds ?? 0)
    case 'estado':
      return r.inServer ? s.textActive : s.textLeft
  }
}

export interface SheetTab {
  name: string
  rows: (string | number)[][]
}

/** Monta todas as abas (cabeçalho + uma linha por membro). */
export function buildSheetTabs(s: MemberSheetSettings, records: MemberRecord[], extras: SheetExtras = {}): SheetTab[] {
  const cols = s.columns.filter((c) => c.show)
  const header = cols.map((c) => c.header || SHEET_COLUMN_LABELS[c.key])
  const visible = records.filter((r) => s.includeLeft || r.inServer)
  const sorted = [...visible].sort((a, b) => {
    if (s.sortBy === 'verificadoEm') return (b.verifiedAt ?? '').localeCompare(a.verifiedAt ?? '')
    if (s.sortBy === 'pontos') return (extras.points?.get(b.userId)?.points ?? 0) - (extras.points?.get(a.userId)?.points ?? 0)
    return a.displayName.localeCompare(b.displayName, 'pt')
  })
  const row = (r: MemberRecord) => cols.map((c) => cell(c.key, s, r, extras))
  const tabs: SheetTab[] = []
  if (s.allTab.enabled) tabs.push({ name: s.allTab.name || 'Todos', rows: [header, ...sorted.map(row)] })
  for (const sec of s.sections) {
    const members = sorted.filter((r) => (s.placement === 'all' ? r.roleIds.includes(sec.roleId) : mainSection(s, r)?.id === sec.id))
    tabs.push({ name: sec.tabName || 'Cargo', rows: [header, ...members.map(row)] })
  }
  if (s.otherTab.enabled) {
    const others = sorted.filter((r) => !mainSection(s, r))
    tabs.push({ name: s.otherTab.name || 'Outros', rows: [header, ...others.map(row)] })
  }
  // Nomes de abas repetidos juntam-se numa só.
  const merged = new Map<string, SheetTab>()
  for (const t of tabs) {
    const key = t.name.trim().slice(0, 100) || 'Aba'
    const prev = merged.get(key)
    if (prev) prev.rows.push(...t.rows.slice(1))
    else merged.set(key, { name: key, rows: t.rows })
  }
  return [...merged.values()]
}
