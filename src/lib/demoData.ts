import type { LisDiscordBridge } from '../../shared/ipc'
import type {
  BackupData,
  BackupSummary,
  BotEmoji,
  ChannelBackup,
  DiffEntry,
  EmbedDraft,
  EmbedTemplateKind,
  EmojiBackup,
  ExcludedMember,
  GameId,
  GameSettings,
  Giveaway,
  GuildSummary,
  JustificationSettings,
  MemberSearchResult,
  ModerationLogEntry,
  RemoteBotConfig,
  MovPointsBoardConfig,
  MovPointsEntry,
  MovPointsLogAction,
  MovPointsLogEntry,
  RestoreProgressEvent,
  RoleBackup,
  RoleGoal,
  RolePickerEntry,
  ScheduleConfig,
  Transcript,
  TranscriptSummary,
} from '../../shared/types'

const DEMO_GAMES = [
  { id: 'dado' as const, name: 'Dado', command: '/dado', description: 'Lança um dado (padrão 6 lados, configurável).' },
  { id: 'moeda' as const, name: 'Cara ou Coroa', command: '/moeda', description: 'Atira uma moeda ao ar.' },
  { id: 'ppt' as const, name: 'Pedra, Papel ou Tesoura', command: '/ppt', description: 'Joga contra o bot.' },
  { id: 'oitobola' as const, name: 'Bola 8 Mágica', command: '/oitobola', description: 'Faz uma pergunta e recebe uma resposta misteriosa.' },
  { id: 'trivia' as const, name: 'Trivia', command: '/trivia', description: 'Responde a uma pergunta de escolha múltipla contra o relógio e ganha moedas.' },
  { id: 'forca' as const, name: 'Forca', command: '/forca', description: 'Adivinha a palavra letra a letra antes que a forca se complete.' },
  { id: 'blackjack' as const, name: 'Blackjack', command: '/blackjack', description: 'Joga 21 contra a casa, apostando moedas.' },
  { id: 'jogodavelha' as const, name: 'Jogo do Galo', command: '/jogodavelha', description: 'Desafia outro membro para um jogo do galo por turnos.' },
  { id: 'duelo' as const, name: 'Duelo', command: '/duelo', description: 'Combate por turnos contra outro membro, apostando moedas, com ataques e defesas.' },
  { id: 'roleta' as const, name: 'Roleta', command: '/roleta', description: 'Aposta na cor da roleta — vermelho e preto pagam 2x, verde paga 14x.' },
  { id: 'cacaniqueis' as const, name: 'Caça-níqueis', command: '/caca-niqueis', description: 'Gira os três rolos — três 7️⃣ é o jackpot (20x).' },
  { id: 'corrida' as const, name: 'Corrida', command: '/corrida', description: 'Aposta em qual bicho vence a corrida animada (paga 3.5x).' },
  { id: 'numero' as const, name: 'Adivinha o Número', command: '/numero', description: 'Adivinha um número secreto entre 1 e 50 — quantas menos tentativas, mais moedas.' },
  { id: 'desembaralhar' as const, name: 'Desembaralhar', command: '/desembaralhar', description: 'Desembaralha as letras e escreve a palavra certa antes dos outros.' },
  { id: 'economia' as const, name: 'Economia', command: '/saldo · /diario · /ranking', description: 'Vê o teu saldo, reclama moedas diárias e consulta o ranking do servidor.' },
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

let movPointsData: Record<string, MovPointsEntry[]> = {
  g1: [
    { userId: 'u10', tag: 'ana.dev#0001', points: 85, totalSeconds: 7200 },
    { userId: 'u12', tag: 'sofia_gamer#7788', points: 60, totalSeconds: 3600 },
    { userId: 'u11', tag: 'ricardo_c#4521', points: 40, totalSeconds: 1800 },
    { userId: 'u13', tag: 'joao99#0420', points: 0, totalSeconds: 5400 },
  ],
}

let movPointsBoardData: Record<string, MovPointsBoardConfig> = {
  g1: { channelId: 'c4', channelName: 'geral' },
}

let movPointsLogData: Record<string, MovPointsLogEntry[]> = {
  g1: [
    {
      id: 'mpl1',
      guildId: 'g1',
      date: daysAgo(0),
      action: 'add_points',
      targetUserId: 'u10',
      targetTag: 'ana.dev#0001',
      amount: 10,
      newTotal: 85,
      actorTag: 'admin_lis#0001',
      note: 'Mov. Call Normal de hoje',
    },
    {
      id: 'mpl2',
      guildId: 'g1',
      date: daysAgo(1),
      action: 'add_hours',
      targetUserId: 'u12',
      targetTag: 'sofia_gamer#7788',
      amount: 3600,
      newTotal: 3600,
      actorTag: 'Aplicação desktop',
      note: null,
    },
  ],
}

function logDemoMovPoints(entry: {
  guildId: string
  action: MovPointsLogAction
  targetUserId: string | null
  targetTag: string | null
  amount: number | null
  newTotal: number | null
  actorTag: string
  note?: string | null
}): void {
  const record: MovPointsLogEntry = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    guildId: entry.guildId,
    action: entry.action,
    targetUserId: entry.targetUserId,
    targetTag: entry.targetTag,
    amount: entry.amount,
    newTotal: entry.newTotal,
    actorTag: entry.actorTag,
    note: entry.note ?? null,
  }
  movPointsLogData = { ...movPointsLogData, [entry.guildId]: [record, ...(movPointsLogData[entry.guildId] ?? [])] }
}

