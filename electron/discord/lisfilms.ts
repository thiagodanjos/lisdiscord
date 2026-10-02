import {
  ActionRowBuilder,
  type AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Guild,
  type Interaction,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js'
import type { LisFilmsHit, LisFilmsMedia, LisFilmsSettings, LisFilmsState, LisFilmsStatus, LisFilmsSummary } from '../../shared/types'
import { MEDIA_EMOJI, MEDIA_LABEL, defaultLisFilmsSettings, posterUrl, siteLink, stars } from '../../shared/lisfilms'
import * as store from '../store/lisfilms'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { embedToContainer } from './componentsV2'
import { parseButtonEmoji } from './verification'

// Integração com o LisFilms (lisfilms.pt): o bot lê a API pública do site — pesquisa, fichas de
// filmes/séries/animes/jogos, o que está em alta, o resumo da comunidade, o destaque da Home e
// utilizadores — e mostra tudo em caixas personalizáveis, com um botão para abrir no site.

const TIMEOUT_MS = 25_000
/** O autocompletar da Discord só espera 3 s. */
const AUTOCOMPLETE_TIMEOUT_MS = 2_500
const PICK_ID = 'lf:pick'

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

class LisFilmsOffline extends Error {}

// ==========================================================================
// Cliente da API
// ==========================================================================

async function api<T>(path: string, timeout = TIMEOUT_MS): Promise<T> {
  const settings = store.getLisFilmsSettings()
  const base = settings.apiUrl.replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'LisDiscord' } })
    if (res.status === 404) throw new Error('não encontrado')
    if (!res.ok) throw new LisFilmsOffline(`HTTP ${res.status}`)
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof Error && err.message === 'não encontrado') throw err
    throw new LisFilmsOffline(errText(err))
  } finally {
    clearTimeout(timer)
  }
}

interface SearchOut {
  movies: { id: number; title: string; year: number | null; genre: string | null; poster_path: string | null }[]
  series: SearchOut['movies']
  animes: SearchOut['movies']
  games: { rawg_id: number; nome: string; ano: number | null; capa: string | null }[]
  users: { id: number; username: string }[]
}

interface MediaOut {
  id: number
  title: string
  year: number | null
  genre: string | null
  poster_path: string | null
  overview: string | null
  tmdb_id: number | null
  tmdb_rating: number | null
  avg_rating: number | null
  n_reviews: number
}

interface GameOut {
  rawg_id: number
  nome: string
  ano: number | null
  lancamento: string | null
  capa: string | null
  sinopse: string | null
  metacritic: number | null
  generos: string[]
  plataformas: string[]
  estudio: string | null
  editora: string | null
  duracao_media: number | null
  media_lisgames: number | null
  total_avaliacoes: number
}

/** Pesquisa global do site, já arrumada em resultados com link. */
export async function searchLisFilms(query: string, timeout = TIMEOUT_MS): Promise<LisFilmsHit[]> {
  const q = query.trim()
  if (!q) return []
  const { siteUrl } = store.getLisFilmsSettings()
  const data = await api<SearchOut>(`/search?q=${encodeURIComponent(q)}`, timeout)
  const titles = (media: LisFilmsMedia) =>
    (data[media] ?? []).map((m) => ({
      media,
      id: m.id,
      title: m.title,
      year: m.year,
      subtitle: m.genre,
      image: posterUrl(m.poster_path, 'w185'),
      url: siteLink(siteUrl, media, m.id),
    }))
  return [
    ...titles('movies'),
    ...titles('series'),
    ...titles('animes'),
    ...(data.games ?? []).map((g) => ({
      media: 'games' as const,
      id: g.rawg_id,
      title: g.nome,
      year: g.ano,
      subtitle: null,
      image: g.capa,
      url: siteLink(siteUrl, 'games', g.rawg_id),
    })),
    ...(data.users ?? []).map((u) => ({
      media: 'users' as const,
      id: u.id,
      title: u.username,
      year: null,
      subtitle: null,
      image: null,
      url: siteLink(siteUrl, 'users', u.id),
    })),
  ]
}

