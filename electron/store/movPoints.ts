import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { MovPointsBoardConfig, MovPointsEntry } from '../../shared/types'
import { paths } from './paths'

interface PlayerRecord {
  tag: string
  points: number
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

function applyDelta(guildId: string, userId: string, tag: string, delta: number): number {
  const data = readAll()
  const guild = ensureGuild(data, guildId)
  const existing = guild.players[userId]
  const points = Math.max(0, (existing?.points ?? 0) + delta)
  guild.players[userId] = { tag, points }
  writeAll(data)
  return points
}

export function addPoints(guildId: string, userId: string, tag: string, amount: number): number {
  return applyDelta(guildId, userId, tag, Math.abs(amount))
}

export function removePoints(guildId: string, userId: string, tag: string, amount: number): number {
  return applyDelta(guildId, userId, tag, -Math.abs(amount))
}

export function getLeaderboard(guildId: string): MovPointsEntry[] {
  const data = readAll()
  const guild = data[guildId]
  if (!guild) return []
  return Object.entries(guild.players)
    .map(([userId, record]) => ({ userId, tag: record.tag, points: record.points }))
    .sort((a, b) => b.points - a.points)
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
