// Ponto de entrada do bot autónomo — corre sem Electron nem interface, pensado
// para ficar sempre ligado num servidor (ver docs/deploy-oracle.md). Usa
// exatamente a mesma lógica de electron/discord e electron/store que a app
// desktop, só que o token vem de uma variável de ambiente em vez do ecrã
// inicial, e os dados ficam em LISDISCORD_DATA_DIR em vez da pasta do
// Electron (ver electron/store/paths.ts).
import { startGiveawayScheduler, startScheduledBackups } from '../electron/discord/automation'
import { discordManager } from '../electron/discord/client'
import { ensureDataDirs } from '../electron/store/paths'

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN
  if (!token) {
    console.error('❌ Falta a variável de ambiente DISCORD_TOKEN. Define-a antes de arrancar o bot.')
    process.exit(1)
  }

  ensureDataDirs()

  const status = await discordManager.connect(token)
  console.log(`✅ LisDiscord (bot autónomo) ligado como ${status.botTag} — ${status.guildCount} servidor(es).`)
  if (!status.messageContentEnabled) {
    console.warn(
      '⚠️  Message Content Intent desativada no Developer Portal — os transcripts ficam sem conteúdo das mensagens e o /movcall não consegue ler a lista de participantes no chat.',
    )
  }

  startScheduledBackups()
  startGiveawayScheduler()

  console.log('🟢 Bot a correr — não é preciso ter a app desktop aberta enquanto este processo estiver de pé.')
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`\nA receber ${signal} — a desligar o bot...`)
  await discordManager.disconnect().catch(() => undefined)
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('unhandledRejection', (err) => {
  console.error('Rejeição de promessa não tratada:', err)
})

main().catch((err) => {
  console.error('❌ Falha ao arrancar o bot:', err)
  process.exit(1)
})
