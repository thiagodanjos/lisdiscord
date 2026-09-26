import type { ListFormat, MovPointsEntry } from './types'

// Partilhado entre o bot (que monta o placar real) e a app (que mostra a pré-visualização ao
// editar o formato) — assim o que se vê no editor é exatamente o que o bot publica.

export const LIST_LINE_PLACEHOLDERS = ['{posicao}', '{membro}', '{nome}', '{pontos}', '{horas}'] as const

export const DEFAULT_BOARD_LIST_FORMAT: ListFormat = {
  first: '🥇 {membro} — {pontos} pontos · {horas}',
  second: '🥈 {membro} — {pontos} pontos · {horas}',
  third: '🥉 {membro} — {pontos} pontos · {horas}',
  line: '{posicao}. {membro} — {pontos} pontos · {horas}',
}

export const DEFAULT_INACTIVE_LIST_FORMAT: ListFormat = {
  first: '⚠️ {membro} — {pontos} pontos · {horas}',
  second: '⚠️ {membro} — {pontos} pontos · {horas}',
  third: '⚠️ {membro} — {pontos} pontos · {horas}',
  line: '⚠️ {membro} — {pontos} pontos · {horas}',
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

/** `discord` gera menções reais (`<@id>`); `preview` escreve `@nome`, porque a app não resolve menções. */
export type MentionStyle = 'discord' | 'preview'

export function formatListLine(format: ListFormat, index: number, entry: MovPointsEntry, mentionStyle: MentionStyle): string {
  const specific = index === 0 ? format.first : index === 1 ? format.second : index === 2 ? format.third : format.line
  const template = specific.trim() ? specific : format.line
  const values: Record<string, string> = {
    posicao: String(index + 1),
    membro: mentionStyle === 'discord' ? `<@${entry.userId}>` : `@${entry.tag}`,
    nome: entry.tag,
    pontos: String(entry.points),
    horas: entry.totalSeconds > 0 ? formatDuration(entry.totalSeconds) : '0h',
  }
  return template.replace(/\{(posicao|membro|nome|pontos|horas)\}/g, (_, key: string) => values[key])
}

/**
 * Monta a lista inteira, parando antes de passar `maxChars` — a descrição de um embed tem um
 * limite de 4096 caracteres, e com linhas personalizadas (emojis, texto extra) o número de
 * linhas que cabe varia, por isso o corte é por tamanho e não só por número de linhas.
 */
export function buildLeaderboardList(
  entries: MovPointsEntry[],
  format: ListFormat,
  options: { mentionStyle: MentionStyle; maxLines: number; maxChars: number; emptyText: string; moreText: (hidden: number) => string },
): string {
  if (entries.length === 0) return options.emptyText
  const lines: string[] = []
  let length = 0
  for (let i = 0; i < entries.length && i < options.maxLines; i++) {
    const line = formatListLine(format, i, entries[i], options.mentionStyle)
    if (length + line.length + 1 > options.maxChars) break
    lines.push(line)
    length += line.length + 1
  }
  const hidden = entries.length - lines.length
  if (hidden > 0) lines.push(options.moreText(hidden))
  return lines.join('\n')
}
