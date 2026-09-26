/** Lê durações como "1h30m", "2d", "45m", "90s" (espaços ignorados). Devolve milissegundos, ou null se não perceber. */
export function parseDurationMs(raw: string): number | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '')
  const match = normalized.match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!match || normalized === '') return null
  const [, d, h, m, s] = match
  if (!d && !h && !m && !s) return null
  return (Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3_600 + Number(m ?? 0) * 60 + Number(s ?? 0)) * 1000
}