function sortMovPoints(entries: MovPointsEntry[]): MovPointsEntry[] {
  return [...entries].sort((a, b) => b.points - a.points || b.totalSeconds - a.totalSeconds || a.tag.localeCompare(b.tag))
}

let excludedMembersData: Record<string, ExcludedMember[]> = {}

let justificationSettingsData: Record<string, JustificationSettings> = {
  g1: {
    fixedPostChannelId: null,
    fixedPostChannelName: null,
    dailyPostChannelId: null,
    dailyPostChannelName: null,
    fixedLogChannelId: null,
    fixedLogChannelName: null,
    dailyLogChannelId: null,
    dailyLogChannelName: null,
  },
}

const EMPTY_JUSTIFICATION_SETTINGS: JustificationSettings = {
  fixedPostChannelId: null,
  fixedPostChannelName: null,
  dailyPostChannelId: null,
  dailyPostChannelName: null,
  fixedLogChannelId: null,
  fixedLogChannelName: null,
  dailyLogChannelId: null,
  dailyLogChannelName: null,
}

let remoteBotConfigData: RemoteBotConfig = { url: null, hasApiKey: false }

let emojiLibraryData: BotEmoji[] = [
  { id: 'emoji1', name: 'aprovado', animated: false, url: 'https://cdn.discordapp.com/emojis/placeholder.png' },
  { id: 'emoji2', name: 'movcall', animated: false, url: 'https://cdn.discordapp.com/emojis/placeholder.png' },
]

function fakeEmojiId(): string {
  return `emoji${Math.random().toString(36).slice(2, 10)}`
}

function emptyEmbedDraft(partial: Partial<EmbedDraft>): EmbedDraft {
  return { title: '', description: '', color: '#5865F2', imageUrl: '', thumbnailUrl: '', footer: '', authorName: '', fields: [], timestamp: true, ...partial }
}

const DEFAULT_DEMO_TEMPLATES: Record<EmbedTemplateKind, EmbedDraft> = {
  pontosBoard: emptyEmbedDraft({ title: '🏅 PONTOS DE MOV. CALL', description: '{lista}', color: '#F0B232', footer: '{servidor} · atualizado em {atualizado}' }),
  inativos: emptyEmbedDraft({ title: '⚠️ MEMBROS INATIVOS', description: '{lista}', color: '#ED4245', footer: '{servidor} · sem pontos ou menos de 5h de Mov. Call' }),
  justificationFixed: emptyEmbedDraft({
    title: '👑 Usem este canal para fazer as justificativas fixas',
    description: 'Quando vais ter um compromisso toda a semana, sempre no mesmo horário.',
    color: '#F0B232',
    footer: 'A tua justificativa fica registada com o teu nome.',
    timestamp: false,
  }),
  justificationDaily: emptyEmbedDraft({
    title: '👑 Usem este canal para fazer as justificativas diárias',
    description: 'Quando vais ter um compromisso de última hora, só por hoje.',
    color: '#5865F2',
    footer: 'A tua justificativa fica registada com o teu nome.',
    timestamp: false,
  }),
}

