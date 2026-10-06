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
  | 'verificationTicketCreated'
  | 'verificationTicketExisting'
  | 'verificationTicketLimit'
  | 'verificationClosedFinished'
  | 'verificationClosedCancelled'
  | 'verificationStaffFinished'
  | 'verificationStaffCancelled'
  | 'verificationStaffPanel'
  | 'verificationWarnText'
  | 'verificationWarnTooBig'
  | 'verificationSpamTimeout'
  | 'logMessageDelete'
  | 'logMessageEdit'
  | 'logPoints'
  | 'logHours'
  | 'movList'
  | 'voiceSessionLog'
  | 'profileCard'
  | 'profileRanking'
  | 'weeklyReport'
  | 'activityCard'
  | 'activityBoard'
  | 'activityReminder'
  | 'activityList'
  | 'lisfilmsTitle'
  | 'lisfilmsGame'
  | 'lisfilmsList'
  | 'lisfilmsSummary'
  | 'giveawayStart'
  | 'giveawayEnded'
  | 'giveawayWinners'
  | 'giveawayReroll'
  | 'giveawayNoEntrants'
  | 'giveawayWinnerDm'
  | 'giveawayWizardChannel'
  | 'giveawayWizardDetails'
  | 'giveawayWizardError'
  | 'giveawayWizardCreated'
  | 'giveawayWizardCancelled'
  | 'giveawayWizardTimeout'
  | 'activityOwnerAsk'
  | 'activityOwnerConfirmed'
  | 'activityOwnerDeclined'
  | 'activityCoverCall'
  | 'activityCoverTaken'
  | 'activityCoverUncovered'
  | 'dutiesPanel'
  | 'dutiesSummary'
  | 'dutiesMine'
  | 'dutyDetail'

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
  'verificationTicketCreated',
  'verificationTicketExisting',
  'verificationTicketLimit',
  'verificationClosedFinished',
  'verificationClosedCancelled',
  'verificationStaffFinished',
  'verificationStaffCancelled',
  'verificationStaffPanel',
  'verificationWarnText',
  'verificationWarnTooBig',
  'verificationSpamTimeout',
  'logMessageDelete',
  'logMessageEdit',
  'logPoints',
  'logHours',
  'movList',
  'voiceSessionLog',
  'profileCard',
  'profileRanking',
  'weeklyReport',
  'activityCard',
  'activityBoard',
  'activityReminder',
  'activityList',
  'lisfilmsTitle',
  'lisfilmsGame',
  'lisfilmsList',
  'lisfilmsSummary',
  'giveawayStart',
  'giveawayEnded',
  'giveawayWinners',
  'giveawayReroll',
  'giveawayNoEntrants',
  'giveawayWinnerDm',
  'giveawayWizardChannel',
  'giveawayWizardDetails',
  'giveawayWizardError',
  'giveawayWizardCreated',
  'giveawayWizardCancelled',
  'giveawayWizardTimeout',
  'activityOwnerAsk',
  'activityOwnerConfirmed',
  'activityOwnerDeclined',
  'activityCoverCall',
  'activityCoverTaken',
  'activityCoverUncovered',
  'dutiesPanel',
  'dutiesSummary',
  'dutiesMine',
  'dutyDetail',
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

export type ModerationAction =
  | 'ban'
  | 'unban'
  | 'kick'
  | 'timeout'
  | 'removeTimeout'
  | 'addRole'
  | 'removeRole'
  | 'nickname'
  | 'warn'
  | 'voiceDisconnect'
  | 'voiceMute'
  | 'voiceDeafen'
  | 'slowmode'
  | 'purge'
  | 'massRole'
  | 'createRole'
  | 'editRole'
  | 'deleteRole'

export type TimeoutDuration = 60_000 | 300_000 | 600_000 | 3_600_000 | 86_400_000 | 604_800_000

export interface ModerationLogEntry {
  id: string
  guildId: string
  guildName: string
  action: ModerationAction | 'lockChannel' | 'unlockChannel'
  targetTag: string
  reason: string | null
  date: string
  /** Pormenor extra (ex.: o cargo dado, a duração do castigo). */
  detail?: string | null
  /** Quem fez (utilizador da app). */
  actor?: string | null
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
  /** Nomes dos vencedores (para mostrar). */
  winners: string[]
  /** Descrição opcional (aparece em {descricao}). */
  description?: string
  /** Como se participa neste sorteio (fixado no momento da criação). */
  entryMode?: GiveawayEntryMode
  /** Participantes (modo botão). */
  entrants?: string[]
  /** IDs dos vencedores atuais (o reroll exclui quem já ganhou). */
  winnerIds?: string[]
  /** Todos os que já ganharam (incluindo rerolls anteriores). */
  pastWinnerIds?: string[]
  hostTag?: string
  /** Mensagem do anúncio dos vencedores. */
  resultMessageId?: string | null
}

export type GiveawayEntryMode = 'button' | 'reaction'

/** Uma mensagem do sorteio: texto normal por cima e, opcionalmente, o embed (personalizável). */
export interface GiveawayMessage {
  embed: boolean
  content: string
}

