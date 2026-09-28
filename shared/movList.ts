import type { MovListMember, MovListSettings } from './types'

// Listagem de Mov Call — valores de fábrica e o formato das linhas, partilhados entre o bot (que
// publica a mensagem) e a app (pré-visualização), para o editor mostrar exatamente o que sai.

export const DEFAULT_MOV_LIST_LINE = '{numero}. {mencao} - {id}'
export const DEFAULT_MOV_LIST_COPY_LINE = '{numero}. {nome} - {id}'

/** A Discord limita o texto de uma mensagem V2 a 4000 caracteres — a lista de cada página fica abaixo disto. */
const PAGE_CHAR_BUDGET = 3000

export function defaultMovListSettings(): MovListSettings {
  return {
    channelId: null,
    channelName: null,
    messageId: null,
    lineFormat: DEFAULT_MOV_LIST_LINE,
    blankLineBetween: true,
    emptyText: '_Ninguém na listagem ainda — clica em **Add Membro**._',
    perPage: 30,
    addLabel: 'Add Membro',
    addEmoji: '➕',
    addStyle: 'success',
    removeLabel: 'Remover membro',
    removeEmoji: '➖',
    removeStyle: 'danger',
    copyLabel: 'Copiar listagem',
    copyEmoji: '📋',
    copyStyle: 'secondary',
    prevLabel: 'Anterior',
    prevEmoji: '◀️',
    nextLabel: 'Seguinte',
    nextEmoji: '▶️',
    pageStyle: 'secondary',
    byIdLabel: 'Por ID',
    byIdEmoji: '🆔',
    byIdStyle: 'secondary',
    managerRoleIds: [],
    copyForEveryone: false,
    copyFormat: DEFAULT_MOV_LIST_COPY_LINE,
    copyHeader: 'Listagem de Mov Call — {total} membros ({data})',
    copyAsCodeBlock: true,
    addPrompt: '**Add Membro** — escolhe abaixo quem entra na listagem (até 25 de cada vez), ou usa **Por ID**.',
    removePrompt: '**Remover membro** — escolhe abaixo quem sai da listagem, ou usa **Por ID**.',
    selectPlaceholder: 'Escolhe os membros…',
    replyAdded: '✅ {membros} adicionado(s) à listagem. Total: **{total}**.',
    replyRemoved: '🗑️ {membros} removido(s) da listagem. Total: **{total}**.',
    replyAlready: 'ℹ️ Já estavam na listagem: {membros}',
    replyNothing: 'ℹ️ Nada mudou — ninguém para adicionar ou remover.',
    replyNoPermission: '❌ Só a gestão pode mexer na listagem.',
    logChannelId: null,
    logChannelName: null,
    logAdded: '📥 {autor} adicionou {membros} à listagem de Mov Call. Total: {total}.',
    logRemoved: '📤 {autor} removeu {membros} da listagem de Mov Call. Total: {total}.',
  }
}

export function fillTokens(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), template)
}

/** Linha de um membro — `mention` escreve `<@id>` (bot) ou `@nome` (pré-visualização na app). */
export function formatMovListLine(template: string, member: MovListMember, index: number, mention: 'discord' | 'preview'): string {
  return fillTokens(template || DEFAULT_MOV_LIST_LINE, {
    numero: String(index + 1),
    mencao: mention === 'discord' ? `<@${member.userId}>` : `@${member.displayName || member.username}`,
    id: member.userId,
    nome: member.displayName || member.username,
    usuario: member.username,
  })
}

/**
 * Divide a lista em páginas: no máximo `perPage` membros e ~3000 caracteres por página (a
 * numeração continua de uma página para a outra). Devolve o texto de cada página.
 */
export function paginateMovList(settings: MovListSettings, members: MovListMember[], mention: 'discord' | 'preview'): string[] {
  if (members.length === 0) return [settings.emptyText || '_Ninguém na listagem ainda._']
  const joiner = settings.blankLineBetween ? '\n\n' : '\n'
  const perPage = Math.max(1, settings.perPage || 30)
  const pages: string[] = []
  let current: string[] = []
  let size = 0
  members.forEach((m, i) => {
    const line = formatMovListLine(settings.lineFormat, m, i, mention)
    if (current.length > 0 && (current.length >= perPage || size + joiner.length + line.length > PAGE_CHAR_BUDGET)) {
      pages.push(current.join(joiner))
      current = []
      size = 0
    }
    current.push(line.slice(0, PAGE_CHAR_BUDGET))
    size += (current.length > 1 ? joiner.length : 0) + line.length
  })
  if (current.length > 0) pages.push(current.join(joiner))
  return pages
}

/** Texto do "Copiar listagem" (sem menções — nomes e IDs). */
export function buildMovListCopy(settings: MovListSettings, members: MovListMember[], serverName: string, date: string): string {
  const header = fillTokens(settings.copyHeader ?? '', { total: String(members.length), data: date, servidor: serverName }).trim()
  const lines = members.map((m, i) => fillTokens(settings.copyFormat || DEFAULT_MOV_LIST_COPY_LINE, {
    numero: String(i + 1),
    mencao: `@${m.displayName || m.username}`,
    id: m.userId,
    nome: m.displayName || m.username,
    usuario: m.username,
  }))
  return [header, lines.join('\n')].filter(Boolean).join('\n\n')
}