let embedTemplatesData: Record<string, Partial<Record<EmbedTemplateKind, EmbedDraft>>> = {}

/** Espelha buildFullLeaderboard do lado real: mostra sempre todos os membros (não-bots), com 0/0 para quem nunca teve pontos, exceto quem foi escondido. */
function fullDemoLeaderboard(guildId: string): MovPointsEntry[] {
  const excluded = new Set((excludedMembersData[guildId] ?? []).map((m) => m.userId))
  const tracked = new Map((movPointsData[guildId] ?? []).map((e) => [e.userId, e]))
  const entries = membersData
    .filter((m) => !m.isBot && !excluded.has(m.id))
    .map((m) => {
      const existing = tracked.get(m.id)
      return { userId: m.id, tag: m.tag, points: existing?.points ?? 0, totalSeconds: existing?.totalSeconds ?? 0 }
    })
  return sortMovPoints(entries)
}

const demoRoles: RolePickerEntry[] = [
  { id: 'r3', name: 'Veterano', color: '#F0B232' },
  { id: 'r2', name: 'Membro Ativo', color: '#3BA55C' },
  { id: 'r1', name: 'Membro', color: '#99AAB5' },
]

const memberRolesData: Record<string, RolePickerEntry[]> = {
  u10: [demoRoles[1]],
  u11: [demoRoles[2]],
  u12: [demoRoles[1]],
  u13: [demoRoles[2]],
}

