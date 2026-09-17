// Ponto de entrada do bot autónomo — corre sem Electron nem interface, pensado
// para ficar sempre ligado num servidor (ver docs/deploy-oracle.md). Usa
// exatamente a mesma lógica de electron/discord e electron/store que a app
// desktop, só que o token vem de uma variável de ambiente em vez do ecrã
// inicial, e os dados ficam em LISDISCORD_DATA_DIR em vez da pasta do
// Electron (ver electron/store/paths.ts).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { startGiveawayScheduler, startScheduledBackups } from '../electron/discord/automation'
import { discordManager } from '../electron/discord/client'
import { ensureDataDirs } from '../electron/store/paths'
import { startHttpApi } from './httpApi'

let httpApiServer: ReturnType<typeof startHttpApi> = null

function readPackageVersion(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const pkgPath = path.join(dir, '..', 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
  return pkg.version
}

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN
  if (!token) {
    console.error('❌ Falta a variável de ambiente DISCORD_TOKEN. Define-a antes de arrancar o bot.')
    process.exit(1)
  }

  // Imprime a versão logo no arranque — é a forma mais rápida de confirmar que um `docker compose up
  // -d --build` (ou equivalente) realmente reconstruiu a imagem com o código mais recente, em vez de
  // só ter atualizado o código-fonte na pasta sem voltar a construir o container.
  console.log(`🚀 LisDiscord v${readPackageVersion()} — a arrancar…`)

  ensureDataDirs()

  const status = await discordManager.connect(token)
  console.log(`✅ LisDiscord (bot autónomo) ligado como ${status.botTag} — ${status.guildCount} servidor(es).`)
  if (!status.messageContentEnabled) {
    console.warn('⚠️  Message Content Intent desativada no Developer Portal — os transcripts ficam sem conteúdo das mensagens.')
  }
  if (!status.guildMembersEnabled) {
    console.warn('⚠️  Server Members Intent desativada no Developer Portal — o ranking de pontos só mostra quem já tem pontos ou horas.')
  }

  startScheduledBackups()
  startGiveawayScheduler()
  httpApiServer = startHttpApi()

  console.log('🟢 Bot a correr — não é preciso ter a app desktop aberta enquanto este processo estiver de pé.')
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`\nA receber ${signal} — a desligar o bot...`)
  if (httpApiServer) await new Promise((resolve) => httpApiServer?.close(resolve))
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
