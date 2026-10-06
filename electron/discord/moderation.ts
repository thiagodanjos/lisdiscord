import { type Guild, type GuildMember, PermissionFlagsBits } from 'discord.js'
import type {
  MemberSearchResult,
  ModerationBan,
  ModerationMember,
  ModerationOp,
  ModerationResult,
  ModerationRole,
  ModerationState,
  TimeoutDuration,
} from '../../shared/types'
import * as moderationLogStore from '../store/moderationLog'

export async function searchMembers(guild: Guild, query: string): Promise<MemberSearchResult[]> {
  if (!query.trim()) return []
  const q = query.trim()
  // Um ID colado também encontra o membro (a pesquisa da Discord só procura por nome).
  if (/^\d{17,20}$/.test(q)) {
    const m = await guild.members.fetch(q).catch(() => null)
    if (m) return [toSearchResult(m)]
  }
  const results = await guild.members.search({ query: q, limit: 15 })
  return [...results.values()].map(toSearchResult)
}

function toSearchResult(m: GuildMember): MemberSearchResult {
  return {
    id: m.id,
    tag: m.user.tag,
    avatarUrl: m.displayAvatarURL({ size: 64 }),
    isTimedOut: m.isCommunicationDisabled(),
    isBot: m.user.bot,
  }
}

export async function banMember(guild: Guild, userId: string, reason: string, deleteMessageSeconds: number): Promise<void> {
  await guild.members.ban(userId, { reason: reason || undefined, deleteMessageSeconds })
}

export async function kickMember(guild: Guild, userId: string, reason: string): Promise<void> {
  const member = await guild.members.fetch(userId)
  await member.kick(reason || undefined)
}

export async function timeoutMember(guild: Guild, userId: string, durationMs: TimeoutDuration, reason: string): Promise<void> {
  const member = await guild.members.fetch(userId)
  await member.timeout(durationMs, reason || undefined)
}

export async function removeTimeout(guild: Guild, userId: string): Promise<void> {
  const member = await guild.members.fetch(userId)
  await member.timeout(null)
}

export async function lockChannel(guild: Guild, channelId: string): Promise<void> {
  const channel = await guild.channels.fetch(channelId)
  if (!channel || !('permissionOverwrites' in channel)) throw new Error('Este canal não suporta bloqueio.')
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false })
}

export async function unlockChannel(guild: Guild, channelId: string): Promise<void> {
  const channel = await guild.channels.fetch(channelId)
  if (!channel || !('permissionOverwrites' in channel)) throw new Error('Este canal não suporta bloqueio.')
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null })
}

// ==========================================================================
// Painel completo de moderação (app): membro em detalhe, cargos, banidos e todas as ações
// ==========================================================================

const MAX_TIMEOUT_MS = 28 * 86_400_000
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

async function botMember(guild: Guild): Promise<GuildMember> {
  return guild.members.me ?? (await guild.members.fetchMe())
}

export async function listModerationRoles(guild: Guild): Promise<ModerationRole[]> {
  await guild.roles.fetch()
  const me = await botMember(guild)
  const top = me.roles.highest.position
  const canManage = me.permissions.has(PermissionFlagsBits.ManageRoles)
  return [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.hexColor,
      position: r.position,
      memberCount: r.members.size,
      managed: r.managed,
      editable: canManage && !r.managed && r.position < top,
      hoist: r.hoist,
      mentionable: r.mentionable,
    }))
}

export async function getModerationState(guild: Guild): Promise<ModerationState> {
  const me = await botMember(guild)
  return {
    roles: await listModerationRoles(guild),
    log: moderationLogStore.listModerationLog().filter((e) => e.guildId === guild.id),
    botHighestPosition: me.roles.highest.position,
  }
}

export function toModerationMember(m: GuildMember): ModerationMember {
  const until = m.communicationDisabledUntilTimestamp
  return {
    id: m.id,
    tag: m.user.tag,
    displayName: m.displayName,
    nickname: m.nickname,
    avatarUrl: m.displayAvatarURL({ size: 128 }),
    isBot: m.user.bot,
    isOwner: m.guild.ownerId === m.id,
    timedOutUntil: until && until > Date.now() ? new Date(until).toISOString() : null,
    joinedAt: m.joinedAt?.toISOString() ?? null,
    createdAt: m.user.createdAt.toISOString(),
    roleIds: [...m.roles.cache.keys()].filter((id) => id !== m.guild.id),
    voiceChannelId: m.voice.channelId,
    voiceChannelName: m.voice.channel?.name ?? null,
    serverMuted: Boolean(m.voice.serverMute),
    serverDeafened: Boolean(m.voice.serverDeaf),
    kickable: m.kickable,
    bannable: m.bannable,
    moderatable: m.moderatable,
    manageable: m.manageable,
  }
}

