import {
  ActionRowBuilder,
  type ButtonBuilder,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Message,
  type MessageCreateOptions,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js'
import type { CustomButton, Giveaway, GiveawayAction, GiveawayMessage, GiveawaySettings, GiveawayState, VerificationButtonStyle } from '../../shared/types'
import { defaultGiveawaySettings, fillGiveaway } from '../../shared/giveaways'
import * as store from '../store/giveaways'
import { getTemplate } from '../store/embedTemplates'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { customButton } from './profileCommand'

// Sorteios: participa-se por botão (com o número de participantes no próprio botão) ou por reação.
// Tudo vem da app: cada mensagem (início, fim, vencedores, reroll, sem participantes, DM ao vencedor)
// pode ir em embed personalizável ou só em texto, os botões têm texto/emoji/cor próprios e as respostas
// a quem clica também se escrevem na app.

const BTN = { join: 'gw:join:', list: 'gw:list:', reroll: 'gw:reroll:' } as const
/** Botão de reroll dos sorteios antigos — continua a funcionar. */
const LEGACY_REROLL = 'giveaway:reroll:'
const MIN_DURATION_MS = 30_000
const MAX_DURATION_MS = 30 * 86_400_000
const MAX_LIST = 60

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const editTimers = new Map<string, ReturnType<typeof setTimeout>>()

type TemplateKind = 'giveawayStart' | 'giveawayEnded' | 'giveawayWinners' | 'giveawayReroll' | 'giveawayNoEntrants' | 'giveawayWinnerDm'

function link(g: Giveaway): string {
  return g.messageId ? `https://discord.com/channels/${g.guildId}/${g.channelId}/${g.messageId}` : 'https://discord.com'
}

export function giveawayValues(guild: Guild, g: Giveaway, settings: GiveawaySettings, extra: Record<string, string> = {}): Record<string, string> {
  const unix = Math.floor(new Date(g.endsAt).getTime() / 1000)
  return {
    premio: g.prize,
    descricao: g.description ?? '',
    vencedores: String(g.winnerCount),
    ganhadores: g.winnerIds?.length ? g.winnerIds.map((id) => `<@${id}>`).join(', ') : g.winners.length ? g.winners.join(', ') : '—',
    participantes: String(g.entrants?.length ?? 0),
    termina: `<t:${unix}:R>`,
    terminaData: `<t:${unix}:f>`,
    criador: g.hostTag ?? '—',
    emoji: (g.entryMode ?? 'reaction') === 'reaction' ? settings.reactionEmoji || '🎉' : settings.joinButton.emoji || '🎉',
    link: link(g),
    servidor: guild.name,
    cargos: settings.requiredRoleIds.map((id) => `<@&${id}>`).join(', ') || '—',
    ...extra,
  }
}

/** Monta uma mensagem do sorteio: o texto por cima e, se ligado, o embed do modelo. */
function buildMessage(guild: Guild, kind: TemplateKind, msg: GiveawayMessage, values: Record<string, string>, fallback: string): Pick<MessageCreateOptions, 'content' | 'embeds'> {
  const content = fillGiveaway(msg.content, values).trim().slice(0, 2000)
  if (msg.embed) {
    const embed = buildEmbedFromDraft(getTemplate(guild.id, kind), values)
    if (embedHasContent(embed)) return { content: content || undefined, embeds: [embed] }
  }
  return { content: content || fallback.slice(0, 2000), embeds: [] }
}

function button(id: string, b: CustomButton, fallback: string, values: Record<string, string>, withEmoji: boolean): ButtonBuilder {
  return customButton(id, { ...b, label: fillGiveaway(b.label, values) }, fallback, withEmoji)
}

function startRows(g: Giveaway, settings: GiveawaySettings, values: Record<string, string>, withEmoji: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const buttons: ButtonBuilder[] = []
  if (!g.ended && (g.entryMode ?? 'reaction') === 'button') buttons.push(button(`${BTN.join}${g.id}`, { ...settings.joinButton, show: true }, 'Participar', values, withEmoji))
  if (settings.participantsButton.show) buttons.push(button(`${BTN.list}${g.id}`, settings.participantsButton, 'Participantes', values, withEmoji))
  return buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : []
}

function rerollRows(g: Giveaway, settings: GiveawaySettings, values: Record<string, string>, withEmoji: boolean): ActionRowBuilder<ButtonBuilder>[] {
  if (!settings.rerollButton.show) return []
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(button(`${BTN.reroll}${g.id}`, settings.rerollButton, 'Rerolar', values, withEmoji))]
}

