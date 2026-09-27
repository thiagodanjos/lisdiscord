// Tipos partilhados entre o processo principal (Electron/discord.js) e a interface (React).
// Mantidos num único sítio para os dois lados nunca discordarem sobre a forma dos dados.

export type ChannelKind = 'category' | 'text' | 'voice' | 'announcement' | 'forum' | 'stage'

export interface PermissionOverwriteBackup {
  id: string
  name: string
  type: 'role' | 'member'
  allow: string[]
  deny: string[]
}

export interface ChannelBackup {
  id: string
  name: string
  kind: ChannelKind
  position: number
  parentName: string | null
  topic?: string | null
  nsfw?: boolean
  rateLimitPerUser?: number
  bitrate?: number
  userLimit?: number
  permissionOverwrites: PermissionOverwriteBackup[]
}

export interface RoleBackup {
  id: string
  name: string
  color: number
  hoist: boolean
  mentionable: boolean
  position: number
  permissions: string[]
  isEveryone: boolean
}

export interface EmojiBackup {
  id: string
  name: string
  url: string
  animated: boolean
}

export interface BanBackup {
  userId: string
  userTag: string
  reason: string | null
}

export interface GuildSettingsBackup {
  name: string
  iconUrl: string | null
  verificationLevel: number
  explicitContentFilter: number
  defaultMessageNotifications: number
  afkChannelName: string | null
  afkTimeout: number
  systemChannelName: string | null
  locale: string
}

export interface BackupData {
  id: string
  createdAt: string
  guildId: string
  guildName: string
  guildIconUrl: string | null
  settings: GuildSettingsBackup
  roles: RoleBackup[]
  channels: ChannelBackup[]
  emojis: EmojiBackup[]
  bans: BanBackup[]
  memberCountAtBackup: number
}

export interface BackupSummary {
  id: string
  createdAt: string
  guildId: string
  guildName: string
  guildIconUrl: string | null
  channelCount: number
  roleCount: number
  emojiCount: number
  banCount: number
  memberCountAtBackup: number
  sizeBytes: number
  origin: 'manual' | 'scheduled'
}

export interface GuildSummary {
  id: string
  name: string
  iconUrl: string | null
  memberCount: number
  ownerId: string
  botIsAdmin: boolean
}

// ==========================================================================
// Conta local (login guardado em SQLite)
// ==========================================================================

export interface AuthUser {
  id: number
  username: string
  createdAt: string
  lastLoginAt: string | null
}

export interface AuthState {
  /** Já existe pelo menos uma conta criada neste computador. */
  hasAccount: boolean
  /** Conta com a sessão aberta (null = ainda não entrou). */
  user: AuthUser | null
  /** A conta aberta tem um token de bot guardado — dá para ligar sem voltar a colá-lo. */
  hasBotToken: boolean
}

export interface LoginHistoryEntry {
  username: string
  success: boolean
  date: string
}

export interface BotStatus {
  connected: boolean
  botTag: string | null
  botAvatarUrl: string | null
  guildCount: number
  messageContentEnabled: boolean
  guildMembersEnabled: boolean
}

export interface RestoreOptions {
  wipeExistingChannels: boolean
  restoreRoles: boolean
  restoreChannels: boolean
  restoreEmojis: boolean
  restoreSettings: boolean
  restoreBans: boolean
}

export interface RestoreProgressEvent {
  backupId: string
  targetGuildId: string
  step: string
  message: string
  done: number
  total: number
  level: 'info' | 'success' | 'error'
}

export interface BackupOptions {
  includeBans: boolean
  origin: 'manual' | 'scheduled'
}

export type ScheduleFrequency = 'hourly6' | 'hourly12' | 'daily' | 'daily3' | 'weekly'

export interface ScheduleConfig {
  id: string
  guildId: string
  guildName: string
  frequency: ScheduleFrequency
  includeBans: boolean
  enabled: boolean
  createdAt: string
  lastRunAt: string | null
  nextRunAt: string | null
  keepLast: number
}

export interface DiffEntry {
  kind: 'added' | 'removed' | 'changed'
  category: 'role' | 'channel' | 'emoji'
  name: string
  details?: string
}

