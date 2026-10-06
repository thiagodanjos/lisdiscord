import type { Duty, DutyAssignee, DutiesSettings, DutyPanelButton, DutySubItem } from './types'

// Funções da gestão: quem cuida de quê. O mesmo código monta o texto no bot (com menções) e na app
// (pré-visualização com nomes), por isso fica aqui partilhado.

let seq = 0
export function dutyId(prefix = 'd'): string {
  seq = (seq + 1) % 1000
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`
}

const duty = (id: string, title: string, note = '', subs: string[] = []): Duty => ({
  id,
  title,
  note,
  description: '',
  assignees: [],
  subItems: subs.map((label, i) => ({ id: `${id}s${i}`, label, assignees: [] })),
})

export const DEFAULT_DUTIES: Duty[] = [
  duty('verificacao', 'Marcar novatos na verificação', 'durante o dia'),
  duty('puxarmovs', 'Puxar Movs'),
  duty('pontosgerais', 'Setar pontos gerais e sugestões'),
  duty('pontosmovs', 'Setar pontos das movs', '', ['Segunda feira', 'Terça feira', 'Quarta feira', 'Quinta feira', 'Sexta feira']),
  duty('puxarhoras', 'Puxar horas'),
  duty('planilha', 'Planilha'),
  duty('upados', 'Atualizar o cargo dos membros upados'),
  duty('pautas', 'Pautas para reuniões'),
  duty('relatorio', 'Relatório da Gestão'),
  duty('inativos', 'Lista de membros inativos'),
  duty('upamento', 'Lista de upamento'),
  duty('cobrar', 'Cobrar e ver se os gestores cumpriram as funções'),
]

export const DEFAULT_DUTY_BUTTONS: DutyPanelButton[] = [
  { id: 'summary', kind: 'summary', show: true, label: 'Quem cuida de quê', emoji: '📋', style: 'primary', url: '', text: '' },
  { id: 'mine', kind: 'mine', show: true, label: 'As minhas funções', emoji: '🧾', style: 'secondary', url: '', text: '' },
]

export function defaultDutiesSettings(): DutiesSettings {
  return {
    channelId: null,
    channelName: null,
    messageId: null,
    useEmbed: true,
    plainTemplate: '**Funções da Gestão** 🐼\n\n{funcoes}',
    lineFormat: '{seta} {funcao}{nota} • {responsaveis}',
    groupLineFormat: '{seta} {funcao}{nota}:',
    subLineFormat: '- {seta}{item} • {responsaveis}',
    arrow: '↳',
    separator: ' | ',
    emptyAssignee: '*ninguém ainda*',
    spacing: true,
    pingOnPublish: false,
    duties: structuredClone(DEFAULT_DUTIES),
    buttons: structuredClone(DEFAULT_DUTY_BUTTONS),
    showSelect: true,
    selectPlaceholder: 'Ver uma função em detalhe…',
    summaryLineFormat: '{membro} — {funcoes}',
    mineLineFormat: '{seta} {funcao}{item}',
    replyNoDuties: 'ℹ️ Não estás a cuidar de nenhuma função de momento.',
    ephemeral: true,
  }
}

export function fillDuty(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), template)
}

export type DutyMention = 'discord' | 'plain'

export function assigneeText(a: DutyAssignee, mention: DutyMention): string {
  if (mention === 'plain') return `@${a.name}`
  return a.kind === 'role' ? `<@&${a.id}>` : `<@${a.id}>`
}

export function assigneesText(list: DutyAssignee[], s: DutiesSettings, mention: DutyMention): string {
  return list.length ? list.map((a) => assigneeText(a, mention)).join(s.separator) : s.emptyAssignee
}

const noteOf = (d: Duty) => (d.note.trim() ? ` ${d.note.trim()}` : '')

/** A seta de uma função: a dela, ou a geral. */
export const arrowOf = (d: Duty, s: DutiesSettings) => (d.arrow ?? '').trim() || s.arrow

/** Linha de uma divisão — a seta própria entra em {seta} (formatos antigos sem {seta} recebem-na antes do item). */
export function subLine(s: DutiesSettings, sub: DutySubItem, responsaveis: string): string {
  const arrow = (sub.arrow ?? '').trim()
  const format = arrow && !s.subLineFormat.includes('{seta}') ? s.subLineFormat.replace('{item}', '{seta}{item}') : s.subLineFormat
  return fillDuty(format, { seta: arrow ? `${arrow} ` : '', item: sub.label, responsaveis })
}

/** As linhas de uma função (com as divisões por baixo, se tiver). */
export function dutyLines(d: Duty, index: number, s: DutiesSettings, mention: DutyMention): string[] {
  const base = { seta: arrowOf(d, s), funcao: d.title, nota: noteOf(d), numero: String(index + 1) }
  if (d.subItems.length === 0) return [fillDuty(s.lineFormat, { ...base, responsaveis: assigneesText(d.assignees, s, mention) })]
  const head = d.assignees.length ? fillDuty(s.lineFormat, { ...base, responsaveis: assigneesText(d.assignees, s, mention) }) : fillDuty(s.groupLineFormat, base)
  return [head, ...d.subItems.map((sub) => subLine(s, sub, assigneesText(sub.assignees, s, mention)))]
}

/** O texto {funcoes} do painel. */
export function dutiesText(s: DutiesSettings, mention: DutyMention): string {
  return s.duties.map((d, i) => dutyLines(d, i, s, mention).join('\n')).join(s.spacing ? '\n\n' : '\n')
}

interface Assignment {
  assignee: DutyAssignee
  labels: string[]
}

/** Agrupa por pessoa/cargo: quem cuida de quê. */
export function assignmentsByPerson(s: DutiesSettings): Assignment[] {
  const map = new Map<string, Assignment>()
  const add = (a: DutyAssignee, label: string) => {
    const key = `${a.kind}:${a.id}`
    const entry = map.get(key) ?? { assignee: a, labels: [] }
    if (!entry.labels.includes(label)) entry.labels.push(label)
    map.set(key, entry)
  }
  for (const d of s.duties) {
    for (const a of d.assignees) add(a, d.title)
    for (const sub of d.subItems) for (const a of sub.assignees) add(a, `${d.title} (${sub.label})`)
  }
  return [...map.values()].sort((a, b) => b.labels.length - a.labels.length || a.assignee.name.localeCompare(b.assignee.name))
}

/** Funções (ou divisões) sem ninguém. */
export function unassigned(s: DutiesSettings): string[] {
  const out: string[] = []
  for (const d of s.duties) {
    if (d.subItems.length === 0) {
      if (d.assignees.length === 0) out.push(d.title)
    } else if (d.assignees.length === 0) {
      for (const sub of d.subItems) if (sub.assignees.length === 0) out.push(`${d.title} (${sub.label})`)
    }
  }
  return out
}

export function summaryValues(s: DutiesSettings, mention: DutyMention, serverName: string): Record<string, string> {
  const people = assignmentsByPerson(s)
  const lines = people.map((p) => fillDuty(s.summaryLineFormat, { membro: assigneeText(p.assignee, mention), funcoes: p.labels.join(', '), total: String(p.labels.length) }))
  const missing = unassigned(s)
  return {
    resumo: lines.join('\n') || s.emptyAssignee,
    semResponsavel: missing.length ? missing.join(', ') : '—',
    total: String(s.duties.length),
    pessoas: String(people.length),
    servidor: serverName,
  }
}

/** As funções de uma pessoa (diretamente ou por um dos cargos que tem). */
export function minesFor(s: DutiesSettings, userId: string, roleIds: string[]): string[] {
  const mine = (list: DutyAssignee[]) => list.some((a) => (a.kind === 'user' ? a.id === userId : roleIds.includes(a.id)))
  const out: string[] = []
  for (const d of s.duties) {
    if (mine(d.assignees)) out.push(fillDuty(s.mineLineFormat, { seta: arrowOf(d, s), funcao: d.title, item: '' }))
    for (const sub of d.subItems) if (mine(sub.assignees)) out.push(fillDuty(s.mineLineFormat, { seta: (sub.arrow ?? '').trim() || arrowOf(d, s), funcao: d.title, item: ` (${sub.label})` }))
  }
  return out
}

export function detailValues(d: Duty, s: DutiesSettings, mention: DutyMention, serverName: string): Record<string, string> {
  return {
    funcao: d.title,
    nota: d.note.trim(),
    descricao: d.description.trim() || d.note.trim() || '—',
    responsaveis: assigneesText(d.assignees, s, mention),
    divisoes: d.subItems.map((sub) => subLine(s, sub, assigneesText(sub.assignees, s, mention))).join('\n'),
    servidor: serverName,
  }
}
