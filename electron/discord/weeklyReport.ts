import { ActionRowBuilder, type ButtonBuilder, type Client, type Guild, type GuildMember, type Interaction, MessageFlags, PermissionFlagsBits } from 'discord.js'
import type { VerificationButtonStyle, WeeklyReportAction, WeeklyReportSettings, WeeklyReportState } from '../../shared/types'
import { defaultWeeklyReportSettings, fill } from '../../shared/movFeatures'
import { formatDuration } from '../../shared/leaderboardFormat'
import * as store from '../store/weeklyReport'
import * as movPoints from '../store/movPoints'
import * as roleGoalsStore from '../store/roleGoals'
import * as excludedMembersStore from '../store/excludedMembers'
import { listVerifications } from '../store/verification'
import { onMovPointsLogged } from '../store/movPointsLog'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { embedToContainer, textLine } from './componentsV2'
import { listAllGuildMembers } from './leaderboard'
import { customButton, customLinkButton, RANKING_BUTTON_ID } from './profileCommand'

// Relatório semanal: no dia e hora escolhidos na app, o bot publica um resumo do período desde o
// último relatório — top pontos/horas, inativos, quem já pode upar, verificações — e começa um período
// novo. Tudo personalizável: embed, linhas, limites, cargo marcado e botões.

const TICK_MS = 60_000
const COPY_ID = 'wreport:copy'
/** O texto do último relatório (para o botão "Copiar") — guardado por servidor em memória e no ficheiro. */
const lastReportText = new Map<string, string>()

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

function zonedParts(date: Date, timeZone: string): { weekday: number; hour: number; minute: number; day: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {})
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  return { weekday, hour: Number(parts.hour), minute: Number(parts.minute), day: `${parts.year}-${parts.month}-${parts.day}` }
}

function safeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'America/Sao_Paulo'
  }
}

/** Próxima vez que o relatório sai (procura minuto a minuto nos próximos 8 dias). */
export function nextReportAt(settings: WeeklyReportSettings, from = new Date()): Date | null {
  if (!settings.enabled) return null
  const tz = safeZone(settings.timezone)
  const start = Math.ceil(from.getTime() / 60_000) * 60_000
  for (let t = start; t < start + 8 * 86_400_000; t += 60_000) {
    const p = zonedParts(new Date(t), tz)
    if (p.weekday === settings.dayOfWeek && p.hour === settings.hour && p.minute === settings.minute) return new Date(t)
  }
  return null
}

function dateLabel(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(new Date(iso))
}