export interface GiveawaySettings {
  entryMode: GiveawayEntryMode
  reactionEmoji: string
  joinButton: CustomButton
  participantsButton: CustomButton
  rerollButton: CustomButton
  /** Quem pode participar (vazio = toda a gente). */
  requiredRoleIds: string[]
  /** Quem pode rerolar/terminar pelos botões, além de Gerir servidor. */
  managerRoleIds: string[]
  mentionRoleId: string | null
  /** Segundo clique no botão = sair do sorteio. */
  allowLeave: boolean
  dmWinners: boolean
  start: GiveawayMessage
  ended: GiveawayMessage
  winners: GiveawayMessage
  reroll: GiveawayMessage
  noEntrants: GiveawayMessage
  winnerDm: GiveawayMessage
  /** Linha de cada participante na lista (botão Participantes) — {posicao}, {membro}. */
  participantLine: string
  replyJoined: string
  replyLeft: string
  replyAlready: string
  replyEnded: string
  replyNoRole: string
  replyNoPermission: string
  replyRerollDone: string
  replyRerollEmpty: string
  replyNoParticipants: string
  /** O assistente do /sorteio no Discord (só quem o usa vê). */
  wizard: GiveawayWizardSettings
}

export interface GiveawayWizardSettings {
  selectPlaceholder: string
  writeButton: CustomButton
  backButton: CustomButton
  cancelButton: CustomButton
  modalTitle: string
  prizeLabel: string
  prizePlaceholder: string
  durationLabel: string
  durationPlaceholder: string
  descriptionLabel: string
  descriptionPlaceholder: string
  winnersLabel: string
  winnersPlaceholder: string
  errorPrize: string
  errorDuration: string
  errorWinners: string
  creatingText: string
}

export const GIVEAWAY_WIZARD_PLACEHOLDERS = ['{canal}', '{premio}', '{vencedores}', '{termina}', '{link}', '{erro}', '{membro}', '{servidor}'] as const

export interface GiveawayState {
  settings: GiveawaySettings
  giveaways: Giveaway[]
  message?: string
}

export type GiveawayAction =
  | { kind: 'create'; channelId: string; prize: string; description: string; durationMs: number; winnerCount: number; actor?: string }
  | { kind: 'end'; id: string }
  | { kind: 'reroll'; id: string }
  | { kind: 'delete'; id: string }

export const GIVEAWAY_PLACEHOLDERS = [
  '{premio}',
  '{descricao}',
  '{vencedores}',
  '{ganhadores}',
  '{participantes}',
  '{termina}',
  '{terminaData}',
  '{criador}',
  '{emoji}',
  '{link}',
  '{servidor}',
] as const

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
  /** Emoji (normal ou do bot, `<:nome:id>`) e cor de cada botão da gestão. */
  claimEmoji: string
  finishEmoji: string
  cancelEmoji: string
  staffPanelEmoji: string
  claimStyle: VerificationButtonStyle
  finishStyle: VerificationButtonStyle
  cancelStyle: VerificationButtonStyle
  staffPanelStyle: VerificationButtonStyle
  /** Textos do {estado} em cada fase do ticket (aceitam emojis do bot). */
  stateWaitingPrint: string
  stateWaitingVerifier: string
  stateVerifying: string
  stateVerified: string
  stateCancelled: string
  /** Texto do {responsavel}: sem ninguém / depois de alguém assumir ({gestor} = menção, {gestorNome} = nome). */
  responsibleNone: string
  responsibleClaimed: string
  /** Texto do botão "Assumir" depois de alguém assumir ({gestor} = nome — botões não aceitam menções). */
  claimedButtonLabel: string
  /** Segundos até o ticket ser apagado depois de finalizado/cancelado. */
  closeDelaySeconds: number
  /** Segundos até o aviso no ticket (texto em vez de print, imagem grande) desaparecer. */
  warningSeconds: number
  /** Modo lento do canal de ticket, em segundos (0 = desligado). A gestão não é afetada. */
  ticketSlowmodeSeconds: number
  /** Modo castigo: quem mandar `spamMaxMessages` mensagens em `spamWindowSeconds` no ticket leva timeout. */
  spamProtection: boolean
  spamMaxMessages: number
  spamWindowSeconds: number
  spamTimeoutMinutes: number
  /** Painel staff (só o gestor vê): botão Finalizar próprio e textos das respostas. */
  staffPanelFinishLabel: string
  staffPanelFinishEmoji: string
  staffPanelFinishStyle: VerificationButtonStyle
  /** Texto dentro do seletor de cargos. */
  staffPanelSelectPlaceholder: string
  /** {cargosEscolhidos} sem nenhum cargo. */
  staffPanelNoRoles: string
  /** {cargosDar}/{cargosTirar}/{aoFinalizar} vazios. */
  staffPanelNothingExtra: string
  /** Notas ({nota}) depois de mexer nos cargos — {cargos} = os cargos em causa. */
  staffPanelRolesUpdated: string
  staffPanelRolesRefused: string
  staffPanelRolesFailed: string
  staffPanelMemberLeft: string
  staffPanelAlreadyDecided: string
  /** Botão de link "Ir para o ticket" nas respostas do botão Verificar (links são sempre cinzentos). */
  ticketLinkLabel: string
  ticketLinkEmoji: string
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
  /** Mensagem com a foto (separada da mensagem de abertura do ticket, onde estão os botões). */
  photoMessageId?: string
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
export const VERIFICATION_TICKET_PLACEHOLDERS = ['{membro}', '{mencao}', '{nome}', '{avatar}', '{id}', '{numero}', '{responsavel}', '{gestor}', '{estado}', '{cargo}', '{servidor}'] as const
export const VERIFICATION_REPLY_PLACEHOLDERS = ['{membro}', '{canal}', '{numero}', '{max}', '{janela}', '{tempo}', '{servidor}'] as const
export const VERIFICATION_CLOSE_PLACEHOLDERS = ['{membro}', '{moderador}', '{mencao}', '{responsavel}', '{estado}', '{motivo}', '{segundos}', '{numero}', '{servidor}'] as const
export const VERIFICATION_STAFF_PANEL_PLACEHOLDERS = ['{membro}', '{nome}', '{avatar}', '{id}', '{numero}', '{gestor}', '{cargosEscolhidos}', '{cargosDar}', '{cargosTirar}', '{aoFinalizar}', '{finalizar}', '{nota}', '{servidor}'] as const
export const VERIFICATION_WARN_PLACEHOLDERS = ['{membro}', '{nome}', '{segundos}', '{tamanho}', '{servidor}'] as const
export const VERIFICATION_SPAM_PLACEHOLDERS = ['{membro}', '{nome}', '{minutos}', '{mensagens}', '{segundos}', '{servidor}'] as const
export const TICKET_NAME_PLACEHOLDERS = ['{usuario}', '{id}', '{numero}'] as const
export const VERIFICATION_PLACEHOLDERS = ['{membro}', '{nome}', '{avatar}', '{id}', '{criada}', '{entrou}', '{responsavel}', '{estado}', '{servidor}'] as const
export const VERIFICATION_LOG_PLACEHOLDERS = ['{membro}', '{nome}', '{avatar}', '{id}', '{estado}', '{moderador}', '{responsavel}', '{cargosDados}', '{cargosTirados}', '{motivo}', '{ticket}', '{duracao}', '{servidor}'] as const
export const VERIFY_PLACEHOLDERS = ['{membro}', '{nome}', '{avatar}', '{pontos}', '{horas}', '{cargos}', '{cumpridos}', '{total}', '{servidor}'] as const
export const VERIFY_LINE_PLACEHOLDERS = ['{cargo}', '{cargoNome}', '{pontos}', '{metaPontos}', '{horas}', '{metaHoras}', '{faltamPontos}', '{faltamHoras}'] as const

