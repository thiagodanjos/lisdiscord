import type { EmbedDraft, EmbedField } from './types'

/**
 * Uma mensagem completa como o /embed e a página Mensagens a montam: texto normal, um embed e,
 * opcionalmente, a identidade da webhook (nome + ícone) com que é enviada.
 */
export interface MessageDraft {
  content: string
  embed: EmbedDraft
  webhookName: string
  webhookAvatarUrl: string
}

export function emptyEmbedDraft(partial: Partial<EmbedDraft> = {}): EmbedDraft {
  return {
    title: '',
    description: '',
    color: '#5865F2',
    imageUrl: '',
    thumbnailUrl: '',
    footer: '',
    authorName: '',
    authorIconUrl: '',
    footerIconUrl: '',
    url: '',
    fields: [],
    timestamp: false,
    ...partial,
  }
}

/**
 * Exporta no formato da própria API da Discord (o mesmo que ferramentas como o Discohook usam),
 * para a configuração poder ir e vir entre o /embed, a app e outras ferramentas sem conversões.
 */
export function messageDraftToJson(draft: MessageDraft): string {
  const e = draft.embed
  const embed: Record<string, unknown> = {}
  if (e.title) embed.title = e.title
  if (e.url) embed.url = e.url
  if (e.description) embed.description = e.description
  const color = hexToInt(e.color)
  if (color !== null) embed.color = color
  if (e.authorName || e.authorIconUrl) embed.author = omitEmpty({ name: e.authorName, icon_url: e.authorIconUrl })
  if (e.thumbnailUrl) embed.thumbnail = { url: e.thumbnailUrl }
  if (e.imageUrl) embed.image = { url: e.imageUrl }
  if (e.footer || e.footerIconUrl) embed.footer = omitEmpty({ text: e.footer, icon_url: e.footerIconUrl })
  if (e.fields.length > 0) embed.fields = e.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline }))
  if (e.timestamp) embed.timestamp = true

  return JSON.stringify(
    omitEmpty({
      content: draft.content,
      username: draft.webhookName,
      avatar_url: draft.webhookAvatarUrl,
      embeds: Object.keys(embed).length > 0 ? [embed] : undefined,
    }),
    null,
    2,
  )
}

/**
 * Aceita o JSON exportado por aqui, uma mensagem da API da Discord (`{ content, embeds: [...] }`),
 * um embed solto, ou o formato de partilha do Discohook (`{ messages: [{ data: {...} }] }`).
 * Lança um erro com uma mensagem legível se não for nada disso.
 */
export function messageDraftFromJson(raw: string, fallback: MessageDraft): MessageDraft {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Isso não é um JSON válido — confirma que copiaste a configuração inteira.')
  }
  if (!isObject(parsed)) throw new Error('O JSON tem de ser um objeto { ... }.')

  let message: Record<string, unknown> = parsed
  if (Array.isArray(parsed.messages) && isObject(parsed.messages[0]) && isObject(parsed.messages[0].data)) {
    message = parsed.messages[0].data
  }

  const embedSource = Array.isArray(message.embeds) ? message.embeds[0] : looksLikeEmbed(message) ? message : undefined
  const embed = isObject(embedSource) ? embedFromJson(embedSource) : emptyEmbedDraft()
  const content = str(message.content)

  if (!content && !isObject(embedSource)) {
    throw new Error('Não encontrei nenhum conteúdo nem embed nesse JSON.')
  }

  return {
    content,
    embed,
    webhookName: str(message.username) || fallback.webhookName,
    webhookAvatarUrl: str(message.avatar_url) || fallback.webhookAvatarUrl,
  }
}

function embedFromJson(o: Record<string, unknown>): EmbedDraft {
  const author = isObject(o.author) ? o.author : {}
  const footer = isObject(o.footer) ? o.footer : {}
  const fields: EmbedField[] = Array.isArray(o.fields)
    ? o.fields.filter(isObject).map((f) => ({ name: str(f.name), value: str(f.value), inline: Boolean(f.inline) }))
    : []
  return emptyEmbedDraft({
    title: str(o.title),
    url: str(o.url),
    description: str(o.description),
    color: typeof o.color === 'number' ? intToHex(o.color) : typeof o.color === 'string' && o.color ? o.color : '#5865F2',
    authorName: str(author.name),
    authorIconUrl: str(author.icon_url),
    thumbnailUrl: isObject(o.thumbnail) ? str(o.thumbnail.url) : '',
    imageUrl: isObject(o.image) ? str(o.image.url) : '',
    footer: str(footer.text),
    footerIconUrl: str(footer.icon_url),
    fields: fields.slice(0, 25),
    timestamp: Boolean(o.timestamp),
  })
}

function looksLikeEmbed(o: Record<string, unknown>): boolean {
  return ['title', 'description', 'fields', 'author', 'footer', 'image', 'thumbnail', 'color'].some((k) => k in o)
}

export function hexToInt(hex: string): number | null {
  const clean = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null
  return Number.parseInt(clean, 16)
}

export function intToHex(n: number): string {
  return `#${Math.max(0, Math.min(0xffffff, Math.floor(n))).toString(16).padStart(6, '0').toUpperCase()}`
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function omitEmpty<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>
}
