import type { BackupData, ChannelBackup, DiffEntry, RoleBackup } from '../../shared/types'

/**
 * Compara dois backups pelo nome dos elementos (não pelo ID — os IDs mudam
 * de servidor para servidor, o nome é o que faz sentido comparar aqui).
 */
export function diffBackups(a: BackupData, b: BackupData): DiffEntry[] {
  const entries: DiffEntry[] = []

  entries.push(...diffByName(a.roles, b.roles, 'role', roleSignature))
  entries.push(...diffByName(a.channels, b.channels, 'channel', channelSignature))
  entries.push(
    ...diffByName(a.emojis, b.emojis, 'emoji', (e) => e.animated.toString()),
  )

  return entries
}

function diffByName<T extends { name: string }>(
  before: T[],
  after: T[],
  category: DiffEntry['category'],
  signature: (item: T) => string,
): DiffEntry[] {
  const beforeMap = new Map(before.map((item) => [item.name, item]))
  const afterMap = new Map(after.map((item) => [item.name, item]))
  const out: DiffEntry[] = []

  for (const [name, item] of afterMap) {
    if (!beforeMap.has(name)) {
      out.push({ kind: 'added', category, name })
      continue
    }
    const previous = beforeMap.get(name) as T
    if (signature(previous) !== signature(item)) {
      out.push({ kind: 'changed', category, name, details: describeChange(category, previous, item) })
    }
  }

  for (const name of beforeMap.keys()) {
    if (!afterMap.has(name)) out.push({ kind: 'removed', category, name })
  }

  return out
}

function roleSignature(r: RoleBackup): string {
  return [r.color, r.hoist, r.mentionable, [...r.permissions].sort().join(',')].join('|')
}

function channelSignature(c: ChannelBackup): string {
  return [c.kind, c.parentName, c.topic ?? '', c.nsfw ?? false, c.rateLimitPerUser ?? 0].join('|')
}

function describeChange(category: DiffEntry['category'], before: unknown, after: unknown): string {
  if (category === 'role') {
    const b = before as RoleBackup
    const a = after as RoleBackup
    const changes: string[] = []
    if (b.color !== a.color) changes.push('cor')
    if (b.hoist !== a.hoist) changes.push('destaque')
    if (b.mentionable !== a.mentionable) changes.push('menção')
    if (b.permissions.length !== a.permissions.length) changes.push('permissões')
    return changes.join(', ') || 'alterado'
  }
  if (category === 'channel') {
    const b = before as ChannelBackup
    const a = after as ChannelBackup
    const changes: string[] = []
    if (b.parentName !== a.parentName) changes.push('categoria')
    if (b.topic !== a.topic) changes.push('tópico')
    if (b.nsfw !== a.nsfw) changes.push('nsfw')
    return changes.join(', ') || 'alterado'
  }
  return 'alterado'
}
