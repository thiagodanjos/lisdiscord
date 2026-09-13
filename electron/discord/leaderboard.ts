import type { Guild, GuildMember } from 'discord.js'
import type { MovPointsEntry } from '../../shared/types'
import * as excludedMembersStore from '../store/excludedMembers'
import * as movPoints from '../store/movPoints'

const LIST_PAGE_SIZE = 1000

/**
 * Lista todos os membros do servidor via REST (`GET /guilds/{id}/members`, paginado) — não precisa do
 * intent privilegiado de membros, ao contrário de pedir a lista completa pelo gateway.
 */
export async function listAllGuildMembers(guild: Guild): Promise<GuildMember[]> {
  const collected = new Map<string, GuildMember>()
  let after: string | undefined

  for (;;) {
    const page = await guild.members.list({ limit: LIST_PAGE_SIZE, after })
    if (page.size === 0) break
    for (const member of page.values()) collected.set(member.id, member)
    if (page.size < LIST_PAGE_SIZE) break
    after = page.last()?.id
  }

  return [...collected.values()]
}

/**
 * Junta a lista completa de membros do servidor com os pontos/horas guardados — mostra sempre toda a
 * gente (mesmo quem nunca teve pontos), exceto bots e quem foi escondido do ranking pela app. Ordenado
 * por pontos, depois horas, depois nome.
 */
export async function buildFullLeaderboard(guild: Guild): Promise<MovPointsEntry[]> {
  const members = await listAllGuildMembers(guild)
  const excluded = new Set(excludedMembersStore.listExcluded(guild.id).map((m) => m.userId))
  const tracked = new Map(movPoints.getLeaderboard(guild.id).map((e) => [e.userId, e]))

  const entries: MovPointsEntry[] = members
    .filter((m) => !m.user.bot && !excluded.has(m.id))
    .map((m) => {
      const existing = tracked.get(m.id)
      return { userId: m.id, tag: m.user.tag, points: existing?.points ?? 0, totalSeconds: existing?.totalSeconds ?? 0 }
    })

  return entries.sort((a, b) => b.points - a.points || b.totalSeconds - a.totalSeconds || a.tag.localeCompare(b.tag))
}
