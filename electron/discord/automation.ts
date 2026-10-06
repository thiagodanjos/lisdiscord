import type { Giveaway } from '../../shared/types'
import * as backupsStore from '../store/backups'
import * as giveawaysStore from '../store/giveaways'
import * as schedulesStore from '../store/schedules'
import { createBackup } from './backup'
import { discordManager } from './client'
import { concludeGiveaway } from './giveaways'

const GIVEAWAY_CHECK_INTERVAL_MS = 30_000

/** Usado tanto pela app desktop (IPC) como pelo processo do bot autónomo — a mesma lógica de concluir um sorteio, esteja o que estiver a correr o bot. */
export async function concludeGiveawayById(id: string): Promise<Giveaway> {
  const giveaway = giveawaysStore.getGiveaway(id)
  if (!giveaway) throw new Error('Sorteio não encontrado.')
  if (giveaway.ended) return giveaway
  if (!giveaway.messageId) throw new Error('Sorteio sem mensagem associada.')

  const guild = await discordManager.getClient().guilds.fetch(giveaway.guildId)
  return concludeGiveaway(guild, giveaway)
}

/** Liga os agendamentos de backup automático — corre o callback sempre que um agendamento vencer. */
export function startScheduledBackups(): void {
  schedulesStore.initSchedules(async (schedule) => {
    if (!discordManager.isConnected()) return
    const guild = await discordManager.getClient().guilds.fetch(schedule.guildId).catch(() => null)
    if (!guild) return
    const backup = await createBackup(guild, { includeBans: schedule.includeBans, origin: 'scheduled' })
    backupsStore.saveBackup(backup, 'scheduled')
    backupsStore.pruneOldBackups(schedule.guildId, schedule.keepLast)
  })
}

const concluding = new Set<string>()
const failures = new Map<string, number>()

/** Verifica periodicamente se algum sorteio já deveria ter terminado e conclui-o. */
export function startGiveawayScheduler(): void {
  setInterval(() => {
    if (!discordManager.isConnected()) return
    for (const giveaway of giveawaysStore.listGiveaways()) {
      if (giveaway.ended || concluding.has(giveaway.id)) continue
      if (new Date(giveaway.endsAt).getTime() > Date.now()) continue
      // Se falhar várias vezes (ex.: canal apagado), deixa de tentar — pode terminar-se na app.
      if ((failures.get(giveaway.id) ?? 0) >= 5) continue
      concluding.add(giveaway.id)
      concludeGiveawayById(giveaway.id)
        .catch((err) => {
          failures.set(giveaway.id, (failures.get(giveaway.id) ?? 0) + 1)
          console.error(`Falha a concluir o sorteio "${giveaway.prize}":`, err)
        })
        .finally(() => concluding.delete(giveaway.id))
    }
  }, GIVEAWAY_CHECK_INTERVAL_MS)
}
