import { ChannelType, type Client, type Guild, type GuildMember, MessageFlags, PermissionFlagsBits, type VoiceState } from 'discord.js'
import type { ChannelPickerEntry, VoiceHoursAction, VoiceHoursSettings, VoiceHoursState, VoiceLiveEntry, VoiceStatusReason } from '../../shared/types'
import { defaultVoiceHoursSettings } from '../../shared/movFeatures'
import { formatDuration } from '../../shared/leaderboardFormat'
import * as store from '../store/voiceHours'
import * as movPoints from '../store/movPoints'
import { countVoiceSession } from '../store/weeklyReport'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { embedToContainer } from './componentsV2'

// Horas automáticas: a cada minuto o bot olha para as calls de cada servidor e soma 1 minuto a quem
// está a contar (com gente na call, sem estar ensurdecido, no canal certo, com o cargo certo…). Pausas
// não contam, mas não fecham a sessão; a sessão fecha quando a pessoa sai da call (ou fica muito tempo
// em pausa) e só aí as horas são creditadas — com o log de horas e o canal de log normais.

const TICK_MS = 60_000
/** Uma pausa (sozinho, mutado…) mais longa do que isto fecha a sessão. */
const PAUSE_CLOSE_MS = 15 * 60_000
const ACTOR = 'Horas automáticas (call)'

/** Último retrato de quem está em call, por servidor — para a app e para o /perfil. */
const liveByGuild = new Map<string, VoiceLiveEntry[]>()

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

function reasonFor(state: VoiceState, member: GuildMember, settings: VoiceHoursSettings, todaySeconds: number, sessionSeconds: number): VoiceStatusReason {
  const channel = state.channel!
  if (settings.ignoredUserIds.includes(member.id)) return 'ignored'
  if (settings.roleIds.length > 0 && !settings.roleIds.some((id) => member.roles.cache.has(id))) return 'role'
  if (settings.ignoreAfkChannel && state.guild.afkChannelId === channel.id) return 'afk'
  const listed = settings.channelIds.includes(channel.id) || (channel.parentId ? settings.channelIds.includes(channel.parentId) : false)
  if (settings.channelMode === 'only' && !listed) return 'channel'
  if (settings.channelMode === 'except' && listed) return 'channel'
  if (settings.ignoreSelfDeafened && (state.selfDeaf || state.serverDeaf)) return 'selfDeafened'
  if (settings.ignoreSelfMuted && state.selfMute) return 'selfMuted'
  if (settings.ignoreServerMuted && state.serverMute) return 'serverMuted'
  const humans = channel.members.filter((m) => !m.user.bot).size
  if (humans < Math.max(1, settings.minMembers)) return 'alone'
  if (settings.dailyCapHours > 0 && todaySeconds + sessionSeconds >= settings.dailyCapHours * 3600) return 'cap'
  return 'counting'
}

/** Um minuto de contagem num servidor. */
export async function tickGuild(guild: Guild): Promise<void> {
  const settings = store.getVoiceHoursSettings(guild.id)
  const active = { ...store.getActiveSessions(guild.id) }
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const live: VoiceLiveEntry[] = []
  const present = new Set<string>()
  let changed = false

  if (settings.enabled) {
    for (const state of guild.voiceStates.cache.values()) {
      if (!state.channelId || !state.channel) continue
      const member = state.member ?? (await guild.members.fetch(state.id).catch(() => null))
      if (!member || member.user.bot) continue
      present.add(member.id)
      const session = active[member.id]
      const today = settings.dailyCapHours > 0 ? store.creditedToday(guild.id, member.id) : 0
      const reason = reasonFor(state, member, settings, today, session?.seconds ?? 0)

      if (reason === 'counting') {
        if (!session) {
          active[member.id] = {
            userId: member.id,
            tag: member.user.tag,
            channelId: state.channel.id,
            channelName: state.channel.name,
            startedAt: nowIso,
            lastSeenAt: nowIso,
            seconds: 0,
          }
        } else {
          // Só soma se já estava a contar no minuto anterior (retoma depois de uma pausa sem a contar).
          const gap = now - new Date(session.lastSeenAt).getTime()
          if (gap <= TICK_MS * 1.6) session.seconds += Math.round(Math.min(gap, TICK_MS * 1.5) / 1000)
          session.lastSeenAt = nowIso
          session.channelId = state.channel.id
          session.channelName = state.channel.name
          session.tag = member.user.tag
        }
        changed = true
      }

      const s = active[member.id]
      live.push({
        userId: member.id,
        tag: member.user.tag,
        channelId: state.channel.id,
        channelName: state.channel.name,
        reason,
        sessionSeconds: s?.seconds ?? 0,
        startedAt: s?.startedAt ?? null,
      })
    }
  }

  // Fecha as sessões de quem saiu da call, ficou muito tempo em pausa, ou com a contagem desligada.
  for (const session of Object.values(active)) {
    const paused = now - new Date(session.lastSeenAt).getTime()
    if (settings.enabled && present.has(session.userId) && paused < PAUSE_CLOSE_MS) continue
    delete active[session.userId]
    changed = true
    await closeSession(guild, settings, session).catch((err) => console.error('[horas automáticas] Falha a fechar sessão:', errText(err)))
  }

  liveByGuild.set(
    guild.id,
    live.sort((a, b) => (a.reason === 'counting' ? 0 : 1) - (b.reason === 'counting' ? 0 : 1) || b.sessionSeconds - a.sessionSeconds),
  )
  if (changed) store.saveActiveSessions(guild.id, active)
}