/** Envia (ou edita) tentando primeiro com emojis e, se a Discord recusar um emoji, sem eles. */
async function withEmojiFallback<T>(run: (withEmoji: boolean) => Promise<T>): Promise<T> {
  try {
    return await run(true)
  } catch (err) {
    if (/emoji/i.test(errText(err))) return run(false)
    throw err
  }
}

async function textChannelOf(guild: Guild, channelId: string) {
  const channel = await guild.channels.fetch(channelId).catch(() => null)
  if (!channel || !channel.isTextBased()) throw new Error('O canal do sorteio já não existe (ou não aceita mensagens).')
  return channel
}

function startPayload(guild: Guild, g: Giveaway, settings: GiveawaySettings, withEmoji: boolean) {
  const values = giveawayValues(guild, g, settings)
  const body = buildMessage(guild, 'giveawayStart', settings.start, values, `🎉 **${g.prize}** — ${g.winnerCount} vencedor(es), termina ${values.termina}.`)
  const mention = settings.mentionRoleId ? `<@&${settings.mentionRoleId}>` : ''
  const content = [mention, body.content].filter(Boolean).join(' ').slice(0, 2000) || undefined
  return {
    content,
    embeds: body.embeds,
    components: startRows(g, settings, values, withEmoji),
    allowedMentions: { roles: settings.mentionRoleId ? [settings.mentionRoleId] : [], users: [] },
  }
}

function endedPayload(guild: Guild, g: Giveaway, settings: GiveawaySettings, withEmoji: boolean, participants: number) {
  const values = giveawayValues(guild, g, settings, { participantes: String(participants) })
  const body = buildMessage(guild, 'giveawayEnded', settings.ended, values, `🎊 Sorteio de **${g.prize}** terminado — vencedor(es): ${values.ganhadores}`)
  return { content: body.content ?? '', embeds: body.embeds, components: startRows(g, settings, values, withEmoji), allowedMentions: { parse: [] as [] } }
}

/** Atualiza a mensagem do sorteio (ex.: o número no botão), juntando vários cliques seguidos numa só edição. */
function scheduleStartEdit(guild: Guild, id: string): void {
  if (editTimers.has(id)) return
  editTimers.set(
    id,
    setTimeout(async () => {
      editTimers.delete(id)
      const g = store.getGiveaway(id)
      if (!g?.messageId || g.ended) return
      const settings = store.getGiveawaySettings(guild.id)
      const channel = await textChannelOf(guild, g.channelId).catch(() => null)
      const message = await channel?.messages.fetch(g.messageId).catch(() => null)
      if (!message) return
      await withEmojiFallback((e) => message.edit(startPayload(guild, g, settings, e))).catch((err) => console.error('[sorteio] editar:', errText(err)))
    }, 1500),
  )
}

// ==========================================================================
// Criar · terminar · reroll
// ==========================================================================

export interface NewGiveawayInput {
  channelId: string
  prize: string
  description: string
  durationMs: number
  winnerCount: number
  hostTag: string
}

export async function createAndPostGiveaway(guild: Guild, input: NewGiveawayInput): Promise<Giveaway> {
  const prize = input.prize.trim().slice(0, 200)
  if (!prize) throw new Error('Escreve o prémio do sorteio.')
  if (!Number.isFinite(input.durationMs) || input.durationMs < MIN_DURATION_MS || input.durationMs > MAX_DURATION_MS) {
    throw new Error('A duração tem de ser entre 30 segundos e 30 dias.')
  }
  const winnerCount = Math.round(input.winnerCount)
  if (!Number.isFinite(winnerCount) || winnerCount < 1 || winnerCount > 50) throw new Error('O número de vencedores tem de ser entre 1 e 50.')

  const settings = store.getGiveawaySettings(guild.id)
  const channel = await textChannelOf(guild, input.channelId)
  const channelName = 'name' in channel && channel.name ? channel.name : 'canal'
  const g = store.createGiveaway({
    guildId: guild.id,
    guildName: guild.name,
    channelId: channel.id,
    channelName,
    messageId: null,
    prize,
    description: input.description.trim().slice(0, 1500),
    winnerCount,
    endsAt: new Date(Date.now() + input.durationMs).toISOString(),
    entryMode: settings.entryMode,
    entrants: [],
    winnerIds: [],
    pastWinnerIds: [],
    hostTag: input.hostTag,
    resultMessageId: null,
  })
  try {
    const message = await withEmojiFallback((e) => channel.send(startPayload(guild, g, settings, e)))
    if (settings.entryMode === 'reaction') await message.react(settings.reactionEmoji || '🎉').catch(() => message.react('🎉'))
    return store.updateGiveaway(g.id, (x) => (x.messageId = message.id)) ?? g
  } catch (err) {
    store.deleteGiveaway(g.id)
    throw new Error(`Não consegui publicar o sorteio em #${channelName}: ${errText(err)}`)
  }
}