/** Jogos vêm da pesquisa da RAWG (a pesquisa geral só tem os que já estão guardados no site). */
async function searchGames(query: string, timeout = TIMEOUT_MS): Promise<LisFilmsHit[]> {
  const { siteUrl } = store.getLisFilmsSettings()
  const data = await api<{ resultados: GameOut[] }>(`/games/procurar?q=${encodeURIComponent(query.trim())}&limite=20`, timeout)
  return (data.resultados ?? []).map((g) => ({
    media: 'games' as const,
    id: g.rawg_id,
    title: g.nome,
    year: g.ano,
    subtitle: null,
    image: g.capa,
    url: siteLink(siteUrl, 'games', g.rawg_id),
  }))
}

// ==========================================================================
// Respostas (caixas V2 personalizáveis)
// ==========================================================================

function linkRow(settings: LisFilmsSettings, url: string): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  if (!settings.linkButton.show) return []
  const button = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setURL(url)
    .setLabel((settings.linkButton.label || 'Ver no LisFilms').slice(0, 80))
  const emoji = parseButtonEmoji(settings.linkButton.emoji)
  if (emoji) button.setEmoji(emoji)
  return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button)]
}

function payload(
  guild: Guild | null,
  kind: 'lisfilmsTitle' | 'lisfilmsGame' | 'lisfilmsList' | 'lisfilmsSummary',
  values: Record<string, string>,
  rows: ActionRowBuilder<MessageActionRowComponentBuilder>[],
) {
  let embed = buildEmbedFromDraft(getTemplate(guild?.id ?? 'global', kind), { ...values, servidor: guild?.name ?? '' }, { separators: 'keep' })
  if (!embedHasContent(embed)) embed = embed.setDescription(values.titulo ?? values.nome ?? 'LisFilms')
  return { flags: MessageFlags.IsComponentsV2 as const, components: [embedToContainer(embed, rows)], allowedMentions: { parse: [] as [] } }
}

