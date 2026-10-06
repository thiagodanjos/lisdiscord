import {
  ActionRowBuilder,
  type ButtonBuilder,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Interaction,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js'
import type { Activity, ActivityCover, ActivityMessageRef, CalendarSettings } from '../../shared/types'
import { activityEnd, activityPlaceholders, categoryOf, fillTokens } from '../../shared/calendar'
import * as store from '../store/activities'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { embedToContainer, textLine } from './componentsV2'
import { customButton } from './profileCommand'
import { postActivityMessage, scheduleBoard } from './activities'

// Dono da mov + supervisores: antes de começar, o bot pergunta por DM ao dono se vai conseguir. Se ele
// disser que não (ou não responder a tempo, ou a mov não tiver dono), o bot manda DM a todos os
// supervisores — e, se escolhido, uma mensagem geral num canal. O primeiro que carregar "Eu assumo"
// fica com a mov: todas essas mensagens mudam para "assumida por …" e o cartão da atividade atualiza.

const PREFIX = 'actc:'
type CoverKind = 'ok' | 'no' | 'take'
type Template = 'activityOwnerAsk' | 'activityOwnerConfirmed' | 'activityOwnerDeclined' | 'activityCoverCall' | 'activityCoverTaken' | 'activityCoverUncovered'

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const busy = new Set<string>()

function hexToInt(hex: string): number | null {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return Number.isFinite(n) ? n : null
}

function reasonText(settings: CalendarSettings, reason: ActivityCover['reason']): string {
  if (reason === 'declined') return settings.coverReasonDeclined
  if (reason === 'noAnswer') return settings.coverReasonNoAnswer
  if (reason === 'noOwner') return settings.coverReasonNoOwner
  if (reason === 'manual') return settings.coverReasonManual
  return ''
}

export function coverValues(guild: Guild, settings: CalendarSettings, a: Activity): Record<string, string> {
  const c = a.cover
  const ownerId = c?.ownerId ?? a.responsibleId
  const link = a.messageId && settings.channelId ? `https://discord.com/channels/${guild.id}/${settings.channelId}/${a.messageId}` : 'https://discord.com'
  return {
    ...activityPlaceholders(settings, a, 'discord', guild.name),
    dono: ownerId ? `<@${ownerId}>` : '—',
    supervisor: c?.coveredBy ? `<@${c.coveredBy.userId}>` : '—',
    supervisores: settings.supervisorRoleIds.map((id) => `<@&${id}>`).join(' ') || '—',
    motivo: reasonText(settings, c?.reason ?? null),
    link,
  }
}

function payload(guild: Guild, settings: CalendarSettings, a: Activity, kind: Template, buttons: ButtonBuilder[], fallback: string, mention = '') {
  const values = coverValues(guild, settings, a)
  let embed = buildEmbedFromDraft(getTemplate(guild.id, kind), values, { separators: 'keep' })
  if (!embedHasContent(embed)) embed = embed.setDescription(fallback)
  const color = hexToInt(categoryOf(settings, a.categoryId).color)
  if (color !== null && !getTemplate(guild.id, kind).color.trim()) embed.setColor(color)
  const rows = buttons.length ? [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons)] : []
  const box = embedToContainer(embed, rows)
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: mention ? [textLine(mention), box] : [box],
    allowedMentions: mention ? { roles: settings.supervisorRoleIds } : { parse: [] as [] },
  }
}

const id = (kind: CoverKind, a: Activity) => `${PREFIX}${kind}:${a.guildId}:${a.id}`

function ownerButtons(settings: CalendarSettings, a: Activity, withEmoji: boolean): ButtonBuilder[] {
  const out: ButtonBuilder[] = []
  if (settings.ownerConfirmButton.show) out.push(customButton(id('ok', a), settings.ownerConfirmButton, 'Vou fazer', withEmoji))
  if (settings.ownerDeclineButton.show) out.push(customButton(id('no', a), settings.ownerDeclineButton, 'Não vou conseguir', withEmoji))
  // Sem nenhum botão o dono não tinha como responder — o "não" fica sempre.
  if (out.length === 0) out.push(customButton(id('no', a), { ...settings.ownerDeclineButton, show: true }, 'Não vou conseguir', withEmoji))
  return out
}

function takeButton(settings: CalendarSettings, a: Activity, withEmoji: boolean): ButtonBuilder[] {
  return [customButton(id('take', a), { ...settings.supervisorTakeButton, show: true }, 'Eu assumo', withEmoji)]
}

async function sendWithFallback<T>(run: (withEmoji: boolean) => Promise<T>): Promise<T> {
  try {
    return await run(true)
  } catch (err) {
    if (/emoji/i.test(errText(err))) return run(false)
    throw err
  }
}

