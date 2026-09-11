import type { LisDiscordBridge } from '../../shared/ipc'
import type {
  BackupData,
  BackupSummary,
  ChannelBackup,
  DiffEntry,
  EmojiBackup,
  GameId,
  GameSettings,
  Giveaway,
  GuildSummary,
  MemberSearchResult,
  ModerationLogEntry,
  RestoreProgressEvent,
  RoleBackup,
  ScheduleConfig,
  Transcript,
  TranscriptSummary,
} from '../../shared/types'

const DEMO_GAMES = [
  { id: 'dado' as const, name: 'Dado', command: '/dado', description: 'Lança um dado (padrão 6 lados, configurável).' },
  { id: 'moeda' as const, name: 'Cara ou Coroa', command: '/moeda', description: 'Atira uma moeda ao ar.' },
  { id: 'ppt' as const, name: 'Pedra, Papel ou Tesoura', command: '/ppt', description: 'Joga contra o bot.' },
  { id: 'oitobola' as const, name: 'Bola 8 Mágica', command: '/oitobola', description: 'Faz uma pergunta e recebe uma resposta misteriosa.' },
  { id: 'trivia' as const, name: 'Trivia', command: '/trivia', description: 'Responde a uma pergunta de escolha múltipla contra o relógio.' },
]

// Tudo neste ficheiro é fictício — nomes, servidores, mensagens. Serve para
// navegar a app sem precisar de um bot real ligado (modo demonstração).

function makeRoles(): RoleBackup[] {
  return [
    { id: 'r0', name: '@everyone', color: 0, hoist: false, mentionable: false, position: 0, permissions: ['ViewChannel', 'SendMessages'], isEveryone: true },
    { id: 'r1', name: 'Admin', color: 0xed4245, hoist: true, mentionable: true, position: 5, permissions: ['Administrator'], isEveryone: false },
    { id: 'r2', name: 'Moderador', color: 0x5865f2, hoist: true, mentionable: true, position: 4, permissions: ['ManageMessages', 'KickMembers', 'ManageChannels'], isEveryone: false },
    { id: 'r3', name: 'Membro Verificado', color: 0x3ba55c, hoist: false, mentionable: false, position: 3, permissions: ['ViewChannel', 'SendMessages', 'Connect'], isEveryone: false },
    { id: 'r4', name: 'Bot', color: 0xf0b232, hoist: true, mentionable: false, position: 2, permissions: ['ViewChannel', 'SendMessages', 'EmbedLinks'], isEveryone: false },
  ]
}

function makeChannels(): ChannelBackup[] {
  return [
    { id: 'c0', name: 'Informação', kind: 'category', position: 0, parentName: null, permissionOverwrites: [] },
    { id: 'c1', name: 'regras', kind: 'text', position: 0, parentName: 'Informação', topic: 'Lê antes de participar.', nsfw: false, rateLimitPerUser: 0, permissionOverwrites: [] },
    { id: 'c2', name: 'anúncios', kind: 'announcement', position: 1, parentName: 'Informação', topic: null, nsfw: false, rateLimitPerUser: 0, permissionOverwrites: [] },
    { id: 'c3', name: 'Geral', kind: 'category', position: 1, parentName: null, permissionOverwrites: [] },
    { id: 'c4', name: 'geral', kind: 'text', position: 0, parentName: 'Geral', topic: null, nsfw: false, rateLimitPerUser: 5, permissionOverwrites: [] },
    { id: 'c5', name: 'memes', kind: 'text', position: 1, parentName: 'Geral', topic: null, nsfw: false, rateLimitPerUser: 0, permissionOverwrites: [] },
    { id: 'c6', name: 'Voz', kind: 'category', position: 2, parentName: null, permissionOverwrites: [] },
    { id: 'c7', name: 'Sala Geral', kind: 'voice', position: 0, parentName: 'Voz', bitrate: 64000, userLimit: 0, permissionOverwrites: [] },
    { id: 'c8', name: 'Estúdio', kind: 'stage', position: 1, parentName: 'Voz', permissionOverwrites: [] },
  ]
}