export interface TranscriptMessage {
  id: string
  authorTag: string
  authorAvatarUrl: string | null
  content: string
  createdAt: string
  attachments: string[]
  editedAt: string | null
}

export interface Transcript {
  channelId: string
  channelName: string
  guildName: string
  exportedAt: string
  messages: TranscriptMessage[]
}

export interface TranscriptSummary {
  id: string
  channelId: string
  channelName: string
  guildName: string
  exportedAt: string
  messageCount: number
}

export interface ChannelPickerEntry {
  id: string
  name: string
  kind: ChannelKind
}

export interface AppSettings {
  hasToken: boolean
  theme: 'dark' | 'light'
  dataDir: string
}

// ==========================================================================
// Mensagens (embeds)
// ==========================================================================

export interface EmbedField {
  name: string
  value: string
  inline: boolean
}

/**
 * Como cada linha de uma lista automática (placar, inativos) é escrita — o 1º, 2º e 3º lugar têm
 * linha própria (para medalhas, emojis diferentes…), o resto usa `line`. Tokens: {posicao},
 * {membro} (menção), {nome}, {pontos}, {horas}.
 */
export interface ListFormat {
  first: string
  second: string
  third: string
  line: string
}

export interface EmbedDraft {
  title: string
  description: string
  color: string // hex, ex: "#5865F2"
  imageUrl: string
  thumbnailUrl: string
  footer: string
  authorName: string
  fields: EmbedField[]
  timestamp: boolean
  // Opcionais para continuarem a funcionar os rascunhos/templates guardados antes de existirem.
  authorIconUrl?: string
  footerIconUrl?: string
  url?: string
  listFormat?: ListFormat
  /** Linhas por cargo do /verificar ({cargos}) — ver `VerifyLineFormat`. */
  verifyLines?: VerifyLineFormat
}

/**
 * Como o /verificar escreve cada cargo (com meta) do membro dentro de `{cargos}`. Tokens: {cargo}
 * (menção), {cargoNome}, {pontos}, {metaPontos}, {horas}, {metaHoras}, {faltamPontos}, {faltamHoras}.
 */
export interface VerifyLineFormat {
  met: string
  notMet: string
  /** Texto que aparece em `{cargos}` quando o membro não tem nenhum cargo com meta. */
  empty: string
}

/**
 * Os embeds fixos que o bot publica sozinho (placar de pontos, inativos, mensagens de
 * justificativas) — antes só editáveis no código, agora um `EmbedDraft` como qualquer outro,
 * guardado por servidor. `pontosBoard` e `inativos` podem usar `{lista}` na descrição (e nos
 * campos) para indicar onde entra a lista dinâmica de membros — sem esse token, a lista não
 * aparece em lado nenhum, por isso o editor avisa disso.
 */
export type EmbedTemplateKind =
  | 'pontosBoard'
  | 'inativos'
  | 'justificationFixed'
  | 'justificationDaily'
  | 'justificationPostFixed'
  | 'justificationPostDaily'
  | 'justificationLogFixed'
  | 'justificationLogDaily'
  | 'justificationRemoval'
  | 'verificar'
  | 'avisoMov'
  | 'verificationRequest'
  | 'verificationLog'
  | 'verificationPanel'
  | 'verificationTicket'
  | 'logMessageDelete'
  | 'logMessageEdit'
  | 'logPoints'
  | 'logHours'

export const EMBED_TEMPLATE_KINDS: EmbedTemplateKind[] = [
  'pontosBoard',
  'inativos',
  'justificationFixed',
  'justificationDaily',
  'justificationPostFixed',
  'justificationPostDaily',
  'justificationLogFixed',
  'justificationLogDaily',
  'justificationRemoval',
  'verificar',
  'avisoMov',
  'verificationRequest',
  'verificationLog',
  'verificationPanel',
  'verificationTicket',
  'logMessageDelete',
  'logMessageEdit',
  'logPoints',
  'logHours',
]

/** Tokens disponíveis nas mensagens que o bot manda quando alguém se justifica (ou pede remoção). */
export const JUSTIFICATION_PLACEHOLDERS = ['{membro}', '{nome}', '{avatar}', '{tipo}', '{periodo}', '{motivo}', '{canal}', '{link}', '{servidor}'] as const