/** Calcula todos os tokens do relatório com os números reais do período em curso. */
export async function buildReportPlaceholders(guild: Guild, plain = false): Promise<Record<string, string>> {
  const settings = store.getWeeklyReportSettings(guild.id)
  const tz = safeZone(settings.timezone)
  const period = store.getReportPeriod(guild.id)
  const excluded = new Set(excludedMembersStore.listExcluded(guild.id).map((m) => m.userId))
  const stats = Object.entries(period.stats)
    .filter(([id]) => !excluded.has(id))
    .map(([userId, s]) => ({ userId, ...s }))
  const empty = settings.emptyText || '—'
  const top = Math.min(25, Math.max(1, settings.topCount || 5))

  const who = (userId: string, name: string) => (plain ? `@${name}` : `<@${userId}>`)
  const roleRef = (roleId: string) => (plain ? `@${guild.roles.cache.get(roleId)?.name ?? roleId}` : `<@&${roleId}>`)
  const stamp = (ms: number) => (plain ? new Date(ms).toLocaleString('pt-BR', { timeZone: tz }) : `<t:${Math.floor(ms / 1000)}:f>`)
  const line = (format: string, i: number, userId: string, name: string, valor: string) => fill(format, { posicao: String(i + 1), membro: who(userId, name), nome: name, valor })
  const topPoints = stats.filter((s) => s.points > 0).sort((a, b) => b.points - a.points).slice(0, top)
  const topHours = stats.filter((s) => s.seconds > 0).sort((a, b) => b.seconds - a.seconds).slice(0, top)

  let members: GuildMember[] = []
  try {
    members = await listAllGuildMembers(guild)
  } catch {
    members = [...guild.members.cache.values()] // sem a intent Server Members: só quem o bot já viu
  }
  const inScope = members.filter(
    (m) => !m.user.bot && !excluded.has(m.id) && (settings.roleIds.length === 0 || settings.roleIds.some((id) => m.roles.cache.has(id))),
  )
  const statsById = new Map(stats.map((s) => [s.userId, s]))
  const inactive = inScope.filter((m) => {
    const s = statsById.get(m.id)
    return (s?.seconds ?? 0) < settings.inactiveMaxHours * 3600 && (s?.points ?? 0) <= settings.inactiveMaxPoints
  })
  const inactiveShown = inactive.slice(0, Math.max(1, settings.inactiveLimit))
  const inactiveText = inactiveShown.length
    ? inactiveShown.map((m, i) => line(settings.inactiveLineFormat, i, m.id, m.displayName, '')).join('\n') +
      (inactive.length > inactiveShown.length ? `\n-# … e mais ${inactive.length - inactiveShown.length}` : '')
    : empty

  const goals = roleGoalsStore.listGoals(guild.id)
  const totals = new Map(movPoints.getLeaderboard(guild.id).map((e) => [e.userId, e]))
  const ready: string[] = []
  for (const m of inScope) {
    const t = totals.get(m.id)
    if (!t) continue
    for (const g of goals) {
      if (!m.roles.cache.has(g.roleId)) continue
      if (t.points >= g.pointsGoal && t.totalSeconds >= g.hoursGoal * 3600) {
        ready.push(fill(settings.readyLineFormat, { posicao: String(ready.length + 1), membro: who(m.id, m.displayName), nome: m.displayName, cargo: roleRef(g.roleId), valor: '' }))
      }
    }
  }

  const since = new Date(period.periodStart).getTime()
  const decided = listVerifications(guild.id).filter((v) => v.decidedAt && new Date(v.decidedAt).getTime() >= since)
  const now = new Date()
  return {
    periodo: `${dateLabel(period.periodStart, tz)} – ${dateLabel(now, tz)}`,
    inicio: stamp(since),
    fim: stamp(now.getTime()),
    topPontos: topPoints.length ? topPoints.map((s, i) => line(settings.topLineFormat, i, s.userId, s.tag, `${s.points} pontos`)).join('\n') : empty,
    topHoras: topHours.length ? topHours.map((s, i) => line(settings.topLineFormat, i, s.userId, s.tag, formatDuration(s.seconds))).join('\n') : empty,
    inativos: inactiveText,
    totalInativos: String(inactive.length),
    prontos: ready.length ? ready.slice(0, 30).join('\n') + (ready.length > 30 ? `\n-# … e mais ${ready.length - 30}` : '') : empty,
    totalProntos: String(ready.length),
    pontosSemana: String(stats.reduce((n, s) => n + s.points, 0)),
    horasSemana: formatDuration(stats.reduce((n, s) => n + s.seconds, 0)),
    membrosAtivos: String(stats.filter((s) => s.points > 0 || s.seconds > 0).length),
    sessoesCall: String(period.voiceSessions),
    verificados: String(decided.filter((v) => v.status === 'approved').length),
    cancelados: String(decided.filter((v) => v.status === 'rejected').length),
    servidor: guild.name,
  }
}

function reportPayload(guild: Guild, settings: WeeklyReportSettings, placeholders: Record<string, string>, withEmoji: boolean) {
  let embed = buildEmbedFromDraft(getTemplate(guild.id, 'weeklyReport'), placeholders, { separators: 'keep' })
  if (!embedHasContent(embed)) embed = embed.setDescription(`📊 Relatório — ${placeholders.periodo}`)
  const buttons: ButtonBuilder[] = []
  if (settings.copyButton.show) buttons.push(customButton(COPY_ID, settings.copyButton, 'Copiar relatório', withEmoji))
  if (settings.rankingButton.show) buttons.push(customButton(RANKING_BUTTON_ID, settings.rankingButton, 'Ranking completo', withEmoji))
  const link = customLinkButton(settings.linkButton, 'Link', withEmoji)
  if (link) buttons.push(link)
  const rows = buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : []
  const components = [embedToContainer(embed, rows)]
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: settings.mentionRoleId ? [textLine(`<@&${settings.mentionRoleId}>`), ...components] : components,
    allowedMentions: { parse: [] as [], roles: settings.mentionRoleId ? [settings.mentionRoleId] : [] },
  }
}