async function dm(guild: Guild, userId: string, build: (withEmoji: boolean) => ReturnType<typeof payload>): Promise<ActivityMessageRef | null> {
  const user = await guild.client.users.fetch(userId).catch(() => null)
  if (!user) return null
  const sent = await sendWithFallback((e) => user.send(build(e))).catch(() => null)
  return sent ? { channelId: sent.channelId, messageId: sent.id } : null
}

async function editRef(guild: Guild, ref: ActivityMessageRef, build: (withEmoji: boolean) => ReturnType<typeof payload>): Promise<void> {
  const channel = await guild.client.channels.fetch(ref.channelId).catch(() => null)
  if (!channel?.isTextBased()) return
  const msg = await channel.messages.fetch(ref.messageId).catch(() => null)
  if (msg) await sendWithFallback((e) => msg.edit(build(e))).catch(() => undefined)
}

async function supervisors(guild: Guild, settings: CalendarSettings, exclude: string | null): Promise<GuildMember[]> {
  if (settings.supervisorRoleIds.length === 0) return []
  const all = await guild.members.fetch().catch(() => guild.members.cache)
  return [...all.values()].filter((m) => !m.user.bot && m.id !== exclude && settings.supervisorRoleIds.some((r) => m.roles.cache.has(r)))
}

function inScope(settings: CalendarSettings, a: Activity): boolean {
  return settings.coverCategoryIds.length === 0 || settings.coverCategoryIds.includes(a.categoryId)
}

// ==========================================================================
// Passos
// ==========================================================================

/** DM ao dono: "vais conseguir?". Sem dono (ou DMs fechadas), vai logo para os supervisores. */
export async function askOwner(guild: Guild, settings: CalendarSettings, a: Activity): Promise<void> {
  if (!a.responsibleId) {
    await escalate(guild, settings, a, 'noOwner')
    return
  }
  const cover: ActivityCover = {
    state: 'asked',
    askedAt: new Date().toISOString(),
    ownerId: a.responsibleId,
    ownerTag: a.responsibleTag,
    ownerMessage: null,
    messages: [],
    reason: null,
    escalatedAt: null,
    coveredBy: null,
    notified: 0,
  }
  const withCover = store.updateActivity(guild.id, a.id, (x) => (x.cover = cover)) ?? { ...a, cover }
  const ref = await dm(guild, a.responsibleId, (e) => payload(guild, settings, withCover, 'activityOwnerAsk', ownerButtons(settings, withCover, e), `Vais conseguir fazer **${a.title}**?`))
  if (!ref) {
    await escalate(guild, settings, withCover, 'noAnswer')
    return
  }
  store.updateActivity(guild.id, a.id, (x) => {
    if (x.cover) x.cover.ownerMessage = ref
  })
}

/** DMs aos supervisores (+ mensagem geral) à procura de quem assuma. */
export async function escalate(guild: Guild, settings: CalendarSettings, a: Activity, reason: NonNullable<ActivityCover['reason']>): Promise<number> {
  const now = new Date().toISOString()
  const current = store.updateActivity(guild.id, a.id, (x) => {
    x.cover = {
      state: 'searching',
      askedAt: x.cover?.askedAt ?? now,
      ownerId: x.cover?.ownerId ?? x.responsibleId,
      ownerTag: x.cover?.ownerTag ?? x.responsibleTag,
      ownerMessage: x.cover?.ownerMessage ?? null,
      messages: x.cover?.messages ?? [],
      reason,
      escalatedAt: now,
      coveredBy: null,
      notified: x.cover?.notified ?? 0,
    }
  })
  if (!current?.cover) return 0
  const build = (e: boolean) => payload(guild, settings, current, 'activityCoverCall', takeButton(settings, current, e), `Precisa-se de supervisor para **${current.title}**.`)
  const refs: ActivityMessageRef[] = []
  let notified = 0
  if (settings.coverDmSupervisors) {
    for (const m of await supervisors(guild, settings, current.cover.ownerId)) {
      const ref = await dm(guild, m.id, build)
      if (ref) {
        refs.push(ref)
        notified++
      }
    }
  }
  if (settings.coverChannelId) {
    const channel = await guild.channels.fetch(settings.coverChannelId).catch(() => null)
    if (channel?.isTextBased()) {
      const mention = settings.coverMentionRole ? settings.supervisorRoleIds.map((r) => `<@&${r}>`).join(' ') : ''
      const sent = await sendWithFallback((e) =>
        channel.send(payload(guild, settings, current, 'activityCoverCall', takeButton(settings, current, e), `Precisa-se de supervisor para **${current.title}**.`, mention)),
      ).catch((err) => console.error('[agenda] mensagem geral:', errText(err)))
      if (sent) refs.push({ channelId: sent.channelId, messageId: sent.id })
    }
  }
  // O dono que disse "não" vê a confirmação; se não respondeu, a DM dele fica com os botões.
  if (reason === 'declined' && current.cover.ownerMessage) {
    await editRef(guild, current.cover.ownerMessage, () => payload(guild, settings, current, 'activityOwnerDeclined', [], 'Avisámos os supervisores.'))
  }
  store.updateActivity(guild.id, a.id, (x) => {
    if (!x.cover) return
    x.cover.messages = [...x.cover.messages, ...refs]
    x.cover.notified += notified
  })
  if (refs.length === 0) console.warn(`[agenda] #${a.number}: ninguém para avisar (sem supervisores com DM aberta nem canal geral).`)
  return notified
}