// ==========================================================================
// Listagem de Mov Call
// ==========================================================================

/** Um membro na listagem de Mov Call — a ordem da lista é a ordem de entrada (dá o número). */
export interface MovListMember {
  userId: string
  /** Nome de utilizador (@usuario). */
  username: string
  /** Nome mostrado no servidor (apelido), guardado para a app e para o "Copiar listagem". */
  displayName: string
  addedAt: string
  addedByTag: string | null
}

export interface MovListSettings {
  /** Canal onde fica a mensagem da listagem (com os botões). */
  channelId: string | null
  channelName: string | null
  messageId: string | null
  /** Linha de cada membro — {numero}, {mencao}, {id}, {nome}, {usuario}. */
  lineFormat: string
  /** Linha em branco entre membros (como no exemplo: 1. …⏎⏎2. …). */
  blankLineBetween: boolean
  /** Texto quando a lista está vazia. */
  emptyText: string
  /** Membros por página na mensagem (mais do que isto → botões ◀ ▶). */
  perPage: number
  /** Botões da mensagem. */
  addLabel: string
  addEmoji: string
  addStyle: VerificationButtonStyle
  removeLabel: string
  removeEmoji: string
  removeStyle: VerificationButtonStyle
  copyLabel: string
  copyEmoji: string
  copyStyle: VerificationButtonStyle
  prevLabel: string
  prevEmoji: string
  nextLabel: string
  nextEmoji: string
  pageStyle: VerificationButtonStyle
  /** Botões secundários dentro das janelas de adicionar/remover. */
  byIdLabel: string
  byIdEmoji: string
  byIdStyle: VerificationButtonStyle
  /** Quem pode adicionar/remover (além de Administrador / Gerir servidor). */
  managerRoleIds: string[]
  /** "Copiar listagem" para todos (senão só quem gere). */
  copyForEveryone: boolean
  /** Linha de cada membro no texto copiado — mesmos tokens da linha. */
  copyFormat: string
  /** Cabeçalho do texto copiado — {total}, {data}, {servidor}. */
  copyHeader: string
  /** Mostrar o texto copiado num bloco de código (fácil de selecionar). */
  copyAsCodeBlock: boolean
  /** Textos das janelas e respostas (só quem clicou vê). */
  addPrompt: string
  removePrompt: string
  selectPlaceholder: string
  replyAdded: string
  replyRemoved: string
  replyAlready: string
  replyNothing: string
  replyNoPermission: string
  /** Canal de log de quem mexeu na listagem (opcional). */
  logChannelId: string | null
  logChannelName: string | null
  logAdded: string
  logRemoved: string
}

/** O que a app mexe na lista de membros. */
export type MovListOp =
  | { kind: 'add'; userIds: string[] }
  | { kind: 'remove'; userIds: string[] }
  | { kind: 'move'; userId: string; delta: number }
  | { kind: 'importRole'; roleId: string }
  | { kind: 'clear' }