export async function sendWeeklyReport(guild: Guild, slot: string | null): Promise<void> {
  const settings = store.getWeeklyReportSettings(guild.id)
  if (!settings.channelId) throw new Error('Escolhe o canal do relatório e guarda.')
  const channel = await guild.channels.fetch(settings.channelId).catch(() => null)
  if (!channel || !channel.isTextBased()) throw new Error('O canal do relatório já não existe.')
  const placeholders = await buildReportPlaceholders(guild)
  await channel.send(reportPayload(guild, settings, placeholders, true)).catch(() => channel.send(reportPayload(guild, settings, placeholders, false)))
  // Versão em texto simples (nomes em vez de menções) para o botão "Copiar relatório".
  const plain = await buildReportPlaceholders(guild, true)
  const template = getTemplate(guild.id, 'weeklyReport')
  const text = [template.title, template.description, ...template.fields.map((f) => `${f.name}\n${f.value}`), template.footer]
    .filter(Boolean)
    .map((t) => fill(t, plain).split('{barra}').join('────────────'))
    .join('\n\n')
  lastReportText.set(guild.id, text)
  store.resetPeriod(guild.id, { at: new Date().toISOString(), slot })
}

export function startWeeklyReportLoop(client: Client): () => void {
  // Soma cada alteração de pontos/horas ao período em curso.
  const stopListener = onMovPointsLogged((entry) => {
    if (!entry.targetUserId || entry.amount == null) return
    const tag = entry.targetTag ?? entry.targetUserId
    if (entry.action === 'add_points') store.addPeriodStats(entry.guildId, entry.targetUserId, tag, entry.amount, 0)
    else if (entry.action === 'remove_points') store.addPeriodStats(entry.guildId, entry.targetUserId, tag, -entry.amount, 0)
    else if (entry.action === 'add_hours') store.addPeriodStats(entry.guildId, entry.targetUserId, tag, 0, entry.amount)
    else if (entry.action === 'remove_hours') store.addPeriodStats(entry.guildId, entry.targetUserId, tag, 0, -entry.amount)
  })

  let running = false
  const tick = async () => {
    if (running || !client.isReady()) return
    running = true
    try {
      for (const guildId of store.listReportGuilds()) {
        const guild = client.guilds.cache.get(guildId)
        if (!guild) continue
        const settings = store.getWeeklyReportSettings(guildId)
        const p = zonedParts(new Date(), safeZone(settings.timezone))
        const due = p.weekday === settings.dayOfWeek && p.hour * 60 + p.minute >= settings.hour * 60 + settings.minute
        if (!due || store.getReportPeriod(guildId).lastSentSlot === p.day) continue
        await sendWeeklyReport(guild, p.day).catch((err) => console.error(`[relatório semanal] ${guildId}:`, errText(err)))
      }
    } finally {
      running = false
    }
  }
  const interval = setInterval(() => void tick(), TICK_MS)
  void tick()
  return () => {
    clearInterval(interval)
    stopListener()
  }
}

export async function handleWeeklyReportButtons(interaction: Interaction): Promise<boolean> {
  if (!interaction.isButton() || interaction.customId !== COPY_ID || !interaction.guild) return false
  const text = lastReportText.get(interaction.guild.id)
  if (!text) {
    await interaction.reply({ content: 'ℹ️ O texto deste relatório já não está disponível (o bot reiniciou). Usa a app para ver o relatório atual.', flags: MessageFlags.Ephemeral })
    return true
  }
  const block = `\`\`\`\n${text.replace(/```/g, 'ˋˋˋ').slice(0, 1900)}\n\`\`\``
  await interaction.reply({ content: block, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })
  return true
}

// ==========================================================================
// App
// ==========================================================================

export function getWeeklyReportState(guildId: string): WeeklyReportState {
  const settings = store.getWeeklyReportSettings(guildId)
  const period = store.getReportPeriod(guildId)
  return { settings, lastSentAt: period.lastSentAt, periodStart: period.periodStart, nextAt: nextReportAt(settings)?.toISOString() ?? null }
}