export interface SendMessageOptions {
  /** Texto normal da mensagem, por cima do embed. */
  content?: string
  /** Enviar por webhook, com este nome e ícone (em vez de como o próprio bot). */
  webhook?: { name: string; avatarUrl: string } | null
}

export interface SendMessageResult {
  url: string
  viaWebhook: boolean
  warning?: string
}

export interface EmbedTemplateResponse {
  draft: EmbedDraft
  customized: boolean
}

// ==========================================================================
// Moderação
// ==========================================================================

export interface MemberSearchResult {
  id: string
  tag: string
  avatarUrl: string | null
  isTimedOut: boolean
  isBot: boolean
}

export type ModerationAction = 'ban' | 'kick' | 'timeout' | 'removeTimeout'

export type TimeoutDuration = 60_000 | 300_000 | 600_000 | 3_600_000 | 86_400_000 | 604_800_000

export interface ModerationLogEntry {
  id: string
  guildId: string
  guildName: string
  action: ModerationAction | 'lockChannel' | 'unlockChannel'
  targetTag: string
  reason: string | null
  date: string
}

// ==========================================================================
// Sorteios
// ==========================================================================

export interface Giveaway {
  id: string
  guildId: string
  guildName: string
  channelId: string
  channelName: string
  messageId: string | null
  prize: string
  winnerCount: number
  createdAt: string
  endsAt: string
  ended: boolean
  winners: string[]
}

// ==========================================================================
// Jogos (slash commands)
// ==========================================================================

export type GameId =
  | 'dado'
  | 'moeda'
  | 'ppt'
  | 'oitobola'
  | 'trivia'
  | 'forca'
  | 'blackjack'
  | 'jogodavelha'
  | 'duelo'
  | 'roleta'
  | 'cacaniqueis'
  | 'corrida'
  | 'numero'
  | 'desembaralhar'
  | 'termo'
  | 'minas'
  | 'crash'
  | 'memoria'
  | 'ship'
  | 'economia'

export interface GameInfo {
  id: GameId
  name: string
  command: string
  description: string
}

export interface GameSettings {
  enabled: Record<GameId, boolean>
}

// ==========================================================================
// Pontos de MOV. Call
// ==========================================================================

export type MovCallType = 'normal' | 'tematica'

export interface MovPointsEntry {
  userId: string
  tag: string
  points: number
  totalSeconds: number
}

export interface MovPointsBoardConfig {
  channelId: string | null
  channelName: string | null
}

export interface ExcludedMember {
  userId: string
  tag: string
}

/** Uma execução do /limparcdo — quem apagou, onde, quantas pediu e quantas foram mesmo apagadas. */
export interface CleanLogEntry {
  id: string
  date: string
  guildId: string
  channelId: string
  channelName: string
  actorId: string
  actorTag: string
  requested: number
  deleted: number
  /** Mensagens com mais de 14 dias — a Discord não as deixa apagar em massa. */
  skippedOld: number
  targetUserId: string | null
  targetTag: string | null
}

export type MovPointsLogAction = 'add_points' | 'remove_points' | 'add_hours' | 'remove_hours' | 'reset'

export const HOURS_LOG_ACTIONS: MovPointsLogAction[] = ['add_hours', 'remove_hours']

export interface MovPointsLogEntry {
  id: string
  guildId: string
  date: string
  action: MovPointsLogAction
  targetUserId: string | null
  targetTag: string | null
  amount: number | null
  newTotal: number | null
  actorTag: string
  note: string | null
}

// ==========================================================================
// Justificativas (fixas e diárias)
// ==========================================================================

export type JustificationType = 'fixed' | 'daily'

export type JustificationChannelKind = 'fixedPost' | 'dailyPost' | 'fixedLog' | 'dailyLog'

export interface JustificationSettings {
  fixedPostChannelId: string | null
  fixedPostChannelName: string | null
  dailyPostChannelId: string | null
  dailyPostChannelName: string | null
  fixedLogChannelId: string | null
  fixedLogChannelName: string | null
  dailyLogChannelId: string | null
  dailyLogChannelName: string | null
}

/**
 * Ligação opcional da app desktop a um bot remoto (o bot autónomo a correr num servidor) — usada para
 * gerir configurações contra o bot que está mesmo a atender o servidor, em vez de a app abrir a sua
 * própria ligação separada à Discord (o que faria cada lado gravar numa cópia diferente dos dados).
 * A chave de API nunca é devolvida à interface, só se está ou não definida.
 */