function findReaction(message: Message, emoji: string) {
  const custom = emoji.match(/^<a?:\w+:(\d+)>$/)
  return message.reactions.cache.find((r) => (custom ? r.emoji.id === custom[1] : r.emoji.name === emoji)) ?? message.reactions.cache.find((r) => r.emoji.name === '🎉')
}

/** Todos os IDs que reagiram (sem bots), página a página. */
async function reactionEntrants(message: Message, emoji: string): Promise<string[]> {
  const reaction = findReaction(message, emoji)
  if (!reaction) return []
  const ids: string[] = []
  let after: string | undefined
  for (let page = 0; page < 50; page++) {
    const users = await reaction.users.fetch({ limit: 100, after })
    for (const u of users.values()) if (!u.bot) ids.push(u.id)
    if (users.size < 100) break
    after = users.last()?.id
  }
  return ids
}

async function entrantsOf(guild: Guild, g: Giveaway, settings: GiveawaySettings): Promise<{ ids: string[]; message: Message | null }> {
  const channel = await textChannelOf(guild, g.channelId)
  const message = g.messageId ? await channel.messages.fetch(g.messageId).catch(() => null) : null
  if ((g.entryMode ?? 'reaction') === 'button') return { ids: [...new Set(g.entrants ?? [])], message }
  // Reação: depois de terminar, a lista fica guardada (quem reagir mais tarde não conta para o reroll).
  if (g.ended && g.entrants?.length) return { ids: g.entrants, message }
  if (!message) throw new Error('A mensagem do sorteio foi apagada — não dá para ver quem reagiu.')
  return { ids: await reactionEntrants(message, settings.reactionEmoji || '🎉'), message }
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Sorteia `count` pessoas que ainda estão no servidor (e têm os cargos exigidos). */
async function pickWinners(guild: Guild, ids: string[], count: number, settings: GiveawaySettings): Promise<GuildMember[]> {
  const winners: GuildMember[] = []
  for (const id of shuffle(ids)) {
    if (winners.length >= count) break
    const m = await guild.members.fetch(id).catch(() => null)
    if (!m || m.user.bot) continue
    if (settings.requiredRoleIds.length && !settings.requiredRoleIds.some((r) => m.roles.cache.has(r))) continue
    winners.push(m)
  }
  return winners
}

async function dmWinners(guild: Guild, g: Giveaway, settings: GiveawaySettings, winners: GuildMember[]): Promise<void> {
  if (!settings.dmWinners) return
  const values = giveawayValues(guild, g, settings)
  const body = buildMessage(guild, 'giveawayWinnerDm', settings.winnerDm, values, `🎉 Ganhaste **${g.prize}** em **${guild.name}**! ${values.link}`)
  for (const m of winners) await m.send({ ...body, allowedMentions: { parse: [] } }).catch(() => undefined)
}

/** Termina o sorteio: escolhe os vencedores, edita a mensagem original e anuncia. */
export async function concludeGiveaway(guild: Guild, giveaway: Giveaway): Promise<Giveaway> {
  const settings = store.getGiveawaySettings(guild.id)
  const { ids, message } = await entrantsOf(guild, giveaway, settings)
  const winners = await pickWinners(guild, ids, giveaway.winnerCount, settings)
  const concluded = store.markConcluded(
    giveaway.id,
    winners.map((w) => w.displayName),
    winners.map((w) => w.id),
  )
  if (!concluded) throw new Error('O sorteio foi apagado entretanto.')
  const g = store.updateGiveaway(concluded.id, (x) => (x.entrants = ids)) ?? concluded

  if (message) await withEmojiFallback((e) => message.edit(endedPayload(guild, g, settings, e, ids.length))).catch((err) => console.error('[sorteio] editar fim:', errText(err)))

  const channel = await textChannelOf(guild, g.channelId)
  const values = giveawayValues(guild, g, settings)
  const reply = message ? { reply: { messageReference: message.id, failIfNotExists: false } } : {}
  if (winners.length === 0) {
    const body = buildMessage(guild, 'giveawayNoEntrants', settings.noEntrants, values, `😕 Ninguém participou no sorteio de **${g.prize}**.`)
    await channel.send({ ...body, ...reply, allowedMentions: { parse: [] } })
    return g
  }
  const body = buildMessage(guild, 'giveawayWinners', settings.winners, values, `🎉 Parabéns ${values.ganhadores}! Ganharam **${g.prize}**!`)
  const sent = await withEmojiFallback((e) =>
    channel.send({ ...body, ...reply, components: rerollRows(g, settings, values, e), allowedMentions: { users: winners.map((w) => w.id), repliedUser: false } }),
  )
  store.updateGiveaway(g.id, (x) => (x.resultMessageId = sent.id))
  await dmWinners(guild, g, settings, winners)
  return store.getGiveaway(g.id) ?? g
}

/** Novo(s) vencedor(es), sem repetir quem já ganhou. Devolve null se não houver ninguém elegível. */
export async function rerollGiveaway(guild: Guild, giveaway: Giveaway): Promise<Giveaway | null> {
  if (!giveaway.ended) throw new Error('Este sorteio ainda não terminou.')
  const settings = store.getGiveawaySettings(guild.id)
  const { ids } = await entrantsOf(guild, giveaway, settings)
  const exclude = new Set([...(giveaway.pastWinnerIds ?? []), ...(giveaway.winnerIds ?? [])])
  // Sorteios antigos só guardavam o nome de quem ganhou — exclui também por nome.
  const legacyNames = giveaway.pastWinnerIds ? new Set<string>() : new Set(giveaway.winners)
  const pool: string[] = []
  for (const id of ids) {
    if (exclude.has(id)) continue
    if (legacyNames.size) {
      const user = await guild.client.users.fetch(id).catch(() => null)
      if (user && legacyNames.has(user.tag)) continue
    }
    pool.push(id)
  }
  const winners = await pickWinners(guild, pool, giveaway.winnerCount, settings)
  if (winners.length === 0) return null
  const g = store.markConcluded(
    giveaway.id,
    winners.map((w) => w.displayName),
    winners.map((w) => w.id),
  )
  if (!g) throw new Error('O sorteio foi apagado entretanto.')

  const channel = await textChannelOf(guild, g.channelId)
  const values = giveawayValues(guild, g, settings, { participantes: String(ids.length) })
  const body = buildMessage(guild, 'giveawayReroll', settings.reroll, values, `🔁 Reroll de **${g.prize}**: ${values.ganhadores} 🎉`)
  const reply = g.messageId ? { reply: { messageReference: g.messageId, failIfNotExists: false } } : {}
  await withEmojiFallback((e) =>
    channel.send({ ...body, ...reply, components: rerollRows(g, settings, values, e), allowedMentions: { users: winners.map((w) => w.id), repliedUser: false } }),
  )
  // A mensagem original passa a mostrar os vencedores novos.
  if (g.messageId) {
    const message = await channel.messages.fetch(g.messageId).catch(() => null)
    if (message) await withEmojiFallback((e) => message.edit(endedPayload(guild, g, settings, e, ids.length))).catch(() => undefined)
  }
  await dmWinners(guild, g, settings, winners)
  return g
}

// ==========================================================================
// Botões
// ==========================================================================

function canManage(interaction: ButtonInteraction, settings: GiveawaySettings): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true
  const roles = interaction.member && 'cache' in interaction.member.roles ? interaction.member.roles.cache : null
  return Boolean(roles && settings.managerRoleIds.some((id) => roles.has(id)))
}