function makeEmojis(): EmojiBackup[] {
  return [
    { id: 'e1', name: 'lis_ok', url: '', animated: false },
    { id: 'e2', name: 'lis_hype', url: '', animated: true },
    { id: 'e3', name: 'lis_triste', url: '', animated: false },
  ]
}

function buildBackup(id: string, guildId: string, guildName: string, createdAt: string, extraChannel?: boolean): BackupData {
  const channels = makeChannels()
  if (extraChannel) {
    channels.push({ id: 'c9', name: 'eventos', kind: 'text', position: 2, parentName: 'Geral', topic: 'Próximos eventos da comunidade', nsfw: false, rateLimitPerUser: 0, permissionOverwrites: [] })
  }
  return {
    id,
    createdAt,
    guildId,
    guildName,
    guildIconUrl: null,
    settings: {
      name: guildName,
      iconUrl: null,
      verificationLevel: 2,
      explicitContentFilter: 1,
      defaultMessageNotifications: 1,
      afkChannelName: null,
      afkTimeout: 300,
      systemChannelName: 'geral',
      locale: 'pt-PT',
    },
    roles: makeRoles(),
    channels,
    emojis: makeEmojis(),
    bans: [
      { userId: '111111', userTag: 'spammer#0001', reason: 'Divulgação não autorizada' },
    ],
    memberCountAtBackup: guildId === 'g1' ? 342 : 18,
  }
}

const guilds: GuildSummary[] = [
  { id: 'g1', name: 'Comunidade LisDiscord', iconUrl: null, memberCount: 348, ownerId: 'u1', botIsAdmin: true },
  { id: 'g2', name: 'Servidor de Testes', iconUrl: null, memberCount: 18, ownerId: 'u1', botIsAdmin: true },
]

const backupsData: BackupData[] = [
  buildBackup('b1', 'g1', 'Comunidade LisDiscord', daysAgo(0), true),
  buildBackup('b2', 'g1', 'Comunidade LisDiscord', daysAgo(3)),
  buildBackup('b3', 'g2', 'Servidor de Testes', daysAgo(1)),
]
const backupOrigin = new Map<string, BackupSummary['origin']>([
  ['b1', 'scheduled'],
  ['b2', 'manual'],
  ['b3', 'manual'],
])

let schedulesData: ScheduleConfig[] = [
  {
    id: 's1',
    guildId: 'g1',
    guildName: 'Comunidade LisDiscord',
    frequency: 'daily',
    includeBans: true,
    enabled: true,
    createdAt: daysAgo(10),
    lastRunAt: daysAgo(0),
    nextRunAt: hoursFromNow(21),
    keepLast: 10,
  },
]

const membersData: MemberSearchResult[] = [
  { id: 'u10', tag: 'ana.dev#0001', avatarUrl: null, isTimedOut: false, isBot: false },
  { id: 'u11', tag: 'ricardo_c#4521', avatarUrl: null, isTimedOut: false, isBot: false },
  { id: 'u12', tag: 'sofia_gamer#7788', avatarUrl: null, isTimedOut: false, isBot: false },
  { id: 'u13', tag: 'joao99#0420', avatarUrl: null, isTimedOut: true, isBot: false },
  { id: 'u14', tag: 'trouble_maker#6969', avatarUrl: null, isTimedOut: false, isBot: false },
  { id: 'u15', tag: 'LisDiscord Bot#0421', avatarUrl: null, isTimedOut: false, isBot: true },
]

let moderationLogData: ModerationLogEntry[] = [
  { id: 'ml1', guildId: 'g1', guildName: 'Comunidade LisDiscord', action: 'timeout', targetTag: 'joao99#0420', reason: 'Spam repetido no #geral', date: daysAgo(0) },
  { id: 'ml2', guildId: 'g1', guildName: 'Comunidade LisDiscord', action: 'lockChannel', targetTag: '#memes', reason: null, date: daysAgo(1) },
]

let giveawaysData: Giveaway[] = [
  {
    id: 'giv1',
    guildId: 'g1',
    guildName: 'Comunidade LisDiscord',
    channelId: 'c4',
    channelName: 'geral',
    messageId: 'demo-msg-1',
    prize: 'Nitro de 1 mês',
    winnerCount: 1,
    createdAt: daysAgo(2),
    endsAt: daysAgo(1),
    ended: true,
    winners: ['sofia_gamer#7788'],
  },
]