export async function applyWeeklyReportSettings(guild: Guild, input: WeeklyReportSettings): Promise<WeeklyReportState> {
  const d = defaultWeeklyReportSettings()
  const num = (v: unknown, min: number, max: number, fb: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fb
  }
  const style = (v: unknown, fb: VerificationButtonStyle): VerificationButtonStyle => (v === 'success' || v === 'primary' || v === 'secondary' || v === 'danger' ? v : fb)
  const txt = (v: unknown, max: number, fb: string) => (typeof v === 'string' ? v.slice(0, max).trim() || fb : fb)
  await guild.roles.fetch().catch(() => undefined)
  const next: WeeklyReportSettings = {
    ...d,
    ...input,
    enabled: Boolean(input.enabled),
    dayOfWeek: num(input.dayOfWeek, 0, 6, d.dayOfWeek),
    hour: num(input.hour, 0, 23, d.hour),
    minute: num(input.minute, 0, 59, d.minute),
    timezone: safeZone(String(input.timezone || d.timezone)),
    roleIds: [...new Set(input.roleIds ?? [])].filter((id) => guild.roles.cache.has(id)),
    mentionRoleId: input.mentionRoleId && guild.roles.cache.has(input.mentionRoleId) ? input.mentionRoleId : null,
    topCount: num(input.topCount, 1, 25, d.topCount),
    topLineFormat: txt(input.topLineFormat, 300, d.topLineFormat),
    inactiveMaxHours: Math.max(0, Math.min(168, Number(input.inactiveMaxHours) || 0)),
    inactiveMaxPoints: num(input.inactiveMaxPoints, 0, 100_000, 0),
    inactiveLineFormat: txt(input.inactiveLineFormat, 300, d.inactiveLineFormat),
    inactiveLimit: num(input.inactiveLimit, 1, 100, d.inactiveLimit),
    readyLineFormat: txt(input.readyLineFormat, 300, d.readyLineFormat),
    emptyText: txt(input.emptyText, 300, d.emptyText),
    copyButton: { show: input.copyButton?.show !== false, label: txt(input.copyButton?.label, 80, d.copyButton.label), emoji: (input.copyButton?.emoji ?? '').trim(), style: style(input.copyButton?.style, d.copyButton.style) },
    rankingButton: { show: input.rankingButton?.show !== false, label: txt(input.rankingButton?.label, 80, d.rankingButton.label), emoji: (input.rankingButton?.emoji ?? '').trim(), style: style(input.rankingButton?.style, d.rankingButton.style) },
    linkButton: { show: Boolean(input.linkButton?.show), label: txt(input.linkButton?.label, 80, d.linkButton.label), emoji: (input.linkButton?.emoji ?? '').trim(), url: (input.linkButton?.url ?? '').trim() },
  }
  if (next.linkButton.show && !/^https?:\/\/\S+$/i.test(next.linkButton.url)) throw new Error('O botão de link precisa de um URL que comece por https://')
  if (next.channelId) {
    const channel = await guild.channels.fetch(next.channelId).catch(() => null)
    if (!channel || !channel.isTextBased() || channel.isThread()) throw new Error('O canal do relatório tem de ser um canal de texto.')
    const me = guild.members.me ?? (await guild.members.fetchMe())
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      throw new Error(`O bot não consegue enviar mensagens em #${channel.name}.`)
    }
    next.channelName = channel.name
  } else {
    next.channelName = null
    if (next.enabled) throw new Error('Escolhe o canal onde o relatório vai ser publicado.')
  }
  store.saveWeeklyReportSettings(guild.id, next)
  return getWeeklyReportState(guild.id)
}

export async function applyWeeklyReportAction(guild: Guild, action: WeeklyReportAction): Promise<WeeklyReportState> {
  if (action.kind === 'preview') return { ...getWeeklyReportState(guild.id), preview: await buildReportPlaceholders(guild) }
  if (action.kind === 'send') {
    await sendWeeklyReport(guild, null)
    return { ...getWeeklyReportState(guild.id), message: 'Relatório publicado — começou um período novo.' }
  }
  if (action.kind === 'resetPeriod') {
    store.resetPeriod(guild.id, null)
    return { ...getWeeklyReportState(guild.id), message: 'Período recomeçado a partir de agora.' }
  }
  throw new Error('Ação desconhecida.')
}