/** Credita (ou descarta) uma sessão terminada e regista-a. */
async function closeSession(guild: Guild, settings: VoiceHoursSettings, session: store.ActiveSession, forceDiscard?: string): Promise<void> {
  const endedAt = new Date().toISOString()
  const base = { userId: session.userId, tag: session.tag, channelName: session.channelName, startedAt: session.startedAt, endedAt }
  if (forceDiscard) {
    store.recordSession(guild.id, { ...base, seconds: session.seconds, credited: false, note: forceDiscard })
    return
  }
  if (session.seconds < Math.max(0, settings.minSessionMinutes) * 60 || session.seconds <= 0) {
    store.recordSession(guild.id, { ...base, seconds: session.seconds, credited: false, note: `mais curta do que ${settings.minSessionMinutes} min` })
    return
  }
  let seconds = session.seconds
  let note: string | undefined
  if (settings.dailyCapHours > 0) {
    const remaining = settings.dailyCapHours * 3600 - store.creditedToday(guild.id, session.userId)
    if (remaining <= 0) {
      store.recordSession(guild.id, { ...base, seconds, credited: false, note: 'limite diário atingido' })
      return
    }
    if (seconds > remaining) {
      note = `cortada pelo limite diário (${formatDuration(seconds)} → ${formatDuration(remaining)})`
      seconds = remaining
    }
  }

  const total = movPoints.addHours(guild.id, session.userId, session.tag, seconds, ACTOR, `Call em #${session.channelName}`)
  store.recordSession(guild.id, { ...base, seconds, credited: true, note })
  countVoiceSession(guild.id)

  if (settings.logChannelId && seconds >= settings.logMinMinutes * 60) {
    const channel = await guild.channels.fetch(settings.logChannelId).catch(() => null)
    if (!channel?.isTextBased()) return
    const member = await guild.members.fetch(session.userId).catch(() => null)
    const embed = buildEmbedFromDraft(
      getTemplate(guild.id, 'voiceSessionLog'),
      {
        membro: `<@${session.userId}>`,
        nome: member?.displayName ?? session.tag,
        avatar: member?.displayAvatarURL({ size: 256 }) ?? '',
        canal: `<#${session.channelId}>`,
        duracao: formatDuration(seconds),
        total: formatDuration(total),
        inicio: `<t:${Math.floor(new Date(session.startedAt).getTime() / 1000)}:t>`,
        fim: `<t:${Math.floor(Date.now() / 1000)}:t>`,
        servidor: guild.name,
      },
      { separators: 'keep' },
    )
    if (!embedHasContent(embed)) embed.setDescription(`🎙️ <@${session.userId}> — ${formatDuration(seconds)} em call.`)
    await channel
      .send({ flags: MessageFlags.IsComponentsV2, components: [embedToContainer(embed)], allowedMentions: { parse: [] } })
      .catch((err) => console.error('[horas automáticas] Falha no canal de log:', errText(err)))
  }
}

export function startVoiceHoursLoop(client: Client): () => void {
  let running = false
  const tick = async () => {
    if (running || !client.isReady()) return
    running = true
    try {
      const ids = new Set([...store.listGuildsWithVoiceHours()])
      for (const id of ids) {
        const guild = client.guilds.cache.get(id)
        if (guild) await tickGuild(guild).catch((err) => console.error(`[horas automáticas] ${id}:`, errText(err)))
      }
    } finally {
      running = false
    }
  }
  const interval = setInterval(() => void tick(), TICK_MS)
  void tick()
  return () => clearInterval(interval)
}