export interface MovListState {
  settings: MovListSettings
  members: MovListMember[]
  /** Resumo da última operação (ex.: "3 adicionados, 1 já estava"). */
  message?: string
}

export const MOV_LIST_PLACEHOLDERS = ['{listagem}', '{total}', '{pagina}', '{paginas}', '{atualizado}', '{servidor}'] as const
export const MOV_LIST_LINE_PLACEHOLDERS = ['{numero}', '{mencao}', '{id}', '{nome}', '{usuario}'] as const
export const MOV_LIST_REPLY_PLACEHOLDERS = ['{membros}', '{quantidade}', '{total}', '{autor}'] as const
export const MOV_LIST_COPY_HEADER_PLACEHOLDERS = ['{total}', '{data}', '{servidor}'] as const

// ==========================================================================
// Horas automáticas (tempo em call)
// ==========================================================================

/** Botão configurável (texto, emoji normal ou do bot, cor) e se aparece. */
export interface CustomButton {
  show: boolean
  label: string
  emoji: string
  style: VerificationButtonStyle
}

/** Botão de link (sempre cinzento na Discord) com URL própria. */
export interface CustomLinkButton {
  show: boolean
  label: string
  emoji: string
  url: string
}

export interface VoiceHoursSettings {
  enabled: boolean
  /** Canais de voz: todos, só os escolhidos, ou todos menos os escolhidos. */
  channelMode: 'all' | 'only' | 'except'
  channelIds: string[]
  /** Só conta quem tem um destes cargos (vazio = toda a gente). */
  roleIds: string[]
  /** Membros que nunca contam. */
  ignoredUserIds: string[]
  /** Mínimo de pessoas (sem bots) na call para contar — 2 = não conta quem está sozinho. */
  minMembers: number
  ignoreSelfMuted: boolean
  ignoreSelfDeafened: boolean
  ignoreServerMuted: boolean
  ignoreAfkChannel: boolean
  /** Sessões mais curtas do que isto não contam. */
  minSessionMinutes: number
  /** Máximo de horas automáticas por dia por membro (0 = sem limite). */
  dailyCapHours: number
  /** Canal onde cada sessão creditada é registada (opcional). */
  logChannelId: string | null
  logChannelName: string | null
  /** Só regista no canal sessões com pelo menos estes minutos (evita spam de sessões curtas). */
  logMinMinutes: number
  /** Textos do motivo de não contar (mostrados na app e em {estadoCall} do /perfil). */
  statusCounting: string
  statusPaused: string
}

export type VoiceStatusReason = 'counting' | 'alone' | 'selfMuted' | 'selfDeafened' | 'serverMuted' | 'afk' | 'channel' | 'role' | 'ignored' | 'cap'

/** Quem está em call agora, e se está a contar. */
export interface VoiceLiveEntry {
  userId: string
  tag: string
  channelId: string
  channelName: string
  reason: VoiceStatusReason
  /** Segundos já acumulados na sessão em curso. */
  sessionSeconds: number
  startedAt: string | null
}

/** Sessão já creditada (histórico). */
export interface VoiceSessionRecord {
  id: string
  guildId: string
  userId: string
  tag: string
  channelName: string
  startedAt: string
  endedAt: string
  seconds: number
  /** false = foi descartada (curta demais, limite diário, ou à mão). */
  credited: boolean
  note?: string
}

export interface VoiceHoursState {
  settings: VoiceHoursSettings
  live: VoiceLiveEntry[]
  recent: VoiceSessionRecord[]
  voiceChannels: ChannelPickerEntry[]
  /** O bot está ligado e consegue ver as calls. */
  connected: boolean
}

export type VoiceHoursAction = { kind: 'end'; userId: string } | { kind: 'discard'; userId: string }

export const VOICE_LOG_PLACEHOLDERS = ['{membro}', '{nome}', '{avatar}', '{canal}', '{duracao}', '{total}', '{inicio}', '{fim}', '{servidor}'] as const

// ==========================================================================
// /perfil
// ==========================================================================

export interface ProfileSettings {
  /** Só quem usou o comando vê a resposta. */
  ephemeral: boolean
  /** Deixa ver o perfil de outras pessoas (senão só o próprio, exceto a gestão). */
  allowOthers: boolean
  /** Linha de cada meta — {cargo}, {cargoNome}, {progresso}, {percent}, {progressoPontos}, {percentPontos}, {progressoHoras}, {percentHoras}, {pontos}, {metaPontos}, {horas}, {metaHoras}, {estado}. */
  goalLineFormat: string
  goalMet: string
  goalNotMet: string
  goalsEmpty: string
  /** Barra de progresso — cada caractere pode ser um emoji (também do bot). */
  barFilled: string
  barEmpty: string
  barLength: number
  /** {emCall} quando a pessoa está/não está em call — {canal}, {duracao}, {estadoCall}. */
  inCallText: string
  notInCallText: string
  /** Linha de cada membro no ranking — {posicao}, {membro}, {nome}, {pontos}, {horas}. */
  rankingLineFormat: string
  rankingSize: number
  refreshButton: CustomButton
  rankingButton: CustomButton
  linkButton: CustomLinkButton
}

