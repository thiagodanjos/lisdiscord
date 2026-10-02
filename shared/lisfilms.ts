import type { LisFilmsMedia, LisFilmsSettings } from './types'

// LisFilms — valores de fábrica e ajudas partilhadas entre o bot e a app.

export const LISFILMS_API = 'https://lisfilms-api.onrender.com'
export const LISFILMS_SITE = 'https://lisfilms.pt'
export const LISFILMS_ICON = 'https://lisfilms.pt/pwa-192.png'

export function defaultLisFilmsSettings(): LisFilmsSettings {
  return {
    apiUrl: LISFILMS_API,
    siteUrl: LISFILMS_SITE,
    enabled: true,
    commands: { procurar: true, titulo: true, jogo: true, top: true, resumo: true, destaque: true, utilizador: true },
    ephemeral: false,
    resultsLimit: 8,
    linkButton: { show: true, label: 'Ver no LisFilms', emoji: '🎬' },
    pickMenu: true,
    pickPlaceholder: 'Abrir um resultado…',
    offlineText: '⏳ O LisFilms está a acordar (o servidor gratuito dorme quando não há visitas). Tenta outra vez daqui a uns segundos.',
    notFoundText: '🔎 Não encontrei nada no LisFilms para isso.',
  }
}

export const MEDIA_LABEL: Record<LisFilmsMedia | 'games' | 'users', string> = {
  movies: 'Filme',
  series: 'Série',
  animes: 'Anime',
  games: 'Jogo',
  users: 'Utilizador',
}

export const MEDIA_EMOJI: Record<LisFilmsMedia | 'games' | 'users', string> = {
  movies: '🎬',
  series: '📺',
  animes: '🌸',
  games: '🎮',
  users: '👤',
}

/** Poster da TMDB (os animes vêm já com o URL completo do MyAnimeList). */
export function posterUrl(path: string | null | undefined, size: 'w185' | 'w342' | 'w500' = 'w500'): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `https://image.tmdb.org/t/p/${size}${path}`
}

export function siteLink(siteUrl: string, media: LisFilmsMedia | 'games' | 'users', id: number): string {
  const base = siteUrl.replace(/\/+$/, '')
  if (media === 'games') return `${base}/jogos/${id}`
  if (media === 'users') return `${base}/profile/${id}`
  return `${base}/${media}/${id}`
}

/** Nota /5 em estrelas cheias e meias (★★★★☆). */
export function stars(rating: number | null | undefined): string {
  if (rating == null) return '—'
  const full = Math.round(rating)
  return '★'.repeat(Math.max(0, Math.min(5, full))) + '☆'.repeat(Math.max(0, 5 - full))
}
