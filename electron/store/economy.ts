import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { paths } from './paths'

interface PlayerRecord {
  tag: string
  balance: number
  lastDailyAt: string | null
  dailyStreak: number
  triviaStreak: number
  triviaBestStreak: number
}

type EconomyData = Record<string, Record<string, PlayerRecord>> // guildId -> userId -> record

const DAY_MS = 86_400_000
const DAILY_BASE_REWARD = 100
const DAILY_STREAK_BONUS = 20
const STARTING_BALANCE = 200

function readAll(): EconomyData {
  if (!existsSync(paths.economyFile)) return {}
  try {
    return JSON.parse(readFileSync(paths.economyFile, 'utf-8')) as EconomyData
  } catch {
    return {}
  }
}

function writeAll(data: EconomyData): void {
  writeFileSync(paths.economyFile, JSON.stringify(data, null, 2), 'utf-8')
}

function ensurePlayer(data: EconomyData, guildId: string, userId: string, tag: string): PlayerRecord {
  data[guildId] ??= {}
  const existing = data[guildId][userId]
  if (existing) {
    existing.tag = tag
    return existing
  }
  const created: PlayerRecord = {
    tag,
    balance: STARTING_BALANCE,
    lastDailyAt: null,
    dailyStreak: 0,
    triviaStreak: 0,
    triviaBestStreak: 0,
  }
  data[guildId][userId] = created
  return created
}

export function getBalance(guildId: string, userId: string, tag: string): number {
  const data = readAll()
  return ensurePlayer(data, guildId, userId, tag).balance
}

export function addCoins(guildId: string, userId: string, tag: string, amount: number): number {
  const data = readAll()
  const player = ensurePlayer(data, guildId, userId, tag)
  player.balance = Math.max(0, player.balance + amount)
  writeAll(data)
  return player.balance
}

/** Tenta debitar `amount`; devolve false sem alterar nada se o saldo for insuficiente. */
export function tryCharge(guildId: string, userId: string, tag: string, amount: number): boolean {
  const data = readAll()
  const player = ensurePlayer(data, guildId, userId, tag)
  if (player.balance < amount) return false
  player.balance -= amount
  writeAll(data)
  return true
}

export interface DailyClaimResult {
  claimed: boolean
  amount: number
  streak: number
  balance: number
  nextClaimAt: string
}

export function claimDaily(guildId: string, userId: string, tag: string): DailyClaimResult {
  const data = readAll()
  const player = ensurePlayer(data, guildId, userId, tag)
  const now = Date.now()
  const last = player.lastDailyAt ? new Date(player.lastDailyAt).getTime() : 0

  if (now - last < DAY_MS) {
    return { claimed: false, amount: 0, streak: player.dailyStreak, balance: player.balance, nextClaimAt: new Date(last + DAY_MS).toISOString() }
  }

  const stillInStreak = now - last < DAY_MS * 2
  player.dailyStreak = stillInStreak ? player.dailyStreak + 1 : 1
  const amount = DAILY_BASE_REWARD + (player.dailyStreak - 1) * DAILY_STREAK_BONUS
  player.balance += amount
  player.lastDailyAt = new Date(now).toISOString()
  writeAll(data)

  return { claimed: true, amount, streak: player.dailyStreak, balance: player.balance, nextClaimAt: new Date(now + DAY_MS).toISOString() }
}

export function registerTriviaResult(guildId: string, userId: string, tag: string, correct: boolean): { streak: number; reward: number } {
  const data = readAll()
  const player = ensurePlayer(data, guildId, userId, tag)
  if (!correct) {
    player.triviaStreak = 0
    writeAll(data)
    return { streak: 0, reward: 0 }
  }
  player.triviaStreak += 1
  player.triviaBestStreak = Math.max(player.triviaBestStreak, player.triviaStreak)
  const reward = 20 + Math.min(player.triviaStreak - 1, 10) * 5
  player.balance += reward
  writeAll(data)
  return { streak: player.triviaStreak, reward }
}

export interface LeaderboardEntry {
  userId: string
  tag: string
  balance: number
}

export function getLeaderboard(guildId: string, limit = 10): LeaderboardEntry[] {
  const data = readAll()
  const guild = data[guildId] ?? {}
  return Object.entries(guild)
    .map(([userId, record]) => ({ userId, tag: record.tag, balance: record.balance }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit)
}