export const PROFILE_PLACEHOLDERS = [
  '{membro}',
  '{nome}',
  '{avatar}',
  '{id}',
  '{pontos}',
  '{horas}',
  '{posicao}',
  '{totalMembros}',
  '{pontosSemana}',
  '{horasSemana}',
  '{metas}',
  '{metasCumpridas}',
  '{metasTotal}',
  '{emCall}',
  '{entrou}',
  '{cargoMaisAlto}',
  '{servidor}',
] as const
export const PROFILE_GOAL_PLACEHOLDERS = ['{cargo}', '{cargoNome}', '{progresso}', '{percent}', '{progressoPontos}', '{percentPontos}', '{progressoHoras}', '{percentHoras}', '{pontos}', '{metaPontos}', '{horas}', '{metaHoras}', '{estado}'] as const
export const PROFILE_RANKING_PLACEHOLDERS = ['{lista}', '{posicao}', '{total}', '{servidor}'] as const
export const RANKING_LINE_PLACEHOLDERS = ['{posicao}', '{membro}', '{nome}', '{pontos}', '{horas}'] as const

// ==========================================================================
// Relatório semanal
// ==========================================================================

export interface WeeklyReportSettings {
  enabled: boolean
  channelId: string | null
  channelName: string | null
  /** 0 = domingo … 6 = sábado. */
  dayOfWeek: number
  hour: number
  minute: number
  timezone: string
  /** Cargo marcado por cima do relatório (opcional). */
  mentionRoleId: string | null
  /** Quem entra nas listas (inativos, prontos para upar) — vazio = toda a gente. */
  roleIds: string[]
  topCount: number
  /** Linhas — {posicao}, {membro}, {nome}, {valor}. */
  topLineFormat: string
  /** Inativo = menos de X horas e Y pontos no período. */
  inactiveMaxHours: number
  inactiveMaxPoints: number
  inactiveLineFormat: string
  inactiveLimit: number
  /** Prontos para upar — {membro}, {nome}, {cargo}. */
  readyLineFormat: string
  emptyText: string
  copyButton: CustomButton
  rankingButton: CustomButton
  linkButton: CustomLinkButton
}

export interface WeeklyReportState {
  settings: WeeklyReportSettings
  lastSentAt: string | null
  periodStart: string
  nextAt: string | null
  /** Valores reais dos tokens agora (para a pré-visualização na app). */
  preview?: Record<string, string>
  message?: string
}

export type WeeklyReportAction = { kind: 'preview' } | { kind: 'send' } | { kind: 'resetPeriod' }

export const WEEKLY_REPORT_PLACEHOLDERS = [
  '{periodo}',
  '{inicio}',
  '{fim}',
  '{topPontos}',
  '{topHoras}',
  '{inativos}',
  '{totalInativos}',
  '{prontos}',
  '{totalProntos}',
  '{pontosSemana}',
  '{horasSemana}',
  '{membrosAtivos}',
  '{sessoesCall}',
  '{verificados}',
  '{cancelados}',
  '{servidor}',
] as const
export const WEEKLY_LINE_PLACEHOLDERS = ['{posicao}', '{membro}', '{nome}', '{valor}'] as const

// ==========================================================================
// Agenda de atividades
// ==========================================================================

export interface ActivityCategory {
  id: string
  name: string
  emoji: string
  /** Cor hex da barra do embed das atividades desta categoria. */
  color: string
}

export interface ActivityPerson {
  userId: string
  tag: string
  at: string
}

export type ActivityStatus = 'scheduled' | 'cancelled' | 'done'

/**
 * asked = o dono recebeu a DM e ainda não respondeu · confirmed = o dono confirmou ·
 * searching = à procura de um supervisor (DMs enviadas) · covered = um supervisor assumiu ·
 * uncovered = começou sem ninguém assumir.
 */
export type ActivityCoverState = 'asked' | 'confirmed' | 'searching' | 'covered' | 'uncovered'

export interface ActivityMessageRef {
  channelId: string
  messageId: string
}

export interface ActivityCover {
  state: ActivityCoverState
  askedAt: string
  ownerId: string | null
  ownerTag: string | null
  ownerMessage: ActivityMessageRef | null
  /** As mensagens de chamada aos supervisores (DMs + mensagem geral) — todas mudam quando alguém assume. */
  messages: ActivityMessageRef[]
  /** Porque se foi à procura: o dono disse que não pode, não respondeu, ou não havia dono. */
  reason: 'declined' | 'noAnswer' | 'noOwner' | 'manual' | null
  escalatedAt: string | null
  coveredBy: ActivityPerson | null
  /** Quantos supervisores receberam a DM. */
  notified: number
}
export interface Activity {
  id: string
  guildId: string
  /** Número curto (#12) usado nos comandos. */
  number: number
  title: string
  description: string
  categoryId: string
  /** Início (ISO, UTC). */
  startAt: string
  durationMinutes: number
  /** Onde acontece: um canal (voz/texto) e/ou um texto livre. */
  locationChannelId: string | null
  locationText: string
  responsibleId: string | null
  responsibleTag: string | null
  /** 0 = sem limite. */
  participantSlots: number
  organizerSlots: number
  participants: ActivityPerson[]
  organizers: ActivityPerson[]
  unavailable: ActivityPerson[]
  status: ActivityStatus
  cancelReason?: string
  /** Mensagem da atividade no canal da agenda. */
  messageId: string | null
  /** Lembretes já enviados (minutos antes). */
  remindersSent: number[]
  /** Confirmação do dono e, se ele não puder, a procura de um supervisor. */
  cover?: ActivityCover | null
  createdByTag: string
  createdAt: string
  updatedAt: string
}

