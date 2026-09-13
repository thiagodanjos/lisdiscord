import type { RoleGoal } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

type RoleGoalsData = Record<string, RoleGoal[]>

function readAll(): RoleGoalsData {
  return readJsonFile<RoleGoalsData>(paths.roleGoalsFile, {})
}

function writeAll(data: RoleGoalsData): void {
  writeJsonFile(paths.roleGoalsFile, data)
}

export function listGoals(guildId: string): RoleGoal[] {
  return readAll()[guildId] ?? []
}

export function getGoal(guildId: string, roleId: string): RoleGoal | null {
  return listGoals(guildId).find((g) => g.roleId === roleId) ?? null
}

/** Cria ou atualiza a meta de um cargo — um cargo só pode ter uma meta configurada. */
export function setGoal(guildId: string, roleId: string, roleName: string, pointsGoal: number, hoursGoal: number): RoleGoal[] {
  const data = readAll()
  const guildGoals = data[guildId] ?? []
  const idx = guildGoals.findIndex((g) => g.roleId === roleId)
  const goal: RoleGoal = { roleId, roleName, pointsGoal, hoursGoal }
  if (idx === -1) guildGoals.push(goal)
  else guildGoals[idx] = goal
  data[guildId] = guildGoals
  writeAll(data)
  return guildGoals
}

export function removeGoal(guildId: string, roleId: string): RoleGoal[] {
  const data = readAll()
  const remaining = (data[guildId] ?? []).filter((g) => g.roleId !== roleId)
  data[guildId] = remaining
  writeAll(data)
  return remaining
}