/** Muda todas as mensagens da chamada (DMs + geral) para o mesmo estado. */
async function updateCallMessages(guild: Guild, settings: CalendarSettings, a: Activity, kind: Template, withButton: boolean): Promise<void> {
  for (const ref of a.cover?.messages ?? []) {
    await editRef(guild, ref, (e) => payload(guild, settings, a, kind, withButton ? takeButton(settings, a, e) : [], `**${a.title}**`))
  }
}

/** Chamado a cada minuto pelo ciclo da agenda. */
export async function coverTick(guild: Guild, settings: CalendarSettings, a: Activity, now: number): Promise<void> {
  if (!settings.coverEnabled || a.status !== 'scheduled' || !inScope(settings, a) || busy.has(a.id)) return
  const start = new Date(a.startAt).getTime()
  const c = a.cover
  busy.add(a.id)
  try {
    if (!c) {
      if (now >= start - settings.coverAskMinutes * 60_000 && now < start) await askOwner(guild, settings, a)
      return
    }
    if (c.state === 'asked') {
      const timeout = settings.coverOwnerTimeoutMinutes
      const due = timeout > 0 ? new Date(c.askedAt).getTime() + timeout * 60_000 : start
      if (now >= Math.min(due, start)) await escalate(guild, settings, a, 'noAnswer')
      return
    }
    if (c.state === 'searching' && now >= start && settings.coverAlertAtStart) {
      const updated = store.updateActivity(guild.id, a.id, (x) => {
        if (x.cover?.state === 'searching') x.cover.state = 'uncovered'
      })
      if (updated) await updateCallMessages(guild, settings, updated, 'activityCoverUncovered', true)
    }
  } catch (err) {
    console.error(`[agenda] supervisores #${a.number}:`, errText(err))
  } finally {
    busy.delete(a.id)
  }
}

/** A atividade terminou ou foi cancelada: tira o botão "Eu assumo" das mensagens que ainda o têm. */
export async function closeCover(guild: Guild, a: Activity): Promise<void> {
  const c = a.cover
  if (!c || (c.state !== 'searching' && c.state !== 'uncovered' && c.state !== 'asked')) return
  const settings = store.getCalendarSettings(guild.id)
  if (c.state === 'asked' && c.ownerMessage) {
    await editRef(guild, c.ownerMessage, () => payload(guild, settings, a, 'activityOwnerAsk', [], `**${a.title}**`))
  } else {
    await updateCallMessages(guild, settings, a, 'activityCoverUncovered', false)
  }
}

// ==========================================================================
// Botões (na DM ou na mensagem geral)
// ==========================================================================

export async function handleActivityCoverButtons(interaction: Interaction): Promise<boolean> {
  if (!interaction.isButton() || !interaction.customId.startsWith(PREFIX)) return false
  const [, kind, guildId, activityId] = interaction.customId.split(':') as [string, CoverKind, string, string]
  await handleCover(interaction, kind, guildId, activityId)
  return true
}