function clip(text: string | null | undefined, max = 600): string {
  const t = (text ?? '').trim()
  if (!t) return '—'
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

async function titleCard(guild: Guild | null, media: LisFilmsMedia, id: number) {
  const settings = store.getLisFilmsSettings()
  const m = await api<MediaOut>(`/media/${media}/${id}`)
  const url = siteLink(settings.siteUrl, media, m.id)
  return payload(
    guild,
    'lisfilmsTitle',
    {
      titulo: m.title,
      tipo: `${MEDIA_EMOJI[media]} ${MEDIA_LABEL[media]}`,
      ano: m.year ? String(m.year) : '—',
      genero: m.genre ?? '—',
      sinopse: clip(m.overview),
      notaLisFilms: m.avg_rating != null ? `${m.avg_rating}/5` : 'sem notas',
      estrelas: stars(m.avg_rating),
      avaliacoes: String(m.n_reviews ?? 0),
      notaTmdb: m.tmdb_rating != null ? `${Number(m.tmdb_rating).toFixed(1)}/10` : '—',
      poster: posterUrl(m.poster_path) ?? '',
      link: url,
    },
    linkRow(settings, url),
  )
}

async function gameCard(guild: Guild | null, rawgId: number) {
  const settings = store.getLisFilmsSettings()
  const g = await api<GameOut>(`/games/${rawgId}`)
  const url = siteLink(settings.siteUrl, 'games', g.rawg_id)
  return payload(
    guild,
    'lisfilmsGame',
    {
      nome: g.nome,
      ano: g.ano ? String(g.ano) : '—',
      lancamento: g.lancamento ?? '—',
      generos: g.generos?.join(', ') || '—',
      plataformas: g.plataformas?.slice(0, 5).join(', ') || '—',
      estudio: g.estudio ?? '—',
      editora: g.editora ?? '—',
      metacritic: g.metacritic != null ? String(g.metacritic) : '—',
      duracao: g.duracao_media ? `${g.duracao_media}h` : '—',
      notaLisGames: g.media_lisgames != null ? `${g.media_lisgames}/5` : 'sem notas',
      estrelas: stars(g.media_lisgames),
      avaliacoes: String(g.total_avaliacoes ?? 0),
      sinopse: clip(g.sinopse, 500),
      capa: g.capa ?? '',
      link: url,
    },
    linkRow(settings, url),
  )
}

function hitLine(h: LisFilmsHit, i: number): string {
  const extra = [h.year, h.subtitle].filter(Boolean).join(' · ')
  return `**${i + 1}.** ${MEDIA_EMOJI[h.media]} [${h.title}](${h.url})${extra ? ` — ${extra}` : ''}`
}

/** Lista de resultados com o menu para abrir um deles. */
function listPayload(guild: Guild | null, title: string, query: string, hits: LisFilmsHit[]) {
  const settings = store.getLisFilmsSettings()
  const shown = hits.slice(0, Math.max(1, Math.min(25, settings.resultsLimit)))
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []
  const pickable = shown.filter((h) => h.media !== 'users')
  if (settings.pickMenu && pickable.length > 0) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(PICK_ID)
          .setPlaceholder((settings.pickPlaceholder || 'Abrir um resultado…').slice(0, 150))
          .addOptions(
            pickable.map((h) => ({
              label: `${h.title}${h.year ? ` (${h.year})` : ''}`.slice(0, 100),
              description: MEDIA_LABEL[h.media],
              value: `${h.media}:${h.id}`,
              emoji: MEDIA_EMOJI[h.media],
            })),
          ),
      ),
    )
  }
  rows.push(...linkRow(settings, `${settings.siteUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}`))
  return payload(
    guild,
    'lisfilmsList',
    { titulo: title, lista: shown.map(hitLine).join('\n') || settings.notFoundText, total: String(hits.length), termo: query, link: settings.siteUrl },
    rows,
  )
}

// ==========================================================================
// Comando /lisfilms
// ==========================================================================

export function lisfilmsCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  const titleSub = (name: LisFilmsMedia, label: string) => (s: import('discord.js').SlashCommandSubcommandBuilder) =>
    s
      .setName(name === 'movies' ? 'filme' : name === 'series' ? 'serie' : 'anime')
      .setDescription(`Ficha de ${label} no LisFilms (notas, sinopse, poster)`)
      .addStringOption((o) => o.setName('titulo').setDescription('Nome').setRequired(true).setAutocomplete(true))
  return new SlashCommandBuilder()
    .setName('lisfilms')
    .setDescription('O LisFilms no Discord — filmes, séries, animes e jogos')
    .addSubcommand((s) =>
      s
        .setName('procurar')
        .setDescription('Procura filmes, séries, animes, jogos e pessoas no LisFilms')
        .addStringOption((o) => o.setName('termo').setDescription('O que procurar').setRequired(true).setMaxLength(100))
        .addStringOption((o) =>
          o
            .setName('tipo')
            .setDescription('Só um tipo')
            .addChoices(
              { name: 'Filmes', value: 'movies' },
              { name: 'Séries', value: 'series' },
              { name: 'Animes', value: 'animes' },
              { name: 'Jogos', value: 'games' },
              { name: 'Pessoas', value: 'users' },
            ),
        ),
    )
    .addSubcommand(titleSub('movies', 'um filme'))
    .addSubcommand(titleSub('series', 'uma série'))
    .addSubcommand(titleSub('animes', 'um anime'))
    .addSubcommand((s) =>
      s
        .setName('jogo')
        .setDescription('Ficha de um jogo no LisGames (notas, plataformas, Metacritic)')
        .addStringOption((o) => o.setName('nome').setDescription('Nome do jogo').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName('top').setDescription('O que está em alta no LisFilms'))
    .addSubcommand((s) => s.setName('resumo').setDescription('O LisFilms em números: títulos, reviews, pessoas e quem mais avalia'))
    .addSubcommand((s) => s.setName('destaque').setDescription('O destaque da página inicial do LisFilms'))
    .addSubcommand((s) =>
      s
        .setName('utilizador')
        .setDescription('Procura uma pessoa no LisFilms')
        .addStringOption((o) => o.setName('nome').setDescription('Nome').setRequired(true).setMaxLength(60)),
    )
    .toJSON()
}

