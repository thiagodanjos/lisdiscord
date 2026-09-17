import { useEffect, useState } from 'react'
import { FolderOpen, LogOut, PlayCircle } from 'lucide-react'
import { bridge, isRealBridgeAvailable } from '../lib/bridge'
import { useUiStore } from '../store/ui'
import { Badge, Button, Card, SectionHeading, Toggle } from '../components/ui'
import type { AppSettings, BotStatus } from '../../shared/types'

export default function Settings({ status, onStatusChange }: { status: BotStatus | null; onStatusChange: (s: BotStatus) => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const demoMode = useUiStore((s) => s.demoMode)
  const setDemoMode = useUiStore((s) => s.setDemoMode)

  useEffect(() => {
    bridge.getSettings().then(setSettings)
  }, [demoMode])

  async function disconnect() {
    await bridge.disconnectBot()
    onStatusChange({ connected: false, botTag: null, botAvatarUrl: null, guildCount: 0, messageContentEnabled: false, guildMembersEnabled: false })
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <SectionHeading title="Definições" />

      <Card className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-text">Ligação ao bot</h3>
        {status?.connected ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text">{status.botTag}</p>
              <p className="text-xs text-muted">
                {status.guildCount} servidores
                {!status.messageContentEnabled && ' · sem Message Content Intent (transcripts sem texto)'}
                {!status.guildMembersEnabled && ' · sem Server Members Intent (ranking só mostra quem já tem pontos)'}
              </p>
            </div>
            <Button variant="dark" onClick={disconnect}>
              <LogOut size={14} />
              Desligar
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">O bot não está ligado.</p>
        )}
      </Card>

      <Card className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            <PlayCircle size={15} className="text-accent" />
            Modo demonstração
          </h3>
          <p className="mt-1 text-xs text-muted">
            {isRealBridgeAvailable()
              ? 'Navega a app com dados fictícios, sem tocar no bot nem nos teus servidores reais.'
              : 'Estás a correr a interface fora do Electron — o modo demonstração fica sempre ativo.'}
          </p>
        </div>
        <Toggle checked={demoMode} onChange={setDemoMode} />
        {!isRealBridgeAvailable() && <Badge tone="warning">Forçado</Badge>}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-text">Dados guardados localmente</h3>
        <p className="text-xs break-all text-muted">{settings?.dataDir}</p>
        <Button variant="dark" onClick={() => bridge.openDataDir()} className="self-start">
          <FolderOpen size={14} />
          Abrir pasta
        </Button>
      </Card>

      <Card className="flex flex-col gap-1.5 text-xs text-faint">
        <p>
          <span className="font-semibold text-muted">LisDiscord</span> — backup, restauro e gestão de servidores
          Discord, sozinha no teu computador. Nada é enviado para nenhum servidor externo.
        </p>
        <p>Código aberto, licença MIT.</p>
      </Card>
    </div>
  )
}
