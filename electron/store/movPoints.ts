import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { MovPointsBoardConfig, MovPointsEntry } from '../../shared/types'
import { paths } from './paths'

interface PlayerRecord {
  tag: string
  points: number
  totalSeconds: number
}

interface GuildMovPoints {
  players: Record<string, PlayerRecord>
  board: { channelId: string | null; channelName: string | null; messageId: string | null }
}

type MovPointsData = Record<string, GuildMovPoints>

function readAll(): MovPointsData {
  if (!existsSync(paths.movPointsFile)) return {}
  try {
    return JSON.parse(readFileSync(paths.movPointsFile, 'utf-8')) as MovPointsData
  } catch {
    return {}
  }
}

function writeAll(data: MovPointsData): void {
  writeFileSync(paths.movPointsFile, JSON.stringify(data, null, 2), 'utf-8')
}

function ensureGuild(data: MovPointsData, guildId: string): GuildMovPoints {
  data[guildId] ??= { players: {}, board: { channelId: null, channelName: null, messageId: null } }
  return data[guildId]
}

function ensurePlayer(guild: GuildMovPoints, userId: string, tag: string): PlayerRecord {
  const existing = guild.players[userId]
  if (existing) {
    existing.tag = tag
    return existing
  }
  const created: PlayerRecord = { tag, points: 0, totalSeconds: 0 }
  guild.players[userId] = created
  return created
}

export function addPoints(guildId: string, userId: string, tag: string, amount: number): number {
  const data = readAll()
  const guild = ensureGuild(data, guildId)
  const player = ensurePlayer(guild, userId, tag)
  player.points = Math.max(0, player.points + Math.abs(amount))
  writeAll(data)
  return player.points
}

export function removePoints(guildId: string, userId: string, tag: string, amount: number): number {
  const data = readAll()
  const guild = ensureGuild(data, guildId)
  const player = ensurePlayer(guild, userId, tag)
  player.points = Math.max(0, player.points - Math.abs(amount))
  writeAll(data)
  return player.points
}

/** Acumula segundos de Mov. Call ao total já registado da pessoa (não substitui). */
export function addHours(guildId: string, userId: string, tag: string, seconds: number): number {
  const data = readAll()
  const guild = ensureGuild(data, guildId)
  const player = ensurePlayer(guild, userId, tag)
  player.totalSeconds = Math.max(0, player.totalSeconds + Math.abs(seconds))
  writeAll(data)
  return player.totalSeconds
}

/**
 * Ordenado sempre por pontos (mais alto primeiro); entre pessoas com os
 * mesmos pontos (incluindo quem tem 0), desempata por quem tem mais horas
 * acumuladas.
 */
export function getLeaderboard(guildId: string): MovPointsEntry[] {
  const data = readAll()
  const guild = data[guildId]
  if (!guild) return []
  return Object.entries(guild.players)
    .map(([userId, record]) => ({ userId, tag: record.tag, points: record.points, totalSeconds: record.totalSeconds }))
    .sort((a, b) => b.points - a.points || b.totalSeconds - a.totalSeconds)
}

export function getBoardConfig(guildId: string): MovPointsBoardConfig {
  const data = readAll()
  const guild = data[guildId]
  return { channelId: guild?.board.channelId ?? null, channelName: guild?.board.channelName ?? null }
}

export function getBoardMessageId(guildId: string): string | null {
  const data = readAll()
  return data[guildId]?.board.messageId ?? null
}

/** Muda o canal do painel — limpa o messageId guardado para uma nova mensagem ser publicada de raiz nesse canal. */
export function setBoardChannel(guildId: string, channelId: string | null, channelName: string | null): MovPointsBoardConfig {
  const data = readAll()
  const guild = ensureGuild(data, guildId)
  guild.board = { channelId, channelName, messageId: null }
  writeAll(data)
  return { channelId, channelName }
}

export function setBoardMessageId(guildId: string, messageId: string | null): void {
  const data = readAll()
  const guild = ensureGuild(data, guildId)
  guild.board.messageId = messageId
  writeAll(data)
}

/** Apaga os pontos e horas de toda a gente no servidor — mantém a configuração do painel (canal, mensagem). */
export function resetGuild(guildId: string): void {
  const data = readAll()
  const guild = ensureGuild(data, guildId)
  guild.players = {}
  writeAll(data)
}