export async function handleGiveawayButtons(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId
  const kind = id.startsWith(BTN.join) ? 'join' : id.startsWith(BTN.list) ? 'list' : id.startsWith(BTN.reroll) || id.startsWith(LEGACY_REROLL) ? 'reroll' : null
  if (!kind) return false
  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este botão só funciona dentro de um servidor.', flags: MessageFlags.Ephemeral })
    return true
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const say = (text: string) => interaction.editReply({ content: text.slice(0, 2000), allowedMentions: { parse: [] } })
  const g = store.getGiveaway(id.slice(id.lastIndexOf(':') + 1))
  if (!g) {
    await say('❌ Já não encontro este sorteio (pode ter sido apagado na app).')
    return true
  }
  const settings = store.getGiveawaySettings(guild.id)
  const values = (x: Giveaway = g) => giveawayValues(guild, x, settings)

  if (kind === 'join') {
    if (g.ended || new Date(g.endsAt).getTime() <= Date.now()) {
      await say(fillGiveaway(settings.replyEnded, values()))
      return true
    }
    if (settings.requiredRoleIds.length) {
      const member = await guild.members.fetch(interaction.user.id).catch(() => null)
      if (!member || !settings.requiredRoleIds.some((r) => member.roles.cache.has(r))) {
        await say(fillGiveaway(settings.replyNoRole, values()))
        return true
      }
    }
    let result = 'joined' as 'joined' | 'left' | 'already'
    const updated = store.updateGiveaway(g.id, (x) => {
      const list = x.entrants ?? []
      if (!list.includes(interaction.user.id)) x.entrants = [...list, interaction.user.id]
      else if (settings.allowLeave) {
        x.entrants = list.filter((u) => u !== interaction.user.id)
        result = 'left'
      } else result = 'already'
    })
    const reply = result === 'joined' ? settings.replyJoined : result === 'left' ? settings.replyLeft : settings.replyAlready
    await say(fillGiveaway(reply, values(updated ?? g)))
    if (result !== 'already') scheduleStartEdit(guild, g.id)
    return true
  }

  if (kind === 'list') {
    const ids = !g.ended && g.entryMode !== 'button' ? await entrantsOf(guild, g, settings).then((r) => r.ids).catch(() => g.entrants ?? []) : (g.entrants ?? [])
    if (ids.length === 0) {
      await say(fillGiveaway(settings.replyNoParticipants, values()))
      return true
    }
    const lines = ids.slice(0, MAX_LIST).map((u, i) => fillGiveaway(settings.participantLine, { posicao: String(i + 1), membro: `<@${u}>` }))
    const more = ids.length > MAX_LIST ? `\n-# … e mais ${ids.length - MAX_LIST}` : ''
    await say(`**${g.prize}** · ${ids.length} participante(s)\n\n${lines.join('\n')}${more}`)
    return true
  }

  // reroll
  if (!canManage(interaction, settings)) {
    await say(fillGiveaway(settings.replyNoPermission, values()))
    return true
  }
  if (!g.ended) {
    await say('❌ Este sorteio ainda não terminou — espera que termine antes de rerolar.')
    return true
  }
  try {
    const rerolled = await rerollGiveaway(guild, g)
    await say(fillGiveaway(rerolled ? settings.replyRerollDone : settings.replyRerollEmpty, values(rerolled ?? g)))
  } catch (err) {
    await say(`❌ Não consegui fazer o reroll: ${errText(err)}`)
  }
  return true
}