let roleGoalsData: Record<string, RoleGoal[]> = {
  g1: [
    { roleId: 'r2', roleName: 'Membro Ativo', pointsGoal: 50, hoursGoal: 2 },
    { roleId: 'r3', roleName: 'Veterano', pointsGoal: 100, hoursGoal: 10 },
  ],
}

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
    return { connected: true, botTag: 'LisDiscord Bot#0421', botAvatarUrl: null, guildCount: guilds.length, messageContentEnabled: true, guildMembersEnabled: true }
  },
  async disconnectBot() {
    await delay()
  },
  async getStatus() {
    return { connected: true, botTag: 'LisDiscord Bot#0421', botAvatarUrl: null, guildCount: guilds.length, messageContentEnabled: true, guildMembersEnabled: true }
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
  async sendRemoteEmbed() {
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

  async listMovPoints(guildId) {
    await delay()
    return fullDemoLeaderboard(guildId)
  },
  async addMovPoints(guildId, userId, amount) {
    await delay(300)
    const entries = movPointsData[guildId] ?? []
    const member = membersData.find((m) => m.id === userId)
    const existing = entries.find((e) => e.userId === userId)
    if (existing) existing.points = Math.max(0, existing.points + amount)
    else entries.push({ userId, tag: member?.tag ?? userId, points: Math.max(0, amount), totalSeconds: 0 })
    movPointsData = { ...movPointsData, [guildId]: entries }
    logDemoMovPoints({
      guildId,
      action: 'add_points',
      targetUserId: userId,
      targetTag: member?.tag ?? userId,
      amount,
      newTotal: entries.find((e) => e.userId === userId)?.points ?? amount,
      actorTag: 'Aplicação desktop',
    })
    return fullDemoLeaderboard(guildId)
  },
  async removeMovPoints(guildId, userId, amount) {
    await delay(300)
    const entries = movPointsData[guildId] ?? []
    const member = membersData.find((m) => m.id === userId)
    const existing = entries.find((e) => e.userId === userId)
    if (existing) existing.points = Math.max(0, existing.points - amount)
    else entries.push({ userId, tag: member?.tag ?? userId, points: 0, totalSeconds: 0 })
    movPointsData = { ...movPointsData, [guildId]: entries }
    logDemoMovPoints({
      guildId,
      action: 'remove_points',
      targetUserId: userId,
      targetTag: member?.tag ?? userId,
      amount,
      newTotal: entries.find((e) => e.userId === userId)?.points ?? 0,
      actorTag: 'Aplicação desktop',
    })
    return fullDemoLeaderboard(guildId)
  },
  async addMovHours(guildId, userId, seconds) {
    await delay(300)
    const entries = movPointsData[guildId] ?? []
    const member = membersData.find((m) => m.id === userId)
    const existing = entries.find((e) => e.userId === userId)
    if (existing) existing.totalSeconds = Math.max(0, existing.totalSeconds + seconds)
    else entries.push({ userId, tag: member?.tag ?? userId, points: 0, totalSeconds: Math.max(0, seconds) })
    movPointsData = { ...movPointsData, [guildId]: entries }
    logDemoMovPoints({
      guildId,
      action: 'add_hours',
      targetUserId: userId,
      targetTag: member?.tag ?? userId,
      amount: seconds,
      newTotal: entries.find((e) => e.userId === userId)?.totalSeconds ?? seconds,
      actorTag: 'Aplicação desktop',
    })
    return fullDemoLeaderboard(guildId)
  },
  async getMovPointsBoard(guildId) {
    await delay()
    return movPointsBoardData[guildId] ?? { channelId: null, channelName: null }
  },
  async setMovPointsBoard(guildId, channelId) {
    await delay()
    const channel = makeChannels().find((c) => c.id === channelId)
    const updated: MovPointsBoardConfig = { channelId, channelName: channel?.name ?? channelId }
    movPointsBoardData = { ...movPointsBoardData, [guildId]: updated }
    return updated
  },
  async resetMovPoints(guildId) {
    await delay(400)
    const affected = (movPointsData[guildId] ?? []).length
    movPointsData = { ...movPointsData, [guildId]: [] }
    logDemoMovPoints({ guildId, action: 'reset', targetUserId: null, targetTag: null, amount: affected, newTotal: null, actorTag: 'Aplicação desktop' })
    return fullDemoLeaderboard(guildId)
  },
  async listMovPointsLog(guildId) {
    await delay()
    return [...(movPointsLogData[guildId] ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1))
  },

  async listExcludedMembers(guildId) {
    await delay()
    return excludedMembersData[guildId] ?? []
  },
  async setMemberExcluded(guildId, userId, tag, excluded) {
    await delay()
    const current = excludedMembersData[guildId] ?? []
    const without = current.filter((m) => m.userId !== userId)
    const updated = excluded ? [...without, { userId, tag }] : without
    excludedMembersData = { ...excludedMembersData, [guildId]: updated }
    return updated
  },

  // Bot remoto: no modo demonstração, usam exatamente os mesmos dados fictícios que a versão local.
  async listRemoteMovPoints(guildId) {
    await delay()
    return fullDemoLeaderboard(guildId)
  },
  async addRemoteMovPoints(guildId, userId, amount) {
    return demoBridge.addMovPoints(guildId, userId, amount)
  },
  async removeRemoteMovPoints(guildId, userId, amount) {
    return demoBridge.removeMovPoints(guildId, userId, amount)
  },
  async addRemoteMovHours(guildId, userId, seconds) {
    return demoBridge.addMovHours(guildId, userId, seconds)
  },
  async getRemoteMovPointsBoard(guildId) {
    return demoBridge.getMovPointsBoard(guildId)
  },
  async setRemoteMovPointsBoard(guildId, channelId) {
    return demoBridge.setMovPointsBoard(guildId, channelId)
  },
  async resetRemoteMovPoints(guildId) {
    return demoBridge.resetMovPoints(guildId)
  },
  async listRemoteMovPointsLog(guildId) {
    return demoBridge.listMovPointsLog(guildId)
  },
  async listRemoteExcludedMembers(guildId) {
    return demoBridge.listExcludedMembers(guildId)
  },
  async setRemoteMemberExcluded(guildId, userId, tag, excluded) {
    return demoBridge.setMemberExcluded(guildId, userId, tag, excluded)
  },
  async searchRemoteMembers(guildId, query) {
    return demoBridge.searchMembers(guildId, query)
  },

  async getJustificationSettings(guildId) {
    await delay()
    return justificationSettingsData[guildId] ?? EMPTY_JUSTIFICATION_SETTINGS
  },
  async setJustificationChannel(guildId, kind, channelId) {
    await delay()
    const current = justificationSettingsData[guildId] ?? EMPTY_JUSTIFICATION_SETTINGS
    const channel = makeChannels().find((c) => c.id === channelId)
    const channelName = channelId ? (channel?.name ?? channelId) : null
    const updated: JustificationSettings = { ...current }
    if (kind === 'fixedPost') {
      updated.fixedPostChannelId = channelId
      updated.fixedPostChannelName = channelName
    } else if (kind === 'dailyPost') {
      updated.dailyPostChannelId = channelId
      updated.dailyPostChannelName = channelName
    } else if (kind === 'fixedLog') {
      updated.fixedLogChannelId = channelId
      updated.fixedLogChannelName = channelName
    } else {
      updated.dailyLogChannelId = channelId
      updated.dailyLogChannelName = channelName
    }
    justificationSettingsData = { ...justificationSettingsData, [guildId]: updated }
    return updated
  },

  async getRemoteBotConfig() {
    await delay()
    return remoteBotConfigData
  },
  async setRemoteBotConfig(url, apiKey) {
    await delay()
    remoteBotConfigData = { url, hasApiKey: apiKey.length > 0 }
    return remoteBotConfigData
  },
  async clearRemoteBotConfig() {
    await delay()
    remoteBotConfigData = { url: null, hasApiKey: false }
    return remoteBotConfigData
  },
  async testRemoteBotConnection() {
    await delay()
    return { ok: true }
  },
  async listRemoteGuilds() {
    await delay()
    return guilds
  },
  async listRemoteChannels(guildId) {
    await delay()
    return makeChannels()
      .filter((c) => c.kind === 'text' || c.kind === 'announcement')
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind }))
      .concat(guildId === 'g2' ? [{ id: 'extra', name: 'testes-bot', kind: 'text' as const }] : [])
  },
  async getRemoteJustificationSettings(guildId) {
    await delay()
    return justificationSettingsData[guildId] ?? EMPTY_JUSTIFICATION_SETTINGS
  },
  async setRemoteJustificationChannel(guildId, kind, channelId) {
    await delay()
    const current = justificationSettingsData[guildId] ?? EMPTY_JUSTIFICATION_SETTINGS
    const channel = makeChannels().find((c) => c.id === channelId)
    const channelName = channelId ? (channel?.name ?? channelId) : null
    const updated: JustificationSettings = { ...current }
    if (kind === 'fixedPost') {
      updated.fixedPostChannelId = channelId
      updated.fixedPostChannelName = channelName
    } else if (kind === 'dailyPost') {
      updated.dailyPostChannelId = channelId
      updated.dailyPostChannelName = channelName
    } else if (kind === 'fixedLog') {
      updated.fixedLogChannelId = channelId
      updated.fixedLogChannelName = channelName
    } else {
      updated.dailyLogChannelId = channelId
      updated.dailyLogChannelName = channelName
    }
    justificationSettingsData = { ...justificationSettingsData, [guildId]: updated }
    return updated
  },

  async listEmojis() {
    await delay()
    return emojiLibraryData
  },
  async addEmoji(name, imageDataUrl) {
    await delay()
    const emoji: BotEmoji = { id: fakeEmojiId(), name, animated: imageDataUrl.startsWith('data:image/gif'), url: imageDataUrl }
    emojiLibraryData = [...emojiLibraryData, emoji]
    return emoji
  },
  async deleteEmoji(id) {
    await delay()
    emojiLibraryData = emojiLibraryData.filter((e) => e.id !== id)
  },
  async listRemoteEmojis() {
    await delay()
    return emojiLibraryData
  },
  async addRemoteEmoji(name, imageDataUrl) {
    await delay()
    const emoji: BotEmoji = { id: fakeEmojiId(), name, animated: imageDataUrl.startsWith('data:image/gif'), url: imageDataUrl }
    emojiLibraryData = [...emojiLibraryData, emoji]
    return emoji
  },
  async deleteRemoteEmoji(id) {
    await delay()
    emojiLibraryData = emojiLibraryData.filter((e) => e.id !== id)
  },

  async listRoles() {
    await delay()
    return demoRoles
  },
  async getMemberProfile(guildId, userId) {
    await delay()
    const member = membersData.find((m) => m.id === userId)
    const entry = (movPointsData[guildId] ?? []).find((e) => e.userId === userId)
    return {
      id: userId,
      tag: member?.tag ?? 'Desconhecido',
      avatarUrl: member?.avatarUrl ?? null,
      roles: memberRolesData[userId] ?? [],
      points: entry?.points ?? 0,
      totalSeconds: entry?.totalSeconds ?? 0,
    }
  },
  async listRoleGoals(guildId) {
    await delay()
    return roleGoalsData[guildId] ?? []
  },
  async setRoleGoal(guildId, roleId, roleName, pointsGoal, hoursGoal) {
    await delay()
    const existing = roleGoalsData[guildId] ?? []
    const idx = existing.findIndex((g) => g.roleId === roleId)
    const goal: RoleGoal = { roleId, roleName, pointsGoal, hoursGoal }
    const updated = idx === -1 ? [...existing, goal] : existing.map((g, i) => (i === idx ? goal : g))
    roleGoalsData = { ...roleGoalsData, [guildId]: updated }
    return updated
  },
  async removeRoleGoal(guildId, roleId) {
    await delay()
    const updated = (roleGoalsData[guildId] ?? []).filter((g) => g.roleId !== roleId)
    roleGoalsData = { ...roleGoalsData, [guildId]: updated }
    return updated
  },

  async getRemoteMemberProfile(guildId, userId) {
    return demoBridge.getMemberProfile(guildId, userId)
  },
  async listRemoteRoles(guildId) {
    return demoBridge.listRoles(guildId)
  },
  async listRemoteRoleGoals(guildId) {
    return demoBridge.listRoleGoals(guildId)
  },
  async setRemoteRoleGoal(guildId, roleId, roleName, pointsGoal, hoursGoal) {
    return demoBridge.setRoleGoal(guildId, roleId, roleName, pointsGoal, hoursGoal)
  },
  async removeRemoteRoleGoal(guildId, roleId) {
    return demoBridge.removeRoleGoal(guildId, roleId)
  },

  async getEmbedTemplate(guildId, kind) {
    await delay()
    const draft = embedTemplatesData[guildId]?.[kind] ?? DEFAULT_DEMO_TEMPLATES[kind]
    return { draft, customized: Boolean(embedTemplatesData[guildId]?.[kind]) }
  },
  async setEmbedTemplate(guildId, kind, draft) {
    await delay()
    embedTemplatesData = { ...embedTemplatesData, [guildId]: { ...embedTemplatesData[guildId], [kind]: draft } }
    return { draft, customized: true }
  },
  async resetEmbedTemplate(guildId, kind) {
    await delay()
    const guildTemplates = { ...embedTemplatesData[guildId] }
    delete guildTemplates[kind]
    embedTemplatesData = { ...embedTemplatesData, [guildId]: guildTemplates }
    return { draft: DEFAULT_DEMO_TEMPLATES[kind], customized: false }
  },
  async getRemoteEmbedTemplate(guildId, kind) {
    return demoBridge.getEmbedTemplate(guildId, kind)
  },
  async setRemoteEmbedTemplate(guildId, kind, draft) {
    return demoBridge.setEmbedTemplate(guildId, kind, draft)
  },
  async resetRemoteEmbedTemplate(guildId, kind) {
    return demoBridge.resetEmbedTemplate(guildId, kind)
  },
}