export interface ActivityInput {
  id?: string
  title: string
  description: string
  categoryId: string
  /** Data e hora no fuso da agenda. */
  date: string
  time: string
  durationMinutes: number
  locationChannelId: string | null
  locationText: string
  responsibleId: string | null
  participantSlots: number
  organizerSlots: number
  /** Gravar mesmo com conflito de horário. */
  force?: boolean
}

export type ActivityConflictMode = 'off' | 'responsible' | 'location' | 'all'

export interface CalendarSettings {
  /** Canal onde cada atividade é publicada (com os botões). */
  channelId: string | null
  channelName: string | null
  timezone: string
  categories: ActivityCategory[]
  /** Quem pode criar, editar e cancelar (além de Administrador / Gerir servidor). */
  managerRoleIds: string[]
  /** Quem pode ocupar as vagas de organizador (vazio = qualquer pessoa). */
  organizerRoleIds: string[]
  /** Quem pode confirmar participação (vazio = qualquer pessoa). */
  participantRoleIds: string[]
  /** Que atividades não podem sobrepor-se. */
  conflictMode: ActivityConflictMode
  /** Impede a mesma pessoa de confirmar duas atividades à mesma hora. */
  blockPersonConflicts: boolean
  /** Minutos antes do início em que o bot lembra (0 = na hora). */
  reminderMinutes: number[]
  reminderTarget: 'channel' | 'dm' | 'both'
  /** Canal dos lembretes (vazio = o canal da agenda). */
  reminderChannelId: string | null
  reminderMentionRoleId: string | null
  /** Painel com a agenda dos próximos dias (mensagem fixa atualizada sozinha). */
  boardEnabled: boolean
  boardChannelId: string | null
  boardMessageId: string | null
  boardDays: number
  /** Linha de cada atividade no painel/lista — {hora}, {emoji}, {titulo}, {categoria}, {responsavel}, {vagas}, {numero}, {estado}. */
  boardLineFormat: string
  /** Cabeçalho de cada dia — {dia}, {data}. */
  boardDayFormat: string
  boardEmptyText: string
  /** Texto de quem confirmou/organiza/não pode — {membro}. */
  personLineFormat: string
  emptyPeopleText: string
  /** Textos do {estado}. */
  statusOpen: string
  statusFull: string
  statusCancelled: string
  statusDone: string
  statusLive: string
  /** Apagar a mensagem da atividade quando é cancelada (senão fica marcada como cancelada). */
  deleteOnCancel: boolean
  joinButton: CustomButton
  unavailableButton: CustomButton
  organizeButton: CustomButton
  leaveButton: CustomButton
  /** Respostas a quem clica (só essa pessoa vê) — {titulo}, {numero}. */
  replyJoined: string
  replyOrganizing: string
  replyUnavailable: string
  replyLeft: string
  replyFull: string
  replyConflict: string
  replyNoPermission: string
  replyClosed: string
  /** ---- Dono da mov + supervisores ---- */
  coverEnabled: boolean
  /** Minutos antes do início em que o dono recebe a DM a perguntar se vai conseguir. */
  coverAskMinutes: number
  /** Se o dono não responder em X minutos, vai-se logo à procura de um supervisor (0 = espera até ao início). */
  coverOwnerTimeoutMinutes: number
  /** Só estas categorias (vazio = todas). */
  coverCategoryIds: string[]
  /** Quem é supervisor (recebe a DM e pode assumir). */
  supervisorRoleIds: string[]
  coverDmSupervisors: boolean
  /** Canal da mensagem geral para os supervisores (opcional). */
  coverChannelId: string | null
  coverMentionRole: boolean
  /** Avisar no início se ninguém assumiu. */
  coverAlertAtStart: boolean
  ownerConfirmButton: CustomButton
  ownerDeclineButton: CustomButton
  supervisorTakeButton: CustomButton
  replyOwnerConfirmed: string
  replyOwnerDeclined: string
  replyTaken: string
  replyAlreadyTaken: string
  replyNotSupervisor: string
  replyCoverClosed: string
  /** O {motivo} da chamada aos supervisores. */
  coverReasonDeclined: string
  coverReasonNoAnswer: string
  coverReasonNoOwner: string
  coverReasonManual: string
}

export interface CalendarState {
  settings: CalendarSettings
  activities: Activity[]
  message?: string
}

export type ActivityAction =
  | { kind: 'cancel'; id: string; reason?: string }
  | { kind: 'delete'; id: string }
  | { kind: 'repost'; id: string }
  | { kind: 'removePerson'; id: string; userId: string }
  | { kind: 'refreshBoard' }
  | { kind: 'coverAsk'; id: string }
  | { kind: 'coverEscalate'; id: string }
  | { kind: 'coverReset'; id: string }