const SUB_TOGGLE: Record<string, keyof LisFilmsSettings['commands']> = {
  procurar: 'procurar',
  filme: 'titulo',
  serie: 'titulo',
  anime: 'titulo',
  jogo: 'jogo',
  top: 'top',
  resumo: 'resumo',
  destaque: 'destaque',
  utilizador: 'utilizador',
}

const SUB_MEDIA: Record<string, LisFilmsMedia> = { filme: 'movies', serie: 'series', anime: 'animes' }

export async function handleLisFilmsCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'lisfilms') return false
  const settings = store.getLisFilmsSettings()
  const sub = interaction.options.getSubcommand()
  if (!settings.enabled || !settings.commands[SUB_TOGGLE[sub]]) {
    await interaction.reply({ content: '🔒 Este comando do LisFilms está desligado.', flags: MessageFlags.Ephemeral })
    return true
  }
  // O Render gratuito pode demorar a acordar — responder logo e editar depois.
  await interaction.deferReply(settings.ephemeral ? { flags: MessageFlags.Ephemeral } : {})
  const guild = interaction.guild
  try {
    if (sub === 'procurar') {
      const q = interaction.options.getString('termo', true)
      const tipo = interaction.options.getString('tipo')
      let hits = tipo === 'games' ? await searchGames(q) : await searchLisFilms(q)
      if (tipo && tipo !== 'games') hits = hits.filter((h) => h.media === tipo)
      if (hits.length === 0) {
        await interaction.editReply({ content: settings.notFoundText })
        return true
      }
      await interaction.editReply(listPayload(guild, `🔎 “${q}” no LisFilms`, q, hits))
      return true
    }
    if (SUB_MEDIA[sub]) {
      const media = SUB_MEDIA[sub]
      const raw = interaction.options.getString('titulo', true)
      let id = /^\d+$/.test(raw) ? Number(raw) : null
      if (id === null) id = (await searchLisFilms(raw)).find((h) => h.media === media)?.id ?? null
      if (id === null) {
        await interaction.editReply({ content: settings.notFoundText })
        return true
      }
      await interaction.editReply(await titleCard(guild, media, id))
      return true
    }
    if (sub === 'jogo') {
      const raw = interaction.options.getString('nome', true)
      let id = /^\d+$/.test(raw) ? Number(raw) : null
      if (id === null) id = (await searchGames(raw))[0]?.id ?? null
      if (id === null) {
        await interaction.editReply({ content: settings.notFoundText })
        return true
      }
      await interaction.editReply(await gameCard(guild, id))
      return true
    }
    if (sub === 'top') {
      const rows =
        await api<{ media: 'filme' | 'serie'; title: string; year: number | null; genre: string | null; revs: number; lks: number }[]>('/explore/trending')
      const { siteUrl } = settings
      const lines = rows
        .slice(0, settings.resultsLimit)
        .map((r, i) => `**${i + 1}.** ${r.media === 'serie' ? '📺' : '🎬'} **${r.title}**${r.year ? ` (${r.year})` : ''} — ${r.revs} reviews · ❤️ ${r.lks}`)
      await interaction.editReply(
        payload(
          guild,
          'lisfilmsList',
          { titulo: '🔥 Em alta no LisFilms', lista: lines.join('\n') || settings.notFoundText, total: String(rows.length), termo: '', link: siteUrl },
          linkRow(settings, `${siteUrl.replace(/\/+$/, '')}/discover`),
        ),
      )
      return true
    }
    if (sub === 'resumo') {
      await interaction.editReply(await summaryPayload(guild))
      return true
    }
    if (sub === 'destaque') {
      const d = await api<{ tipo: string; tmdb_id: number; nome?: string } | null>('/destaque')
      if (!d) {
        await interaction.editReply({ content: 'ℹ️ O LisFilms não tem nenhum destaque escolhido agora.' })
        return true
      }
      const media = (['movies', 'series', 'animes'].includes(d.tipo) ? d.tipo : 'movies') as LisFilmsMedia
      const local = await api<{ id: number }>(`/media/${media}/by-tmdb/${d.tmdb_id}`).catch(() => null)
      if (!local) {
        await interaction.editReply({ content: `⭐ Destaque do LisFilms: **${d.nome ?? '?'}** — ${settings.siteUrl}` })
        return true
      }
      await interaction.editReply(await titleCard(guild, media, local.id))
      return true
    }
    if (sub === 'utilizador') {
      const q = interaction.options.getString('nome', true)
      const users = await api<{ id: number; username: string; is_admin: boolean; is_vip: boolean }[]>(`/users/search?q=${encodeURIComponent(q)}`)
      if (users.length === 0) {
        await interaction.editReply({ content: settings.notFoundText })
        return true
      }
      const hits: LisFilmsHit[] = users.map((u) => ({
        media: 'users',
        id: u.id,
        title: `${u.username}${u.is_admin ? ' 👑' : u.is_vip ? ' 💎' : ''}`,
        year: null,
        subtitle: null,
        image: null,
        url: siteLink(settings.siteUrl, 'users', u.id),
      }))
      await interaction.editReply(listPayload(guild, `👤 Pessoas no LisFilms: “${q}”`, q, hits))
      return true
    }
  } catch (err) {
    const msg =
      err instanceof LisFilmsOffline
        ? settings.offlineText
        : err instanceof Error && err.message === 'não encontrado'
          ? settings.notFoundText
          : `❌ ${errText(err)}`
    await interaction.editReply({ content: msg }).catch(() => undefined)
  }
  return true
}