const gameSettingsData = new Map<string, GameSettings>()

const transcriptsData: Transcript[] = [
  {
    channelId: 'c4',
    channelName: 'geral',
    guildName: 'Comunidade LisDiscord',
    exportedAt: daysAgo(0),
    messages: [
      { id: 'm1', authorTag: 'ana.dev', authorAvatarUrl: null, content: 'Bom dia pessoal! 👋', createdAt: daysAgo(0), attachments: [], editedAt: null },
      { id: 'm2', authorTag: 'ricardo_c', authorAvatarUrl: null, content: 'Alguém testou a nova versão do bot?', createdAt: daysAgo(0), attachments: [], editedAt: null },
      { id: 'm3', authorTag: 'ana.dev', authorAvatarUrl: null, content: 'Sim, está a funcionar bem por aqui.', createdAt: daysAgo(0), attachments: [], editedAt: null },
    ],
  },
]

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}
function hoursFromNow(n: number): string {
  return new Date(Date.now() + n * 3_600_000).toISOString()
}

function summarize(backup: BackupData): BackupSummary {
  return {
    id: backup.id,
    createdAt: backup.createdAt,
    guildId: backup.guildId,
    guildName: backup.guildName,
    guildIconUrl: backup.guildIconUrl,
    channelCount: backup.channels.length,
    roleCount: backup.roles.length,
    emojiCount: backup.emojis.length,
    banCount: backup.bans.length,
    memberCountAtBackup: backup.memberCountAtBackup,
    sizeBytes: JSON.stringify(backup).length,
    origin: backupOrigin.get(backup.id) ?? 'manual',
  }
}

function summarizeTranscript(t: Transcript, id: string): TranscriptSummary {
  return { id, channelId: t.channelId, channelName: t.channelName, guildName: t.guildName, exportedAt: t.exportedAt, messageCount: t.messages.length }
}

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms))

const transcriptIds = new Map<Transcript, string>(transcriptsData.map((t, i) => [t, `t${i + 1}`]))
const restoreListeners = new Set<(event: RestoreProgressEvent) => void>()