export const ACTIVITY_CARD_PLACEHOLDERS = [
  '{titulo}',
  '{descricao}',
  '{numero}',
  '{categoria}',
  '{emoji}',
  '{data}',
  '{hora}',
  '{fim}',
  '{inicio}',
  '{relativo}',
  '{duracao}',
  '{local}',
  '{responsavel}',
  '{participantes}',
  '{vagasParticipantes}',
  '{organizadores}',
  '{vagasOrganizadores}',
  '{indisponiveis}',
  '{estado}',
  '{servidor}',
] as const
export const ACTIVITY_COVER_PLACEHOLDERS = [
  '{titulo}',
  '{numero}',
  '{categoria}',
  '{emoji}',
  '{data}',
  '{hora}',
  '{inicio}',
  '{relativo}',
  '{local}',
  '{dono}',
  '{supervisor}',
  '{supervisores}',
  '{motivo}',
  '{link}',
  '{servidor}',
] as const
export const ACTIVITY_BOARD_PLACEHOLDERS = ['{agenda}', '{dias}', '{total}', '{atualizado}', '{servidor}'] as const
export const ACTIVITY_REMINDER_PLACEHOLDERS = ['{titulo}', '{numero}', '{categoria}', '{emoji}', '{inicio}', '{relativo}', '{minutos}', '{local}', '{responsavel}', '{participantes}', '{link}', '{servidor}'] as const
export const ACTIVITY_LIST_PLACEHOLDERS = ['{lista}', '{total}', '{filtros}', '{servidor}'] as const
export const ACTIVITY_LINE_PLACEHOLDERS = ['{hora}', '{data}', '{emoji}', '{titulo}', '{categoria}', '{responsavel}', '{vagas}', '{numero}', '{estado}'] as const

// ==========================================================================
// LisFilms (integração com o site de reviews)
// ==========================================================================

export type LisFilmsMedia = 'movies' | 'series' | 'animes'

export interface LisFilmsCommandToggles {
  procurar: boolean
  titulo: boolean
  jogo: boolean
  top: boolean
  resumo: boolean
  destaque: boolean
  utilizador: boolean
}

export interface LisFilmsSettings {
  /** API pública do LisFilms (Render). */
  apiUrl: string
  /** Site, para os links "Ver no LisFilms". */
  siteUrl: string
  /** Liga/desliga o /lisfilms inteiro. */
  enabled: boolean
  commands: LisFilmsCommandToggles
  /** Respostas só para quem usou o comando. */
  ephemeral: boolean
  /** Quantos resultados nas listas (procurar, top, utilizadores). */
  resultsLimit: number
  /** Botão de link para o site em cada resposta. */
  linkButton: { show: boolean; label: string; emoji: string }
  /** Mostrar o menu "abrir um resultado" debaixo das pesquisas. */
  pickMenu: boolean
  pickPlaceholder: string
  /** Texto quando a API não responde (o Render gratuito pode estar a acordar). */
  offlineText: string
  notFoundText: string
}

export interface LisFilmsSummary {
  filmes: number
  series: number
  reviews: number
  utilizadores: number
  media_global: number | null
}

export interface LisFilmsStatus {
  ok: boolean
  latencyMs: number | null
  error?: string
  summary?: LisFilmsSummary
}

export interface LisFilmsHit {
  media: LisFilmsMedia | 'games' | 'users'
  /** id interno (filmes/séries/animes/utilizadores) ou rawg_id (jogos). */
  id: number
  title: string
  year: number | null
  subtitle: string | null
  image: string | null
  url: string
}

export interface LisFilmsState {
  settings: LisFilmsSettings
}

export const LISFILMS_TITLE_PLACEHOLDERS = ['{titulo}', '{tipo}', '{ano}', '{genero}', '{sinopse}', '{notaLisFilms}', '{estrelas}', '{avaliacoes}', '{notaTmdb}', '{poster}', '{link}', '{servidor}'] as const
export const LISFILMS_GAME_PLACEHOLDERS = ['{nome}', '{ano}', '{lancamento}', '{generos}', '{plataformas}', '{estudio}', '{editora}', '{metacritic}', '{duracao}', '{notaLisGames}', '{estrelas}', '{avaliacoes}', '{sinopse}', '{capa}', '{link}', '{servidor}'] as const
export const LISFILMS_LIST_PLACEHOLDERS = ['{titulo}', '{lista}', '{total}', '{termo}', '{link}', '{servidor}'] as const
export const LISFILMS_SUMMARY_PLACEHOLDERS = ['{filmes}', '{series}', '{reviews}', '{utilizadores}', '{media}', '{topUtilizadores}', '{emAlta}', '{link}', '{servidor}'] as const

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

// ==========================================================================
// Moderação (painel completo na app)
// ==========================================================================

export interface ModerationRole extends RolePickerEntry {
  position: number
  memberCount: number
  /** Cargo de integração (bots/boost) — não se pode dar nem tirar. */
  managed: boolean
  /** O bot consegue dar/tirar (está abaixo do cargo mais alto do bot). */
  editable: boolean
  hoist: boolean
  mentionable: boolean
}

export interface ModerationMember {
  id: string
  tag: string
  displayName: string
  nickname: string | null
  avatarUrl: string | null
  isBot: boolean
  isOwner: boolean
  timedOutUntil: string | null
  joinedAt: string | null
  createdAt: string
  roleIds: string[]
  /** Em que call está (se estiver). */
  voiceChannelId: string | null
  voiceChannelName: string | null
  serverMuted: boolean
  serverDeafened: boolean
  kickable: boolean
  bannable: boolean
  moderatable: boolean
  manageable: boolean
}

