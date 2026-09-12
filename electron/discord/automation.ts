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
  const winners = await concludeGiveaway(guild, giveaway.channelId, giveaway.messageId, giveaway.prize, giveaway.winnerCount)
  const updated = giveawaysStore.markConcluded(id, winners)
  if (!updated) throw new Error('Falha ao guardar o resultado do sorteio.')
  return updated
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

/** Verifica periodicamente se algum sorteio já deveria ter terminado e conclui-o. */
export function startGiveawayScheduler(): void {
  setInterval(() => {
    if (!discordManager.isConnected()) return
    for (const giveaway of giveawaysStore.listGiveaways()) {
      if (giveaway.ended) continue
      if (new Date(giveaway.endsAt).getTime() > Date.now()) continue
      concludeGiveawayById(giveaway.id).catch((err) => {
        console.error(`Falha a concluir o sorteio "${giveaway.prize}":`, err)
      })
    }
  }, GIVEAWAY_CHECK_INTERVAL_MS)
}