export const demoBridge: LisDiscordBridge = {
  async connectBot() {
    await delay()
    return { connected: true, botTag: 'LisDiscord Bot#0421', botAvatarUrl: null, guildCount: guilds.length, messageContentEnabled: true }
  },
  async disconnectBot() {
    await delay()
  },
  async getStatus() {
    return { connected: true, botTag: 'LisDiscord Bot#0421', botAvatarUrl: null, guildCount: guilds.length, messageContentEnabled: true }
  },
  async listGuilds() {
    await delay()
    return guilds
  },
  async listChannels(guildId) {
    await delay()
    return makeChannels()
      .filter((c) => c.kind === 'text' || c.kind === 'announcement')
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind }))
      .concat(guildId === 'g2' ? [{ id: 'extra', name: 'testes-bot', kind: 'text' }] : [])
  },

  async createBackup(guildId, options) {
    await delay(700)
    const guild = guilds.find((g) => g.id === guildId)
    const backup = buildBackup(crypto.randomUUID(), guildId, guild?.name ?? 'Servidor', new Date().toISOString())
    backupsData.unshift(backup)
    backupOrigin.set(backup.id, options.origin)
    return summarize(backup)
  },
  async listBackups() {
    await delay()
    return backupsData.map(summarize).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },
  async getBackup(id) {
    await delay()
    return backupsData.find((b) => b.id === id) ?? null
  },
  async deleteBackup(id) {
    await delay()
    const idx = backupsData.findIndex((b) => b.id === id)
    if (idx >= 0) backupsData.splice(idx, 1)
  },
  async restoreBackup(backupId, targetGuildId, options) {
    const steps: Array<Omit<RestoreProgressEvent, 'backupId' | 'targetGuildId'>> = [
      { step: 'roles', message: 'A criar cargos…', done: 0, total: 4, level: 'info' },
      { step: 'roles', message: 'Cargos recriados.', done: 4, total: 4, level: 'success' },
      { step: 'channels', message: 'A criar canais…', done: 0, total: 9, level: 'info' },
      { step: 'channels', message: 'Canais recriados.', done: 9, total: 9, level: 'success' },
    ]
    if (options.restoreEmojis) steps.push({ step: 'emojis', message: 'Emojis recriados.', done: 3, total: 3, level: 'success' })
    if (options.restoreBans) steps.push({ step: 'bans', message: 'Banimentos reaplicados.', done: 1, total: 1, level: 'success' })
    steps.push({ step: 'done', message: 'Restauro concluído.', done: 1, total: 1, level: 'success' })

    for (const step of steps) {
      await delay(450)
      restoreListeners.forEach((fn) => fn({ backupId, targetGuildId, ...step }))
    }
  },
  onRestoreProgress(listener) {
    restoreListeners.add(listener)
    return () => restoreListeners.delete(listener)
  },
  async diffBackups(idA, idB) {
    await delay()
    const a = backupsData.find((b) => b.id === idA)
    const b = backupsData.find((b2) => b2.id === idB)
    if (!a || !b) return []
    const out: DiffEntry[] = []
    const aNames = new Set(a.channels.map((c) => c.name))
    const bNames = new Set(b.channels.map((c) => c.name))
    for (const name of bNames) if (!aNames.has(name)) out.push({ kind: 'added', category: 'channel', name })
    for (const name of aNames) if (!bNames.has(name)) out.push({ kind: 'removed', category: 'channel', name })
    if (out.length === 0) out.push({ kind: 'changed', category: 'channel', name: 'geral', details: 'slowmode' })
    return out
  },

  async exportTranscript() {
    await delay(600)
    const t = transcriptsData[0]
    return summarizeTranscript(t, transcriptIds.get(t) ?? 't1')
  },
  async listTranscripts() {
    await delay()
    return transcriptsData.map((t) => summarizeTranscript(t, transcriptIds.get(t) ?? 't1'))
  },
  async getTranscript(id) {
    await delay()
    for (const [t, tid] of transcriptIds) if (tid === id) return t
    return null
  },
  async deleteTranscript() {
    await delay()
  },

  async listSchedules() {
    await delay()
    return schedulesData
  },
  async createSchedule(guildId, frequency, includeBans) {
    await delay()
    const guild = guilds.find((g) => g.id === guildId)
    const schedule: ScheduleConfig = {
      id: crypto.randomUUID(),
      guildId,
      guildName: guild?.name ?? 'Servidor',
      frequency,
      includeBans,
      enabled: true,
      createdAt: new Date().toISOString(),
      lastRunAt: null,
      nextRunAt: hoursFromNow(6),
      keepLast: 10,
    }
    schedulesData = [schedule, ...schedulesData]
    return schedule
  },
  async updateSchedule(id, patch) {
    await delay()
    schedulesData = schedulesData.map((s) => (s.id === id ? { ...s, ...patch } : s))
    return schedulesData.find((s) => s.id === id) as ScheduleConfig
  },
  async deleteSchedule(id) {
    await delay()
    schedulesData = schedulesData.filter((s) => s.id !== id)
  },

  async getSettings() {
    await delay()
    return { hasToken: true, theme: 'dark', dataDir: '~/.config/LisDiscord (modo demonstração)' }
  },
  async openDataDir() {
    await delay()
  },

  async sendEmbed() {
    await delay(500)
  },

  async searchMembers(_guildId, query) {
    await delay()
    const q = query.trim().toLowerCase()
    if (!q) return []
    return membersData.filter((m) => m.tag.toLowerCase().includes(q))
  },
  async banMember(guildId, userId, reason) {
    await delay(400)
    const member = membersData.find((m) => m.id === userId)
    const guild = guilds.find((g) => g.id === guildId)
    moderationLogData = [{ id: crypto.randomUUID(), guildId, guildName: guild?.name ?? 'Servidor', action: 'ban', targetTag: member?.tag ?? userId, reason: reason || null, date: new Date().toISOString() }, ...moderationLogData]
  },
  async kickMember(guildId, userId, reason) {
    await delay(400)
    const member = membersData.find((m) => m.id === userId)
    const guild = guilds.find((g) => g.id === guildId)
    moderationLogData = [{ id: crypto.randomUUID(), guildId, guildName: guild?.name ?? 'Servidor', action: 'kick', targetTag: member?.tag ?? userId, reason: reason || null, date: new Date().toISOString() }, ...moderationLogData]
  },
  async timeoutMember(guildId, userId, _durationMs, reason) {
    await delay(400)
    const member = membersData.find((m) => m.id === userId)
    const guild = guilds.find((g) => g.id === guildId)
    if (member) member.isTimedOut = true
    moderationLogData = [{ id: crypto.randomUUID(), guildId, guildName: guild?.name ?? 'Servidor', action: 'timeout', targetTag: member?.tag ?? userId, reason: reason || null, date: new Date().toISOString() }, ...moderationLogData]
  },
  async removeTimeout(guildId, userId) {
    await delay(300)
    const member = membersData.find((m) => m.id === userId)
    const guild = guilds.find((g) => g.id === guildId)
    if (member) member.isTimedOut = false
    moderationLogData = [{ id: crypto.randomUUID(), guildId, guildName: guild?.name ?? 'Servidor', action: 'removeTimeout', targetTag: member?.tag ?? userId, reason: null, date: new Date().toISOString() }, ...moderationLogData]
  },
  async lockChannel(guildId, channelId) {
    await delay(300)
    const guild = guilds.find((g) => g.id === guildId)
    const channel = makeChannels().find((c) => c.id === channelId)
    moderationLogData = [{ id: crypto.randomUUID(), guildId, guildName: guild?.name ?? 'Servidor', action: 'lockChannel', targetTag: `#${channel?.name ?? channelId}`, reason: null, date: new Date().toISOString() }, ...moderationLogData]
  },
  async unlockChannel(guildId, channelId) {
    await delay(300)
    const guild = guilds.find((g) => g.id === guildId)
    const channel = makeChannels().find((c) => c.id === channelId)
    moderationLogData = [{ id: crypto.randomUUID(), guildId, guildName: guild?.name ?? 'Servidor', action: 'unlockChannel', targetTag: `#${channel?.name ?? channelId}`, reason: null, date: new Date().toISOString() }, ...moderationLogData]
  },
  async listModerationLog() {
    await delay()
    return moderationLogData
  },

  async createGiveaway(guildId, channelId, prize, durationMs, winnerCount) {
    await delay(500)
    const guild = guilds.find((g) => g.id === guildId)
    const channel = makeChannels().find((c) => c.id === channelId)
    const giveaway: Giveaway = {
      id: crypto.randomUUID(),
      guildId,
      guildName: guild?.name ?? 'Servidor',
      channelId,
      channelName: channel?.name ?? channelId,
      messageId: `demo-msg-${crypto.randomUUID().slice(0, 6)}`,
      prize,
      winnerCount,
      createdAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + durationMs).toISOString(),
      ended: false,
      winners: [],
    }
    giveawaysData = [giveaway, ...giveawaysData]
    return giveaway
  },
  async listGiveaways() {
    await delay()
    return giveawaysData
  },
  async endGiveaway(id) {
    await delay(500)
    const winners = membersData.filter((m) => !m.isBot).slice(0, 1).map((m) => m.tag)
    giveawaysData = giveawaysData.map((g) => (g.id === id ? { ...g, ended: true, winners } : g))
    return giveawaysData.find((g) => g.id === id) as Giveaway
  },
  async deleteGiveaway(id) {
    await delay()
    giveawaysData = giveawaysData.filter((g) => g.id !== id)
  },

  async listGames() {
    await delay()
    return DEMO_GAMES
  },
  async getGameSettings(guildId) {
    await delay()
    return gameSettingsData.get(guildId) ?? { enabled: Object.fromEntries(DEMO_GAMES.map((g) => [g.id, true])) as Record<GameId, boolean> }
  },
  async setGameSettings(guildId, gameId, enabled) {
    await delay()
    const current = gameSettingsData.get(guildId) ?? { enabled: Object.fromEntries(DEMO_GAMES.map((g) => [g.id, true])) as Record<GameId, boolean> }
    const updated = { enabled: { ...current.enabled, [gameId]: enabled } }
    gameSettingsData.set(guildId, updated)
    return updated
  },
}