export interface RemoteBotConfig {
  url: string | null
  hasApiKey: boolean
}

// ==========================================================================
// Upamentos (metas de cargo)
// ==========================================================================

export interface RolePickerEntry {
  id: string
  name: string
  color: string
}

export interface RoleGoal {
  roleId: string
  roleName: string
  pointsGoal: number
  hoursGoal: number
}

export interface MemberProfile {
  id: string
  tag: string
  avatarUrl: string | null
  roles: RolePickerEntry[]
  points: number
  totalSeconds: number
}

// ==========================================================================
// Biblioteca de emojis do bot
// ==========================================================================

/**
 * Emoji da aplicação do bot (não de um servidor) — fica disponível em qualquer embed ou
 * mensagem que o bot envie, em qualquer servidor onde ele esteja, usando `<:nome:id>` (ou
 * `<a:nome:id>` se animado). É a Discord (via API da aplicação) que guarda isto, não a app —
 * por isso app e bot remoto veem sempre a mesma lista, sem risco de ficarem dessincronizados.
 */
export interface BotEmoji {
  id: string
  name: string
  animated: boolean
  url: string
}

// ==========================================================================
// Avisos MOV (/avisomov) — mensagens agendadas para um canal
// ==========================================================================

export type MovNoticeRepeat = 'none' | 'daily' | 'weekly'
export type MovNoticeStatus = 'pending' | 'sent' | 'failed' | 'cancelled'

export interface MovNotice {
  id: string
  guildId: string
  channelId: string
  channelName: string
  message: string
  mentionRoleId: string | null
  mentionRoleName: string | null
  repeat: MovNoticeRepeat
  dueAt: string
  createdAt: string
  createdById: string
  createdByTag: string
  createdByAvatar: string | null
  source: 'discord' | 'app'
  status: MovNoticeStatus
  sentAt?: string
  sentCount?: number
  error?: string
}

export interface MovNoticeInput {
  channelId: string
  message: string
  mentionRoleId: string | null
  repeat: MovNoticeRepeat
  dueAt: string
}

export const MOV_NOTICE_PLACEHOLDERS = ['{mensagem}', '{autor}', '{nomeAutor}', '{avatarAutor}', '{canal}', '{cargo}', '{servidor}'] as const

// ==========================================================================
// Verificação por foto
// ==========================================================================

export type VerificationButtonStyle = 'success' | 'primary' | 'secondary' | 'danger'

export interface VerificationSettings {
  /** Canal do painel — onde fica o embed com o botão "Verificar". */
  channelId: string | null
  channelName: string | null
  /** Mensagem do painel já publicada (para ser atualizada em vez de duplicada). */
  panelMessageId: string | null
  buttonLabel: string
  buttonEmoji: string
  buttonStyle: VerificationButtonStyle
  /** Categoria onde os canais de ticket são criados. */
  ticketCategoryId: string | null
  ticketCategoryName: string | null
  /** Nome do canal de ticket — {usuario}, {id}, {numero}. */
  ticketNameTemplate: string
  /** Quantos tickets cada membro pode abrir dentro da janela de tempo (gestão não tem limite). */
  maxTicketsPerWindow: number
  ticketWindowMinutes: number
  /** Mensagem no ticket depois de um gestor decidir — {estado}, {membro}, {moderador}, {segundos}. */
  closeMessage: string
  /** Cargo marcado na mensagem simples (sem embed) depois do embed com a foto. */
  pingRoleId: string | null
  pingRoleName: string | null
  /** Texto da marcação — {cargo} e {membro}. */
  pingText: string
  /** Textos dos botões da gestão no embed da foto. */
  claimLabel: string
  finishLabel: string
  cancelLabel: string
  staffPanelLabel: string
  /** Cargos que podem aprovar/recusar e que veem os tickets (além de quem tem Administrador). */
  approverRoleIds: string[]
  /** Cargos dados ao membro quando é aprovado (opcional). */
  addRoleIds: string[]
  /** Cargos tirados ao membro quando é aprovado (opcional, ex.: @Novato). */
  removeRoleIds: string[]
  /** Canal de log com o resultado de cada verificação (opcional). */
  logChannelId: string | null
  logChannelName: string | null
  /** Apagar texto do membro dentro do ticket (com aviso temporário) — só fotos contam. */
  deleteNonImage: boolean
}