async function handleCover(interaction: ButtonInteraction, kind: CoverKind, guildId: string, activityId: string): Promise<void> {
  const guild = interaction.client.guilds.cache.get(guildId)
  const say = (text: string) => interaction.followUp({ content: text.slice(0, 1900), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })
  if (!guild) {
    await interaction.reply({ content: 'ℹ️ O bot já não está nesse servidor.', flags: MessageFlags.Ephemeral })
    return
  }
  const settings = store.getCalendarSettings(guild.id)
  const a = store.getActivity(guild.id, activityId)
  await interaction.deferUpdate()
  const values = (x: Activity) => coverValues(guild, settings, x)
  if (!a || a.status !== 'scheduled' || activityEnd(a) <= Date.now() || !a.cover) {
    await say(fillTokens(settings.replyCoverClosed, a ? values(a) : {}))
    return
  }

  if (kind === 'ok' || kind === 'no') {
    if (interaction.user.id !== a.cover.ownerId) {
      await say(fillTokens(settings.replyNotSupervisor, values(a)))
      return
    }
    if (kind === 'ok') {
      const wasSearching = a.cover.state === 'searching' || a.cover.state === 'uncovered'
      if (a.cover.state === 'covered') {
        await say(fillTokens(settings.replyAlreadyTaken, values(a)))
        return
      }
      const updated = store.updateActivity(guild.id, a.id, (x) => {
        if (x.cover) x.cover.state = 'confirmed'
      })!
      await interaction.editReply(payload(guild, settings, updated, 'activityOwnerConfirmed', [], `✅ Ficas com **${a.title}**.`)).catch(() => undefined)
      // Já tinha ido aos supervisores (não respondeu a tempo): avisa-os que o dono voltou a ficar com ela.
      if (wasSearching) {
        const covered = store.updateActivity(guild.id, a.id, (x) => {
          if (x.cover) x.cover.coveredBy = { userId: interaction.user.id, tag: x.cover.ownerTag ?? interaction.user.username, at: new Date().toISOString() }
        })!
        await updateCallMessages(guild, settings, covered, 'activityCoverTaken', false)
      }
      await say(fillTokens(settings.replyOwnerConfirmed, values(updated)))
      return
    }
    if (a.cover.state !== 'asked' && a.cover.state !== 'confirmed') {
      await say(fillTokens(settings.replyOwnerDeclined, values(a)))
      return
    }
    await escalate(guild, settings, a, 'declined')
    await say(fillTokens(settings.replyOwnerDeclined, values(a)))
    return
  }

  // take
  const member = await guild.members.fetch(interaction.user.id).catch(() => null)
  const isSupervisor = Boolean(
    member && (member.permissions.has(PermissionFlagsBits.Administrator) || settings.supervisorRoleIds.some((r) => member.roles.cache.has(r))),
  )
  if (!isSupervisor) {
    await say(fillTokens(settings.replyNotSupervisor, values(a)))
    return
  }
  let taken = false
  const updated = store.updateActivity(guild.id, a.id, (x) => {
    if (!x.cover || (x.cover.state !== 'searching' && x.cover.state !== 'uncovered')) return
    x.cover.state = 'covered'
    x.cover.coveredBy = { userId: interaction.user.id, tag: member?.displayName ?? interaction.user.username, at: new Date().toISOString() }
    x.responsibleId = interaction.user.id
    x.responsibleTag = member?.displayName ?? interaction.user.username
    taken = true
  })!
  if (!taken) {
    await say(fillTokens(settings.replyAlreadyTaken, values(updated)))
    return
  }
  await updateCallMessages(guild, settings, updated, 'activityCoverTaken', false)
  // Avisa o dono original de quem ficou com a mov.
  if (updated.cover?.ownerId && updated.cover.ownerId !== interaction.user.id) {
    if (updated.cover.ownerMessage) {
      await editRef(guild, updated.cover.ownerMessage, () => payload(guild, settings, updated, 'activityCoverTaken', [], `**${updated.title}** foi assumida.`))
    } else {
      await dm(guild, updated.cover.ownerId, () => payload(guild, settings, updated, 'activityCoverTaken', [], `**${updated.title}** foi assumida.`))
    }
  }
  await postActivityMessage(guild, updated).catch(() => undefined)
  scheduleBoard(guild)
  await say(fillTokens(settings.replyTaken, values(updated)))
}

// ==========================================================================
// App
// ==========================================================================

export async function coverAction(guild: Guild, a: Activity, kind: 'coverAsk' | 'coverEscalate' | 'coverReset'): Promise<string> {
  const settings = store.getCalendarSettings(guild.id)
  if (a.status !== 'scheduled') throw new Error('Essa atividade já não está marcada.')
  if (kind === 'coverReset') {
    await closeCover(guild, a)
    store.updateActivity(guild.id, a.id, (x) => (x.cover = null))
    return `A confirmação de ${a.title} foi reposta — o bot volta a perguntar ao dono na altura certa.`
  }
  if (kind === 'coverAsk') {
    if (!a.responsibleId) throw new Error('Essa atividade não tem dono — usa "Chamar supervisores".')
    await askOwner(guild, settings, a)
    const fresh = store.getActivity(guild.id, a.id)
    return fresh?.cover?.state === 'asked' ? `DM enviada a ${a.responsibleTag ?? 'dono'}.` : 'O dono tem as DMs fechadas — chamei os supervisores.'
  }
  if (settings.supervisorRoleIds.length === 0 && !settings.coverChannelId) throw new Error('Escolhe primeiro os cargos de supervisor (ou um canal geral) nas definições da agenda.')
  const n = await escalate(guild, settings, a, 'manual')
  return `Chamada enviada: ${n} supervisor(es) por DM${settings.coverChannelId ? ' + mensagem geral' : ''}.`
}