// ==========================================================================
// App
// ==========================================================================

export function getGiveawayState(guildId: string): GiveawayState {
  return { settings: store.getGiveawaySettings(guildId), giveaways: store.listGiveaways().filter((g) => g.guildId === guildId) }
}

export async function applyGiveawaySettings(guild: Guild, input: GiveawaySettings): Promise<GiveawayState> {
  const d = defaultGiveawaySettings()
  await guild.roles.fetch().catch(() => undefined)
  const style = (v: unknown, fb: VerificationButtonStyle): VerificationButtonStyle =>
    v === 'success' || v === 'primary' || v === 'secondary' || v === 'danger' ? v : fb
  const txt = (v: unknown, max: number, fb: string) => (typeof v === 'string' ? v.slice(0, max).trim() || fb : fb)
  const btn = (b: CustomButton | undefined, fb: CustomButton): CustomButton => ({
    show: b?.show !== false,
    label: txt(b?.label, 80, fb.label),
    emoji: (b?.emoji ?? '').trim().slice(0, 100),
    style: style(b?.style, fb.style),
  })
  // O texto por cima do embed pode ficar vazio de propósito.
  const msg = (m: GiveawayMessage | undefined, fb: GiveawayMessage): GiveawayMessage => ({
    embed: m ? Boolean(m.embed) : fb.embed,
    content: typeof m?.content === 'string' ? m.content.slice(0, 1800) : fb.content,
  })
  const roles = (ids: unknown) => [...new Set(Array.isArray(ids) ? ids : [])].filter((id): id is string => typeof id === 'string' && guild.roles.cache.has(id)).slice(0, 25)
  const next: GiveawaySettings = {
    entryMode: input.entryMode === 'reaction' ? 'reaction' : 'button',
    reactionEmoji: txt(input.reactionEmoji, 100, d.reactionEmoji),
    joinButton: btn(input.joinButton, d.joinButton),
    participantsButton: btn(input.participantsButton, d.participantsButton),
    rerollButton: btn(input.rerollButton, d.rerollButton),
    requiredRoleIds: roles(input.requiredRoleIds),
    managerRoleIds: roles(input.managerRoleIds),
    mentionRoleId: input.mentionRoleId && guild.roles.cache.has(input.mentionRoleId) ? input.mentionRoleId : null,
    allowLeave: input.allowLeave !== false,
    dmWinners: Boolean(input.dmWinners),
    start: msg(input.start, d.start),
    ended: msg(input.ended, d.ended),
    winners: msg(input.winners, d.winners),
    reroll: msg(input.reroll, d.reroll),
    noEntrants: msg(input.noEntrants, d.noEntrants),
    winnerDm: msg(input.winnerDm, d.winnerDm),
    participantLine: txt(input.participantLine, 200, d.participantLine),
    replyJoined: txt(input.replyJoined, 500, d.replyJoined),
    replyLeft: txt(input.replyLeft, 500, d.replyLeft),
    replyAlready: txt(input.replyAlready, 500, d.replyAlready),
    replyEnded: txt(input.replyEnded, 500, d.replyEnded),
    replyNoRole: txt(input.replyNoRole, 500, d.replyNoRole),
    replyNoPermission: txt(input.replyNoPermission, 500, d.replyNoPermission),
    replyRerollDone: txt(input.replyRerollDone, 500, d.replyRerollDone),
    replyRerollEmpty: txt(input.replyRerollEmpty, 500, d.replyRerollEmpty),
    replyNoParticipants: txt(input.replyNoParticipants, 500, d.replyNoParticipants),
  }
  store.saveGiveawaySettings(guild.id, next)
  // Os sorteios a decorrer passam a mostrar os botões/textos novos.
  for (const g of store.listGiveaways().filter((x) => x.guildId === guild.id && !x.ended)) scheduleStartEdit(guild, g.id)
  return getGiveawayState(guild.id)
}

