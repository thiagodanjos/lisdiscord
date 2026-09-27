import { randomUUID } from 'node:crypto'
import type { VerificationEntry, VerificationSettings, VerificationTicket } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

/** Quantas verificações já decididas ficam no histórico de cada servidor. */
const MAX_HISTORY_PER_GUILD = 200

export const DEFAULT_PING_TEXT = '{cargo}'
export const DEFAULT_TICKET_NAME = 'verificacao-{usuario}'
export const DEFAULT_CLOSE_MESSAGE = 'Verificação **{estado}** por {moderador}. Este canal vai ser apagado em {segundos} segundos.'
/** Quanto tempo o ticket fica aberto depois de um gestor decidir, antes de ser apagado. */
export const CLOSE_DELAY_SECONDS = 10
const MAX_CLOSED_TICKETS_PER_GUILD = 300

export function defaultVerificationSettings(): VerificationSettings {
  return {
    channelId: null,
    channelName: null,
    panelMessageId: null,
    buttonLabel: 'Verificar',
    buttonEmoji: '✅',
    buttonStyle: 'success',
    ticketCategoryId: null,
    ticketCategoryName: null,
    ticketNameTemplate: DEFAULT_TICKET_NAME,
    maxTicketsPerWindow: 2,
    ticketWindowMinutes: 60,
    closeMessage: DEFAULT_CLOSE_MESSAGE,
    claimLabel: 'Assumir',
    finishLabel: 'Finalizar',
    cancelLabel: 'Cancelar',
    staffPanelLabel: 'Painel staff',
    claimEmoji: '🙋',
    finishEmoji: '✅',
    cancelEmoji: '✖️',
    staffPanelEmoji: '🛠️',
    claimStyle: 'primary',
    finishStyle: 'success',
    cancelStyle: 'danger',
    staffPanelStyle: 'secondary',
    pingRoleId: null,
    pingRoleName: null,
    pingText: DEFAULT_PING_TEXT,
    approverRoleIds: [],
    addRoleIds: [],
    removeRoleIds: [],
    logChannelId: null,
    logChannelName: null,
    deleteNonImage: true,
  }
}

// ---- Definições ----

function readSettings(): Record<string, VerificationSettings> {
  return readJsonFile<Record<string, VerificationSettings>>(paths.verificationSettingsFile, {})
}

export function getVerificationSettings(guildId: string): VerificationSettings {
  return { ...defaultVerificationSettings(), ...readSettings()[guildId] }
}

export function saveVerificationSettings(guildId: string, settings: VerificationSettings): VerificationSettings {
  const all = readSettings()
  all[guildId] = settings
  writeJsonFile(paths.verificationSettingsFile, all)
  return settings
}

export function setPanelMessageId(guildId: string, messageId: string | null): void {
  const all = readSettings()
  all[guildId] = { ...defaultVerificationSettings(), ...all[guildId], panelMessageId: messageId }
  writeJsonFile(paths.verificationSettingsFile, all)
}

// ---- Tickets ----

function readTickets(): VerificationTicket[] {
  return readJsonFile<VerificationTicket[]>(paths.verificationTicketsFile, [])
}

function writeTickets(list: VerificationTicket[]): void {
  const perGuild = new Map<string, number>()
  const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  writeJsonFile(
    paths.verificationTicketsFile,
    sorted.filter((t) => {
      if (t.status === 'open') return true
      const n = (perGuild.get(t.guildId) ?? 0) + 1
      perGuild.set(t.guildId, n)
      return n <= MAX_CLOSED_TICKETS_PER_GUILD
    }),
  )
}

