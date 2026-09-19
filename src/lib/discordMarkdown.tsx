import type { ReactNode } from 'react'

/**
 * Um mini-parser da formatação Markdown que a Discord entende em descrições e valores de campos de
 * embed — negrito, itálico, sublinhado, rasurado, links e emojis do bot (`<:nome:id>` /
 * `<a:nome:id>`) — para a pré-visualização mostrar já formatado, em vez do texto cru com
 * asteriscos. Não é um parser Markdown genérico (não trata listas, títulos, blocos de código…),
 * só o suficiente para o que a Discord realmente renderiza dentro de um embed.
 *
 * `parse` chama-se a si própria para o conteúdo capturado dentro de cada formatação (para suportar
 * aninhamento, ex.: `**negrito *e itálico***`) — por isso cada chamada tem de criar a SUA PRÓPRIA
 * instância de regex. Partilhar uma só `RegExp` global entre chamadas recursivas corrompe o
 * `lastIndex` de cada uma (a chamada interna mexe no mesmo objeto que o ciclo externo ainda está a
 * usar), o que pode nunca avançar e crescer o array de nós para sempre.
 */
function tokenPattern(): RegExp {
  return /(\*\*\*(.+?)\*\*\*)|(\*\*(.+?)\*\*)|(__(.+?)__)|(~~(.+?)~~)|(\*(.+?)\*)|(\[(.+?)\]\((https?:\/\/[^\s)]+)\))|(<a?:(\w+):(\d+)>)/g
}

export function renderDiscordMarkdown(text: string): ReactNode {
  return parse(text, 0)
}

function parse(text: string, keyBase: number): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = keyBase
  const token = tokenPattern()

  while ((match = token.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))

    if (match[1] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-bold italic">
          {parse(match[2], key * 1000)}
        </strong>,
      )
    } else if (match[3] !== undefined) {
      nodes.push(<strong key={key++}>{parse(match[4], key * 1000)}</strong>)
    } else if (match[5] !== undefined) {
      nodes.push(<span key={key++} className="underline">{parse(match[6], key * 1000)}</span>)
    } else if (match[7] !== undefined) {
      nodes.push(<s key={key++}>{parse(match[8], key * 1000)}</s>)
    } else if (match[9] !== undefined) {
      nodes.push(<em key={key++}>{parse(match[10], key * 1000)}</em>)
    } else if (match[11] !== undefined) {
      nodes.push(
        <a key={key++} href={match[13]} target="_blank" rel="noreferrer" className="text-accent underline">
          {match[12]}
        </a>,
      )
    } else if (match[14] !== undefined) {
      const isAnimated = match[14].startsWith('<a:')
      const tag = match[14]
      nodes.push(
        <img
          key={key++}
          src={`https://cdn.discordapp.com/emojis/${match[16]}.${isAnimated ? 'gif' : 'png'}`}
          alt={`:${match[15]}:`}
          title={`:${match[15]}:`}
          className="inline-block size-[1.375em] -translate-y-[2px] align-middle object-contain"
          onError={(e) => {
            e.currentTarget.outerHTML = tag
          }}
        />,
      )
    }

    lastIndex = token.lastIndex
    // `.+?` (não-guloso) com grupo vazio (ex.: `****`) nunca avança lastIndex — sem isto, o
    // ciclo ficaria preso a repetir o mesmo ponto para sempre.
    if (match[0].length === 0) token.lastIndex++
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}
