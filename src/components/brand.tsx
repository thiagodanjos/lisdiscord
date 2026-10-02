import { useId } from 'react'
import { cn } from '../lib/utils'

// Marcas em vetor (nítidas em qualquer tamanho). O LisDiscord e o LisFilms partilham a mesma linguagem:
// o ponto verde, a barra branca e — no LisDiscord — o "D" em gradiente verde → ciano.

export const BRAND = {
  bg: '#0b0d10',
  green: '#1ED760',
  cyan: '#18CBD6',
  white: '#F4F6F8',
} as const

/** Logótipo do LisDiscord. `plain` tira o quadrado de fundo (para pôr em cima de superfícies escuras). */
export function LogoMark({ size = 28, plain = false, className }: { size?: number; plain?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" className={cn('shrink-0', className)} aria-label="LisDiscord" role="img">
      <defs>
        <linearGradient id={`d-${id}`} x1="900" y1="250" x2="560" y2="800" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BRAND.cyan} />
          <stop offset="1" stopColor={BRAND.green} />
        </linearGradient>
      </defs>
      {!plain && <rect width="1024" height="1024" rx="230" fill={BRAND.bg} />}
      <circle cx="224" cy="512" r="96" fill={BRAND.green} />
      <rect x="416" y="256" width="96" height="512" rx="48" fill={BRAND.white} />
      <path
        d="M632 290 C 782 290 848 392 848 512 C 848 640 772 718 652 718 L 588 786"
        fill="none"
        stroke={`url(#d-${id})`}
        strokeWidth="102"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Marca do LisFilms (a mesma do favicon do site). */
export function LisFilmsMark({ size = 28, plain = false, className }: { size?: number; plain?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-label="LisFilms" role="img">
      {!plain && <rect width="64" height="64" rx="14" fill={BRAND.bg} />}
      <circle cx="18" cy="32" r="7" fill={BRAND.green} />
      <rect x="31" y="15" width="6" height="34" rx="3" fill={BRAND.white} />
      <rect x="42" y="15" width="6" height="34" rx="3" fill={BRAND.green} />
    </svg>
  )
}

/** "LisDiscord" com o "Discord" em gradiente, como no ecrã de arranque. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-extrabold tracking-tight', className)}>
      <span className="text-text">Lis</span>
      <span className="text-brand-gradient">Discord</span>
    </span>
  )
}

export function LisFilmsWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-extrabold tracking-tight', className)}>
      <span className="text-text">Lis</span>
      <span style={{ color: BRAND.green }}>Films</span>
    </span>
  )
}