export interface ModerationBan {
  userId: string
  tag: string
  avatarUrl: string | null
  reason: string | null
}

export interface ModerationState {
  roles: ModerationRole[]
  log: ModerationLogEntry[]
  botHighestPosition: number
}

export type ModerationOp =
  | { kind: 'ban'; userId: string; reason: string; deleteMessageSeconds: number }
  | { kind: 'unban'; userId: string; reason: string }
  | { kind: 'kick'; userId: string; reason: string }
  | { kind: 'timeout'; userId: string; durationMs: number; reason: string }
  | { kind: 'removeTimeout'; userId: string }
  | { kind: 'addRole'; userId: string; roleId: string; reason: string }
  | { kind: 'removeRole'; userId: string; roleId: string; reason: string }
  | { kind: 'nickname'; userId: string; nickname: string }
  | { kind: 'warn'; userId: string; reason: string }
  | { kind: 'voiceDisconnect'; userId: string }
  | { kind: 'voiceMute'; userId: string; on: boolean }
  | { kind: 'voiceDeafen'; userId: string; on: boolean }
  | { kind: 'lockChannel'; channelId: string }
  | { kind: 'unlockChannel'; channelId: string }
  | { kind: 'slowmode'; channelId: string; seconds: number }
  | { kind: 'purge'; channelId: string; count: number; userId?: string | null }
  | { kind: 'massRole'; roleId: string; mode: 'add' | 'remove'; filterRoleId: string | null }
  | { kind: 'createRole'; name: string; color: string; hoist: boolean; mentionable: boolean }
  | { kind: 'editRole'; roleId: string; name: string; color: string; hoist: boolean; mentionable: boolean }
  | { kind: 'deleteRole'; roleId: string }

export interface ModerationResult {
  message: string
  member?: ModerationMember | null
  state?: ModerationState
}

// ==========================================================================
// Funções da gestão (painel com quem cuida de quê)
// ==========================================================================

export interface DutyAssignee {
  kind: 'user' | 'role'
  id: string
  /** Nome guardado para mostrar na app (e no texto simples). */
  name: string
}

export interface DutySubItem {
  id: string
  label: string
  assignees: DutyAssignee[]
}

export interface Duty {
  id: string
  title: string
  /** Texto extra a seguir ao título (ex.: "em #verificação durante o dia"). */
  note: string
  /** Descrição que aparece ao ver a função em detalhe. */
  description: string
  assignees: DutyAssignee[]
  /** Divisões da função (ex.: um responsável por dia da semana). */
  subItems: DutySubItem[]
}

export type DutyButtonKind = 'summary' | 'mine' | 'link' | 'message'

export interface DutyPanelButton extends CustomButton {
  id: string
  kind: DutyButtonKind
  /** Para 'link'. */
  url: string
  /** Para 'message' — o texto que aparece (só a quem clica). */
  text: string
}

export interface DutiesSettings {
  channelId: string | null
  channelName: string | null
  messageId: string | null
  /** Embed (personalizável) ou texto simples, como uma mensagem normal. */
  useEmbed: boolean
  /** Texto do painel quando não é embed — {funcoes}, {servidor}, {atualizado}. */
  plainTemplate: string
  /** Linha de cada função — {seta}, {funcao}, {nota}, {responsaveis}, {numero}. */
  lineFormat: string
  /** Linha de uma função dividida (com divisões por baixo) — {seta}, {funcao}, {nota}, {numero}. */
  groupLineFormat: string
  /** Linha de cada divisão — {item}, {responsaveis}. */
  subLineFormat: string
  /** Emoji/seta antes de cada função ({seta}). */
  arrow: string
  /** Entre responsáveis. */
  separator: string
  emptyAssignee: string
  /** Linha em branco entre funções. */
  spacing: boolean
  /** Menções no painel notificam as pessoas? */
  pingOnPublish: boolean
  duties: Duty[]
  buttons: DutyPanelButton[]
  /** Menu "escolhe uma função" para ver o detalhe de cada uma. */
  showSelect: boolean
  selectPlaceholder: string
  /** Linha de cada pessoa no resumo — {membro}, {funcoes}, {total}. */
  summaryLineFormat: string
  /** Linha de cada função em "as minhas funções" — {seta}, {funcao}, {item}. */
  mineLineFormat: string
  replyNoDuties: string
  /** Respostas do painel só para quem clica. */
  ephemeral: boolean
}

export interface DutiesState {
  settings: DutiesSettings
  message?: string
}

export type DutiesAction = { kind: 'publish' } | { kind: 'remove' }

export const DUTIES_PANEL_PLACEHOLDERS = ['{funcoes}', '{total}', '{atualizado}', '{servidor}'] as const
export const DUTIES_SUMMARY_PLACEHOLDERS = ['{resumo}', '{semResponsavel}', '{total}', '{pessoas}', '{servidor}'] as const
export const DUTIES_MINE_PLACEHOLDERS = ['{membro}', '{funcoes}', '{total}', '{servidor}'] as const
export const DUTY_DETAIL_PLACEHOLDERS = ['{funcao}', '{nota}', '{descricao}', '{responsaveis}', '{divisoes}', '{servidor}'] as const