/** Sessão em curso de alguém (para o {emCall} do /perfil). */
export function getLiveEntry(guildId: string, userId: string): VoiceLiveEntry | null {
  return liveByGuild.get(guildId)?.find((e) => e.userId === userId) ?? null
}

// ==========================================================================
// App
// ==========================================================================

function validNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

function voiceChannels(guild: Guild): ChannelPickerEntry[] {
  return [...guild.channels.cache.values()]
    .filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice || c.type === ChannelType.GuildCategory)
    .map((c) => ({ id: c.id, name: c.name, kind: c.type === ChannelType.GuildCategory ? ('category' as const) : c.type === ChannelType.GuildStageVoice ? ('stage' as const) : ('voice' as const) }))
}

export async function getVoiceHoursState(client: Client | null, guildId: string): Promise<VoiceHoursState> {
  const settings = store.getVoiceHoursSettings(guildId)
  const guild = client?.isReady() ? await client.guilds.fetch(guildId).catch(() => null) : null
  if (guild) await guild.channels.fetch().catch(() => undefined)
  // Mostra a sessão já acumulada mesmo entre dois minutos.
  return {
    settings,
    live: liveByGuild.get(guildId) ?? [],
    recent: store.listSessionHistory(guildId).slice(0, 100),
    voiceChannels: guild ? voiceChannels(guild) : [],
    connected: Boolean(guild),
  }
}

export async function applyVoiceHoursSettings(guild: Guild, input: VoiceHoursSettings): Promise<VoiceHoursState> {
  const d = defaultVoiceHoursSettings()
  await guild.roles.fetch().catch(() => undefined)
  await guild.channels.fetch().catch(() => undefined)
  const ids = (v: unknown) => [...new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^\d{17,20}$/.test(x)) : [])]
  const next: VoiceHoursSettings = {
    ...d,
    ...input,
    enabled: Boolean(input.enabled),
    channelMode: input.channelMode === 'only' || input.channelMode === 'except' ? input.channelMode : 'all',
    channelIds: ids(input.channelIds).filter((id) => guild.channels.cache.has(id)),
    roleIds: ids(input.roleIds).filter((id) => guild.roles.cache.has(id)),
    ignoredUserIds: ids(input.ignoredUserIds),
    minMembers: Math.round(validNumber(input.minMembers, 1, 25, d.minMembers)),
    ignoreSelfMuted: Boolean(input.ignoreSelfMuted),
    ignoreSelfDeafened: Boolean(input.ignoreSelfDeafened),
    ignoreServerMuted: Boolean(input.ignoreServerMuted),
    ignoreAfkChannel: Boolean(input.ignoreAfkChannel),
    minSessionMinutes: Math.round(validNumber(input.minSessionMinutes, 0, 240, d.minSessionMinutes)),
    dailyCapHours: validNumber(input.dailyCapHours, 0, 24, 0),
    logMinMinutes: Math.round(validNumber(input.logMinMinutes, 0, 600, d.logMinMinutes)),
    statusCounting: (input.statusCounting ?? '').trim().slice(0, 100) || d.statusCounting,
    statusPaused: (input.statusPaused ?? '').trim().slice(0, 100) || d.statusPaused,
  }
  if (next.logChannelId) {
    const channel = await guild.channels.fetch(next.logChannelId).catch(() => null)
    if (!channel || !channel.isTextBased() || channel.isThread()) throw new Error('O canal de log das horas automáticas tem de ser um canal de texto.')
    const me = guild.members.me ?? (await guild.members.fetchMe())
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      throw new Error(`O bot não consegue enviar mensagens em #${channel.name}.`)
    }
    next.logChannelName = channel.name
  } else {
    next.logChannelName = null
  }
  store.saveVoiceHoursSettings(guild.id, next)
  // Conta já com as regras novas, sem esperar pelo próximo minuto.
  await tickGuild(guild).catch(() => undefined)
  return getVoiceHoursState(guild.client, guild.id)
}

export async function applyVoiceHoursAction(guild: Guild, action: VoiceHoursAction): Promise<VoiceHoursState> {
  const active = { ...store.getActiveSessions(guild.id) }
  const session = active[String(action.userId)]
  if (!session) throw new Error('Essa pessoa já não tem uma sessão em curso.')
  delete active[session.userId]
  store.saveActiveSessions(guild.id, active)
  const settings = store.getVoiceHoursSettings(guild.id)
  if (action.kind === 'discard') await closeSession(guild, settings, session, 'descartada à mão na app')
  else await closeSession(guild, { ...settings, minSessionMinutes: 0 }, session)
  await tickGuild(guild).catch(() => undefined)
  return getVoiceHoursState(guild.client, guild.id)
}