async function summaryPayload(guild: Guild | null) {
  const settings = store.getLisFilmsSettings()
  const [s, trending, users] = await Promise.all([
    api<LisFilmsSummary>('/explore/summary'),
    api<{ media: string; title: string; year: number | null }[]>('/explore/trending').catch(() => []),
    api<{ id: number; username: string; reviews: number; media: number }[]>('/explore/top-users').catch(() => []),
  ])
  return payload(
    guild,
    'lisfilmsSummary',
    {
      filmes: String(s.filmes),
      series: String(s.series),
      reviews: String(s.reviews),
      utilizadores: String(s.utilizadores),
      media: s.media_global != null ? `${s.media_global}/5` : '—',
      emAlta:
        trending
          .slice(0, 5)
          .map((t, i) => `**${i + 1}.** ${t.media === 'serie' ? '📺' : '🎬'} ${t.title}${t.year ? ` (${t.year})` : ''}`)
          .join('\n') || '—',
      topUtilizadores:
        users
          .slice(0, 5)
          .map((u, i) => `**${i + 1}.** [${u.username}](${siteLink(settings.siteUrl, 'users', u.id)}) — ${u.reviews} reviews · média ${u.media}`)
          .join('\n') || '—',
      link: settings.siteUrl,
    },
    linkRow(settings, settings.siteUrl),
  )
}