export async function applyGiveawayAction(guild: Guild, action: GiveawayAction): Promise<GiveawayState> {
  if (action.kind === 'create') {
    const g = await createAndPostGiveaway(guild, {
      channelId: action.channelId,
      prize: action.prize,
      description: action.description ?? '',
      durationMs: action.durationMs,
      winnerCount: action.winnerCount,
      hostTag: action.actor ? `${action.actor} (app)` : 'App',
    })
    return { ...getGiveawayState(guild.id), message: `Sorteio "${g.prize}" publicado em #${g.channelName}.` }
  }
  const g = store.getGiveaway(action.id)
  if (!g || g.guildId !== guild.id) throw new Error('Esse sorteio já não existe.')
  if (action.kind === 'end') {
    if (g.ended) return { ...getGiveawayState(guild.id), message: 'Esse sorteio já tinha terminado.' }
    const done = await concludeGiveaway(guild, g)
    return { ...getGiveawayState(guild.id), message: done.winners.length ? `Terminado — vencedor(es): ${done.winners.join(', ')}.` : 'Terminado — ninguém participou.' }
  }
  if (action.kind === 'reroll') {
    const r = await rerollGiveaway(guild, g)
    return { ...getGiveawayState(guild.id), message: r ? `Reroll feito — novo(s) vencedor(es): ${r.winners.join(', ')}.` : 'Não há mais participantes que ainda não tenham ganho.' }
  }
  if (action.kind === 'delete') {
    if (g.messageId && !g.ended) {
      const channel = await guild.channels.fetch(g.channelId).catch(() => null)
      if (channel?.isTextBased()) await channel.messages.delete(g.messageId).catch(() => undefined)
    }
    store.deleteGiveaway(g.id)
    return { ...getGiveawayState(guild.id), message: `Sorteio "${g.prize}" apagado.` }
  }
  throw new Error('Ação desconhecida.')
}