export interface VerificationTicket {
  id: string
  guildId: string
  channelId: string
  channelName: string
  userId: string
  userTag: string
  number: number
  createdAt: string
  status: 'open' | 'closed'
  closedAt?: string
  closedByTag?: string
  result?: 'approved' | 'rejected' | 'closed'
}

export type VerificationStatus = 'pending' | 'approved' | 'rejected'

export interface VerificationEntry {
  id: string
  guildId: string
  channelId: string
  userId: string
  userTag: string
  userAvatar: string | null
  embedMessageId: string
  pingMessageId: string | null
  ticketId?: string
  imageCount: number
  claimedById?: string
  claimedByTag?: string
  claimedAt?: string
  /** Cargos escolhidos pelo gestor no painel staff (já dados ao membro). */
  manualRoleIds?: string[]
  cancelReason?: string
  createdAt: string
  status: VerificationStatus
  decidedAt?: string
  moderatorId?: string
  moderatorTag?: string
  rolesAdded?: string[]
  rolesRemoved?: string[]
}

export interface VerificationEvent {
  at: string
  level: 'info' | 'warn' | 'error'
  text: string
}

/** O que a página Verificação mostra no diagnóstico — tudo o que pode impedir a verificação de funcionar. */
export interface VerificationDiagnostics {
  checks: { label: string; ok: boolean; detail?: string }[]
  events: VerificationEvent[]
}

export const VERIFICATION_PANEL_PLACEHOLDERS = ['{servidor}'] as const
export const VERIFICATION_TICKET_PLACEHOLDERS = ['{membro}', '{nome}', '{avatar}', '{id}', '{numero}', '{cargo}', '{servidor}'] as const
export const TICKET_NAME_PLACEHOLDERS = ['{usuario}', '{id}', '{numero}'] as const
export const VERIFICATION_PLACEHOLDERS = ['{membro}', '{nome}', '{avatar}', '{id}', '{criada}', '{entrou}', '{responsavel}', '{estado}', '{servidor}'] as const
export const VERIFICATION_LOG_PLACEHOLDERS = ['{membro}', '{nome}', '{avatar}', '{id}', '{estado}', '{moderador}', '{responsavel}', '{cargosDados}', '{cargosTirados}', '{motivo}', '{ticket}', '{duracao}', '{servidor}'] as const
export const VERIFY_PLACEHOLDERS = ['{membro}', '{nome}', '{avatar}', '{pontos}', '{horas}', '{cargos}', '{cumpridos}', '{total}', '{servidor}'] as const
export const VERIFY_LINE_PLACEHOLDERS = ['{cargo}', '{cargoNome}', '{pontos}', '{metaPontos}', '{horas}', '{metaHoras}', '{faltamPontos}', '{faltamHoras}'] as const

// ==========================================================================
// Canais de log do servidor (mensagens apagadas/editadas, pontos, horas)
// ==========================================================================

export interface ServerLogSettings {
  messageDeleteChannelId: string | null
  messageDeleteChannelName: string | null
  messageEditChannelId: string | null
  messageEditChannelName: string | null
  pointsChannelId: string | null
  pointsChannelName: string | null
  hoursChannelId: string | null
  hoursChannelName: string | null
  /** Não registar mensagens de bots. */
  ignoreBots: boolean
}

export const LOG_DELETE_PLACEHOLDERS = ['{autor}', '{nomeAutor}', '{avatarAutor}', '{idAutor}', '{canal}', '{conteudo}', '{anexos}', '{apagadaPor}', '{enviadaEm}', '{idMensagem}'] as const
export const LOG_EDIT_PLACEHOLDERS = ['{autor}', '{nomeAutor}', '{avatarAutor}', '{idAutor}', '{canal}', '{antes}', '{depois}', '{link}'] as const
export const LOG_POINTS_PLACEHOLDERS = ['{membro}', '{nomeMembro}', '{acao}', '{quantidade}', '{total}', '{autor}', '{nota}'] as const