export async function handleLisFilmsAutocomplete(interaction: AutocompleteInteraction): Promise<boolean> {
  if (interaction.commandName !== 'lisfilms') return false
  const focused = interaction.options.getFocused(true)
  const q = String(focused.value).trim()
  if (q.length < 2) {
    await interaction.respond([])
    return true
  }
  try {
    const sub = interaction.options.getSubcommand()
    const hits =
      sub === 'jogo'
        ? await searchGames(q, AUTOCOMPLETE_TIMEOUT_MS)
        : (await searchLisFilms(q, AUTOCOMPLETE_TIMEOUT_MS)).filter((h) => h.media === SUB_MEDIA[sub])
    await interaction.respond(hits.slice(0, 25).map((h) => ({ name: `${h.title}${h.year ? ` (${h.year})` : ''}`.slice(0, 100), value: String(h.id) })))
  } catch {
    await interaction.respond([]).catch(() => undefined)
  }
  return true
}

/** Menu "Abrir um resultado" das pesquisas. */
export async function handleLisFilmsInteraction(interaction: Interaction): Promise<boolean> {
  if (!interaction.isStringSelectMenu() || interaction.customId !== PICK_ID) return false
  const [media, rawId] = (interaction.values[0] ?? '').split(':')
  const id = Number(rawId)
  if (!Number.isFinite(id)) return true
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  try {
    const card = media === 'games' ? await gameCard(interaction.guild, id) : await titleCard(interaction.guild, media as LisFilmsMedia, id)
    await interaction.editReply(card)
  } catch (err) {
    const settings = store.getLisFilmsSettings()
    await interaction.editReply({ content: err instanceof LisFilmsOffline ? settings.offlineText : settings.notFoundText }).catch(() => undefined)
  }
  return true
}

// ==========================================================================
// App
// ==========================================================================

export function getLisFilmsState(): LisFilmsState {
  return { settings: store.getLisFilmsSettings() }
}

export function applyLisFilmsSettings(input: LisFilmsSettings): LisFilmsState {
  const d = defaultLisFilmsSettings()
  const url = (v: unknown, fb: string) => {
    const s = typeof v === 'string' ? v.trim().replace(/\/+$/, '') : ''
    return /^https?:\/\/[^\s]+$/i.test(s) ? s : fb
  }
  const txt = (v: unknown, max: number, fb: string) => (typeof v === 'string' ? v.trim().slice(0, max) || fb : fb)
  const next: LisFilmsSettings = {
    apiUrl: url(input.apiUrl, d.apiUrl),
    siteUrl: url(input.siteUrl, d.siteUrl),
    enabled: input.enabled !== false,
    commands: Object.fromEntries(
      Object.keys(d.commands).map((k) => [k, input.commands?.[k as keyof typeof d.commands] !== false]),
    ) as unknown as LisFilmsSettings['commands'],
    ephemeral: Boolean(input.ephemeral),
    resultsLimit: Math.min(25, Math.max(1, Math.round(Number(input.resultsLimit) || d.resultsLimit))),
    linkButton: {
      show: input.linkButton?.show !== false,
      label: txt(input.linkButton?.label, 80, d.linkButton.label),
      emoji: (input.linkButton?.emoji ?? '').trim(),
    },
    pickMenu: input.pickMenu !== false,
    pickPlaceholder: txt(input.pickPlaceholder, 150, d.pickPlaceholder),
    offlineText: txt(input.offlineText, 500, d.offlineText),
    notFoundText: txt(input.notFoundText, 500, d.notFoundText),
  }
  store.saveLisFilmsSettings(next)
  return getLisFilmsState()
}

/** Testa a ligação à API (e traz o resumo, para a app mostrar). */
export async function testLisFilms(): Promise<LisFilmsStatus> {
  const started = Date.now()
  try {
    const summary = await api<LisFilmsSummary>('/explore/summary')
    return { ok: true, latencyMs: Date.now() - started, summary }
  } catch (err) {
    return { ok: false, latencyMs: null, error: errText(err) }
  }
}