export function listTickets(guildId: string): VerificationTicket[] {
  return readTickets()
    .filter((t) => t.guildId === guildId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function findOpenTicketByChannel(channelId: string): VerificationTicket | null {
  return readTickets().find((t) => t.status === 'open' && t.channelId === channelId) ?? null
}

export function findOpenTicketByUser(guildId: string, userId: string): VerificationTicket | null {
  return readTickets().find((t) => t.status === 'open' && t.guildId === guildId && t.userId === userId) ?? null
}

/** Tickets que o membro abriu dentro da janela de tempo (para o limite de N por hora). */
export function ticketsOpenedSince(guildId: string, userId: string, since: Date): VerificationTicket[] {
  return readTickets().filter((t) => t.guildId === guildId && t.userId === userId && new Date(t.createdAt) >= since)
}

export function nextTicketNumber(guildId: string): number {
  return readTickets().filter((t) => t.guildId === guildId).reduce((max, t) => Math.max(max, t.number), 0) + 1
}

export function addTicket(ticket: Omit<VerificationTicket, 'id' | 'createdAt' | 'status'>): VerificationTicket {
  const created: VerificationTicket = { ...ticket, id: randomUUID().slice(0, 8), createdAt: new Date().toISOString(), status: 'open' }
  writeTickets([...readTickets(), created])
  return created
}

export function closeTicket(id: string, result: NonNullable<VerificationTicket['result']>, closedByTag: string): VerificationTicket | null {
  const all = readTickets()
  const ticket = all.find((t) => t.id === id && t.status === 'open')
  if (!ticket) return null
  ticket.status = 'closed'
  ticket.closedAt = new Date().toISOString()
  ticket.closedByTag = closedByTag
  ticket.result = result
  writeTickets(all)
  return ticket
}

export function findPendingByTicket(ticketId: string): VerificationEntry | null {
  return readEntries().find((e) => e.status === 'pending' && e.ticketId === ticketId) ?? null
}

// ---- Pedidos (pendentes + histórico) ----

function readEntries(): VerificationEntry[] {
  return readJsonFile<VerificationEntry[]>(paths.verificationsFile, [])
}

function writeEntries(list: VerificationEntry[]): void {
  const perGuild = new Map<string, number>()
  const sorted = [...list].sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt))
  const kept = sorted.filter((e) => {
    if (e.status === 'pending') return true
    const n = (perGuild.get(e.guildId) ?? 0) + 1
    perGuild.set(e.guildId, n)
    return n <= MAX_HISTORY_PER_GUILD
  })
  writeJsonFile(paths.verificationsFile, kept)
}

export function listVerifications(guildId: string): VerificationEntry[] {
  return readEntries()
    .filter((e) => e.guildId === guildId)
    .sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (b.status === 'pending' && a.status !== 'pending') return 1
      return (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt)
    })
}

export function addPending(entry: Omit<VerificationEntry, 'id' | 'createdAt' | 'status'>): VerificationEntry {
  const created: VerificationEntry = { ...entry, id: randomUUID().slice(0, 8), createdAt: new Date().toISOString(), status: 'pending' }
  writeEntries([...readEntries(), created])
  return created
}

export function findPendingByMessage(embedMessageId: string): VerificationEntry | null {
  return readEntries().find((e) => e.status === 'pending' && e.embedMessageId === embedMessageId) ?? null
}

export function findPendingByUser(guildId: string, userId: string): VerificationEntry | null {
  return readEntries().find((e) => e.status === 'pending' && e.guildId === guildId && e.userId === userId) ?? null
}

/** Remove um pedido pendente sem o pôr no histórico (ex.: foi substituído por uma foto nova). */
export function dropPending(id: string): void {
  writeEntries(readEntries().filter((e) => e.id !== id))
}

export function decide(
  id: string,
  status: 'approved' | 'rejected',
  moderator: { id: string; tag: string },
  roles: { added: string[]; removed: string[] },
  cancelReason?: string,
): VerificationEntry | null {
  const all = readEntries()
  const entry = all.find((e) => e.id === id && e.status === 'pending')
  if (!entry) return null
  entry.status = status
  entry.decidedAt = new Date().toISOString()
  entry.moderatorId = moderator.id
  entry.moderatorTag = moderator.tag
  entry.rolesAdded = roles.added
  entry.rolesRemoved = roles.removed
  if (cancelReason) entry.cancelReason = cancelReason
  writeEntries(all)
  return entry
}

/** Atualiza campos de um pedido pendente (assumir, cargos escolhidos no painel staff). */
export function updatePending(
  id: string,
  patch: Partial<Pick<VerificationEntry, 'claimedById' | 'claimedByTag' | 'claimedAt' | 'manualRoleIds' | 'photoMessageId' | 'pingMessageId' | 'imageCount'>>,
): VerificationEntry | null {
  const all = readEntries()
  const entry = all.find((e) => e.id === id && e.status === 'pending')
  if (!entry) return null
  Object.assign(entry, patch)
  writeEntries(all)
  return entry
}

export function findPendingByPhoto(messageId: string): VerificationEntry | null {
  return readEntries().find((e) => e.status === 'pending' && e.photoMessageId === messageId) ?? null
}

export function findPendingById(id: string): VerificationEntry | null {
  return readEntries().find((e) => e.id === id && e.status === 'pending') ?? null
}