export async function getModerationMember(guild: Guild, userId: string): Promise<ModerationMember> {
  const m = await guild.members.fetch({ user: userId, force: true }).catch(() => null)
  if (!m) throw new Error('Esse membro já não está no servidor.')
  return toModerationMember(m)
}

export async function listBans(guild: Guild): Promise<ModerationBan[]> {
  const bans = await guild.bans.fetch().catch((err) => {
    throw new Error(`Não consegui ler os banidos (o bot precisa da permissão "Banir membros"): ${errText(err)}`)
  })
  return [...bans.values()].map((b) => ({
    userId: b.user.id,
    tag: b.user.tag,
    avatarUrl: b.user.displayAvatarURL({ size: 64 }),
    reason: b.reason ?? null,
  }))
}

function hex(color: string): number {
  const n = Number.parseInt(color.replace('#', ''), 16)
  return Number.isFinite(n) ? n : 0
}

function formatMs(ms: number): string {
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} dias`
}

/** Faz uma ação de moderação e regista-a. Devolve uma frase para a app e o membro atualizado. */
export async function runModerationOp(guild: Guild, op: ModerationOp, actor: string | null): Promise<ModerationResult> {
  const reasonOf = (r: string | undefined) => {
    const base = (r ?? '').trim()
    return (actor ? `${base}${base ? ' · ' : ''}por ${actor} (LisDiscord)` : base).slice(0, 500) || undefined
  }
  type LogAction = Parameters<typeof moderationLogStore.logModerationAction>[0]['action']
  const log = (action: LogAction, targetTag: string, reason: string | null, detail?: string) =>
    moderationLogStore.logModerationAction({ guildId: guild.id, guildName: guild.name, action, targetTag, reason: reason || null, detail: detail ?? null, actor })
  const member = async (userId: string) => {
    const m = await guild.members.fetch({ user: userId, force: true }).catch(() => null)
    if (!m) throw new Error('Esse membro já não está no servidor.')
    return m
  }
  const fresh = async (userId: string) => getModerationMember(guild, userId).catch(() => null)
  const roleOf = async (roleId: string) => {
    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null))
    if (!role) throw new Error('Esse cargo já não existe.')
    const me = await botMember(guild)
    if (role.managed) throw new Error(`O cargo @${role.name} é de uma integração — a Discord não deixa dar nem tirar.`)
    if (role.position >= me.roles.highest.position) {
      throw new Error(`O cargo @${role.name} está acima (ou ao nível) do cargo mais alto do bot — sobe o cargo do bot nas definições do servidor.`)
    }
    return role
  }
  const textChannel = async (channelId: string) => {
    const ch = await guild.channels.fetch(channelId).catch(() => null)
    if (!ch || !ch.isTextBased() || ch.isDMBased()) throw new Error('Esse canal não existe ou não é de texto.')
    return ch
  }

  switch (op.kind) {
    case 'ban': {
      const m = await guild.members.fetch(op.userId).catch(() => null)
      if (m && !m.bannable) throw new Error('O bot não consegue banir este membro (cargo acima do bot, ou é o dono).')
      const deleteSeconds = Math.min(604_800, Math.max(0, Math.round(op.deleteMessageSeconds || 0)))
      const tag = m?.user.tag ?? (await guild.client.users.fetch(op.userId).catch(() => null))?.tag ?? op.userId
      await guild.members.ban(op.userId, { reason: reasonOf(op.reason), deleteMessageSeconds: deleteSeconds })
      log('ban', tag, op.reason)
      return { message: `${tag} foi banido.`, member: null }
    }
    case 'unban': {
      const ban = await guild.bans.fetch(op.userId).catch(() => null)
      if (!ban) throw new Error('Esse utilizador não está banido.')
      await guild.members.unban(op.userId, reasonOf(op.reason))
      log('unban', ban.user.tag, op.reason)
      return { message: `${ban.user.tag} foi desbanido.` }
    }
    case 'kick': {
      const m = await member(op.userId)
      if (!m.kickable) throw new Error('O bot não consegue expulsar este membro (cargo acima do bot, ou é o dono).')
      await m.kick(reasonOf(op.reason))
      log('kick', m.user.tag, op.reason)
      return { message: `${m.user.tag} foi expulso.`, member: null }
    }
    case 'timeout': {
      const m = await member(op.userId)
      if (!m.moderatable) throw new Error('O bot não consegue castigar este membro (cargo acima do bot, administrador, ou é o dono).')
      const ms = Math.min(MAX_TIMEOUT_MS, Math.max(60_000, Math.round(op.durationMs)))
      await m.timeout(ms, reasonOf(op.reason))
      const label = formatMs(ms)
      log('timeout', m.user.tag, op.reason, label)
      return { message: `${m.user.tag} ficou de castigo por ${label}.`, member: await fresh(m.id) }
    }
    case 'removeTimeout': {
      const m = await member(op.userId)
      await m.timeout(null, reasonOf(''))
      log('removeTimeout', m.user.tag, null)
      return { message: `Castigo de ${m.user.tag} removido.`, member: await fresh(m.id) }
    }
    case 'addRole':
    case 'removeRole': {
      const m = await member(op.userId)
      const role = await roleOf(op.roleId)
      if (op.kind === 'addRole') await m.roles.add(role, reasonOf(op.reason))
      else await m.roles.remove(role, reasonOf(op.reason))
      log(op.kind, m.user.tag, op.reason, `@${role.name}`)
      return {
        message: op.kind === 'addRole' ? `@${role.name} dado a ${m.displayName}.` : `@${role.name} tirado a ${m.displayName}.`,
        member: await fresh(m.id),
      }
    }
    case 'nickname': {
      const m = await member(op.userId)
      if (!m.manageable) throw new Error('O bot não consegue mudar o apelido deste membro (cargo acima do bot, ou é o dono).')
      const nick = op.nickname.trim().slice(0, 32)
      await m.setNickname(nick || null, reasonOf(''))
      log('nickname', m.user.tag, null, nick || '(apelido removido)')
      return { message: nick ? `Apelido de ${m.user.tag} mudado para "${nick}".` : `Apelido de ${m.user.tag} removido.`, member: await fresh(m.id) }
    }
    case 'warn': {
      const m = await member(op.userId)
      const reason = op.reason.trim()
      if (!reason) throw new Error('Escreve o motivo do aviso.')
      const sent = await m
        .send({ content: `⚠️ **Aviso da moderação de ${guild.name}**\n${reason.slice(0, 1800)}`, allowedMentions: { parse: [] } })
        .then(() => true)
        .catch(() => false)
      log('warn', m.user.tag, reason, sent ? 'DM enviada' : 'DM fechada')
      return { message: sent ? `Aviso enviado por DM a ${m.user.tag}.` : `${m.user.tag} tem as DMs fechadas — o aviso ficou só registado.`, member: await fresh(m.id) }
    }
    case 'voiceDisconnect': {
      const m = await member(op.userId)
      if (!m.voice.channelId) throw new Error(`${m.displayName} não está em nenhuma call.`)
      await m.voice.disconnect(reasonOf(''))
      log('voiceDisconnect', m.user.tag, null)
      return { message: `${m.displayName} foi desligado da call.`, member: await fresh(m.id) }
    }
    case 'voiceMute':
    case 'voiceDeafen': {
      const m = await member(op.userId)
      if (!m.voice.channelId) throw new Error(`${m.displayName} não está em nenhuma call (só dá para silenciar quem está numa).`)
      if (op.kind === 'voiceMute') await m.voice.setMute(op.on, reasonOf(''))
      else await m.voice.setDeaf(op.on, reasonOf(''))
      log(op.kind, m.user.tag, null, op.on ? 'ligado' : 'desligado')
      const what = op.kind === 'voiceMute' ? 'silenciado' : 'ensurdecido'
      return { message: op.on ? `${m.displayName} foi ${what} na call.` : `${m.displayName} já não está ${what}.`, member: await fresh(m.id) }
    }
    case 'lockChannel':
    case 'unlockChannel': {
      const ch = await guild.channels.fetch(op.channelId)
      if (!ch || !('permissionOverwrites' in ch)) throw new Error('Este canal não suporta bloqueio.')
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: op.kind === 'lockChannel' ? false : null }, { reason: reasonOf('') })
      log(op.kind, `#${ch.name}`, null)
      return { message: op.kind === 'lockChannel' ? `#${ch.name} bloqueado.` : `#${ch.name} desbloqueado.` }
    }
    case 'slowmode': {
      const ch = await textChannel(op.channelId)
      if (!('setRateLimitPerUser' in ch)) throw new Error('Este canal não tem modo lento.')
      const seconds = Math.min(21_600, Math.max(0, Math.round(op.seconds)))
      await ch.setRateLimitPerUser(seconds, reasonOf(''))
      log('slowmode', `#${ch.name}`, null, seconds ? `${seconds}s` : 'desligado')
      return { message: seconds ? `Modo lento de #${ch.name}: ${seconds}s.` : `Modo lento de #${ch.name} desligado.` }
    }
    case 'purge': {
      const ch = await textChannel(op.channelId)
      if (!('bulkDelete' in ch)) throw new Error('Não dá para apagar mensagens neste canal.')
      const want = Math.min(500, Math.max(1, Math.round(op.count)))
      let deleted = 0
      let before: string | undefined
      // Vai buscar em blocos de 100 (máximo da Discord) — só dá para apagar em massa mensagens com menos de 14 dias.
      for (let page = 0; page < 20 && deleted < want; page++) {
        const batch = await ch.messages.fetch({ limit: 100, before })
        if (batch.size === 0) break
        before = batch.last()?.id
        const targets = [...batch.values()].filter((msg) => !op.userId || msg.author.id === op.userId).slice(0, want - deleted)
        if (targets.length) {
          const removed = await ch.bulkDelete(targets, true)
          deleted += removed.size
          if (removed.size < targets.length) break // o resto tem mais de 14 dias
        }
        if (batch.size < 100) break
      }
      log('purge', `#${ch.name}`, null, `${deleted} mensagens${op.userId ? ` de ${op.userId}` : ''}`)
      return { message: deleted ? `${deleted} mensagens apagadas em #${ch.name}.` : 'Não havia mensagens para apagar (a Discord só deixa apagar em massa com menos de 14 dias).' }
    }
    case 'massRole': {
      const role = await roleOf(op.roleId)
      const all = await guild.members.fetch().catch(() => guild.members.cache)
      const targets = [...all.values()].filter(
        (m) => !m.user.bot && (!op.filterRoleId || m.roles.cache.has(op.filterRoleId)) && (op.mode === 'add' ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id)),
      )
      let done = 0
      for (const m of targets.slice(0, 1000)) {
        try {
          if (op.mode === 'add') await m.roles.add(role, reasonOf('cargo em massa'))
          else await m.roles.remove(role, reasonOf('cargo em massa'))
          done++
        } catch {
          // membro acima do bot — passa ao seguinte
        }
      }
      log('massRole', `@${role.name}`, null, `${op.mode === 'add' ? 'dado a' : 'tirado a'} ${done} membros`)
      return { message: `@${role.name} ${op.mode === 'add' ? 'dado a' : 'tirado a'} ${done} membro(s).`, state: await getModerationState(guild) }
    }
    case 'createRole': {
      const name = op.name.trim().slice(0, 100)
      if (!name) throw new Error('Dá um nome ao cargo.')
      const role = await guild.roles.create({ name, color: hex(op.color), hoist: op.hoist, mentionable: op.mentionable, reason: reasonOf('') })
      log('createRole', `@${role.name}`, null)
      return { message: `Cargo @${role.name} criado.`, state: await getModerationState(guild) }
    }
    case 'editRole': {
      const role = await roleOf(op.roleId)
      const name = op.name.trim().slice(0, 100) || role.name
      await role.edit({ name, color: hex(op.color), hoist: op.hoist, mentionable: op.mentionable, reason: reasonOf('') })
      log('editRole', `@${name}`, null)
      return { message: `Cargo @${name} atualizado.`, state: await getModerationState(guild) }
    }
    case 'deleteRole': {
      const role = await roleOf(op.roleId)
      await role.delete(reasonOf(''))
      log('deleteRole', `@${role.name}`, null)
      return { message: `Cargo @${role.name} apagado.`, state: await getModerationState(guild) }
    }
  }
  throw new Error('Ação desconhecida.')
}

/** Tira o bot de um servidor (não dá para desfazer — só convidando-o outra vez). */
export async function leaveGuild(guild: Guild): Promise<{ name: string }> {
  const name = guild.name
  await guild.leave()
  return { name }
}
