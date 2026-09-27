import {
  type ActionRowBuilder,
  type ButtonBuilder,
  ContainerBuilder,
  type EmbedBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js'

// Mensagens no formato "Components V2" da Discord: em vez de um embed com os botões por baixo, uma
// caixa (container) com a barra de cor, o texto, uma linha divisória e os botões LÁ DENTRO. O conteúdo
// continua a vir do mesmo EmbedDraft personalizável na app — só muda a forma como é desenhado.

const INVISIBLE = '​'
/** A Discord limita o texto de uma mensagem V2 a 4000 caracteres no total. */
const TEXT_BUDGET = 3800

function clean(text: string | undefined): string {
  const t = (text ?? '').trim()
  return t === INVISIBLE ? '' : t
}

/**
 * Converte um embed (já com os tokens trocados) numa caixa V2: autor e título em cima, descrição,
 * campos, imagem, rodapé em letra pequena e, no fim, uma linha divisória com os botões.
 */
export function embedToContainer(embed: EmbedBuilder, rows: ActionRowBuilder<ButtonBuilder>[] = []): ContainerBuilder {
  const d = embed.data
  const container = new ContainerBuilder()
  if (typeof d.color === 'number') container.setAccentColor(d.color)

  let budget = TEXT_BUDGET
  const take = (text: string) => {
    const out = text.slice(0, Math.max(0, budget))
    budget -= out.length
    return out
  }

  const head: string[] = []
  const author = clean(d.author?.name)
  if (author) head.push(`-# ${author}`)
  const title = clean(d.title)
  if (title) head.push(`### ${d.url ? `[${title}](${d.url})` : title}`)
  const description = clean(d.description)
  if (description) head.push(description)
  const headText = take(head.join('\n')) || INVISIBLE

  if (d.thumbnail?.url) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(d.thumbnail.url)),
    )
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headText))
  }

  const fields = (d.fields ?? []).filter((f) => clean(f.name) && clean(f.value))
  if (fields.length > 0) {
    const text = fields.map((f) => (f.value.includes('\n') ? `**${f.name}**\n${f.value}` : `**${f.name}:** ${f.value}`)).join('\n')
    const content = take(text)
    if (content) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
  }

  if (d.image?.url) {
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(d.image.url)))
  }

  const footerParts = [clean(d.footer?.text), d.timestamp ? `<t:${Math.floor(Date.parse(d.timestamp) / 1000)}:f>` : ''].filter(Boolean)
  if (footerParts.length > 0) {
    const content = take(`-# ${footerParts.join(' · ')}`)
    if (content.length > 3) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
  }

  if (rows.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    container.addActionRowComponents(...rows)
  }
  return container
}

/** Texto solto por cima da caixa (ex.: a menção ao membro, para ele ser notificado). */
export function textLine(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content)
}
