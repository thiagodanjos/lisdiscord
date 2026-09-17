import { useEffect, useState } from 'react'
import { AlertTriangle, Calendar, CalendarClock, Cable, MessageSquareWarning, Pin, Radio } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Badge, Button, Card, SectionHeading } from '../components/ui'
import type { ChannelPickerEntry, GuildSummary, JustificationChannelKind, JustificationSettings, RemoteBotConfig } from '../../shared/types'

const EMPTY_SETTINGS: JustificationSettings = {
  fixedPostChannelId: null,
  fixedPostChannelName: null,
  dailyPostChannelId: null,
  dailyPostChannelName: null,
  fixedLogChannelId: null,
  fixedLogChannelName: null,
  dailyLogChannelId: null,
  dailyLogChannelName: null,
}

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }

const FIELDS: {
  kind: JustificationChannelKind
  title: string
  subtitle: string
  icon: typeof Pin
  idKey: keyof JustificationSettings
  nameKey: keyof JustificationSettings
}[] = [
  {
    kind: 'fixedPost',
    title: 'Canal de justificativas fixas',
    subtitle: 'Onde o bot publica a mensagem com o botão "Justificar" para compromissos semanais fixos',
    icon: Calendar,
    idKey: 'fixedPostChannelId',
    nameKey: 'fixedPostChannelName',
  },
  {
    kind: 'dailyPost',
    title: 'Canal de justificativas diárias',
    subtitle: 'Onde o bot publica a mensagem com o botão "Justificar" para compromissos de última hora',
    icon: CalendarClock,
    idKey: 'dailyPostChannelId',
    nameKey: 'dailyPostChannelName',
  },
  {
    kind: 'fixedLog',
    title: 'Log de justificativas fixas',
    subtitle: 'Canal de alarme para administradores — recebe cada justificativa fixa enviada e os pedidos de remoção',
    icon: MessageSquareWarning,
    idKey: 'fixedLogChannelId',
    nameKey: 'fixedLogChannelName',
  },
  {
    kind: 'dailyLog',
    title: 'Log de justificativas diárias',
    subtitle: 'Canal de alarme para administradores — recebe cada justificativa diária enviada e os pedidos de remoção',
    icon: AlertTriangle,
    idKey: 'dailyLogChannelId',
    nameKey: 'dailyLogChannelName',
  },
]

export default function Justifications() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [remoteUrlDraft, setRemoteUrlDraft] = useState('')
  const [remoteKeyDraft, setRemoteKeyDraft] = useState('')
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [remoteError, setRemoteError] = useState('')
  const [remoteTestResult, setRemoteTestResult] = useState('')

  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [settings, setSettings] = useState<JustificationSettings>(EMPTY_SETTINGS)
  const [drafts, setDrafts] = useState<Record<JustificationChannelKind, string>>({
    fixedPost: '',
    dailyPost: '',
    fixedLog: '',
    dailyLog: '',
  })
  const [saving, setSaving] = useState<JustificationChannelKind | null>(null)
  const [errors, setErrors] = useState<Partial<Record<JustificationChannelKind, string>>>({})

  const isRemote = Boolean(remoteConfig.url && remoteConfig.hasApiKey)

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemoteConfig)
  }, [])

  useEffect(() => {
    const listGuilds = isRemote ? bridge.listRemoteGuilds : bridge.listGuilds
    listGuilds().then((g) => {
      setGuilds(g)
      setGuildId(g[0]?.id ?? '')
    })
  }, [isRemote])

  useEffect(() => {
    if (!guildId) return
    const listChannels = isRemote ? bridge.listRemoteChannels : bridge.listChannels
    listChannels(guildId).then(setChannels)
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  function loadSettings() {
    if (!guildId) return
    const getSettings = isRemote ? bridge.getRemoteJustificationSettings : bridge.getJustificationSettings
    getSettings(guildId).then((s) => {
      setSettings(s)
      setDrafts({
        fixedPost: s.fixedPostChannelId ?? '',
        dailyPost: s.dailyPostChannelId ?? '',
        fixedLog: s.fixedLogChannelId ?? '',
        dailyLog: s.dailyLogChannelId ?? '',
      })
    })
  }

  async function save(kind: JustificationChannelKind) {
    setSaving(kind)
    setErrors((prev) => ({ ...prev, [kind]: undefined }))
    try {
      const setChannel = isRemote ? bridge.setRemoteJustificationChannel : bridge.setJustificationChannel
      const updated = await setChannel(guildId, kind, drafts[kind] || null)
      setSettings(updated)
    } catch (err) {
      setErrors((prev) => ({ ...prev, [kind]: err instanceof Error ? err.message : 'Ocorreu um erro inesperado.' }))
    } finally {
      setSaving(null)
    }
  }

  async function testRemoteConnection() {
    setRemoteBusy(true)
    setRemoteTestResult('')
    setRemoteError('')
    try {
      const result = await bridge.testRemoteBotConnection(remoteUrlDraft.trim(), remoteKeyDraft.trim())
      setRemoteTestResult(result.ok ? '✅ Ligação bem-sucedida.' : `❌ ${result.error ?? 'Não consegui ligar.'}`)
    } finally {
      setRemoteBusy(false)
    }
  }

  async function saveRemoteConfig() {
    setRemoteBusy(true)
    setRemoteError('')
    try {
      const updated = await bridge.setRemoteBotConfig(remoteUrlDraft.trim(), remoteKeyDraft.trim())
      setRemoteConfig(updated)
      setRemoteKeyDraft('')
      setRemoteTestResult('')
    } catch (err) {
      setRemoteError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.')
    } finally {
      setRemoteBusy(false)
    }
  }

  async function disconnectRemote() {
    setRemoteBusy(true)
    try {
      const updated = await bridge.clearRemoteBotConfig()
      setRemoteConfig(updated)
      setRemoteUrlDraft('')
      setRemoteKeyDraft('')
      setRemoteTestResult('')
    } finally {
      setRemoteBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        title="Justificativas"
        subtitle='Configura os canais onde o bot publica os pedidos de justificativa fixa e diária, e para onde envia os alarmes de log'
      />

      <Card className="flex flex-col gap-3 p-4">
        <SectionHeading
          title="Bot remoto"
          subtitle="Se tens o bot a correr 24/7 noutro sítio (ex.: um servidor), liga-te diretamente a ele aqui — evita ter esta app e esse bot ligados à Discord ao mesmo tempo, o que faz cada um gravar a sua própria cópia das configurações"
          action={
            isRemote ? (
              <Badge tone="success">
                <Radio size={11} className="mr-1 inline" /> Ligado a {remoteConfig.url}
              </Badge>
            ) : (
              <Badge tone="warning">Não configurado — a usar a ligação local desta app</Badge>
            )
          }
        />
        {isRemote ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="dark" onClick={disconnectRemote} loading={remoteBusy}>
              Desligar bot remoto
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[220px]">
                <label className="text-xs font-semibold tracking-wide text-faint uppercase">Endereço (ex: http://IP_DO_SERVIDOR:8787)</label>
                <input
                  value={remoteUrlDraft}
                  onChange={(e) => setRemoteUrlDraft(e.target.value)}
                  placeholder="http://34.x.x.x:8787"
                  className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex-1 min-w-[220px]">
                <label className="text-xs font-semibold tracking-wide text-faint uppercase">Chave de API (LISDISCORD_API_KEY)</label>
                <input
                  value={remoteKeyDraft}
                  onChange={(e) => setRemoteKeyDraft(e.target.value)}
                  type="password"
                  placeholder="••••••••••••••••"
                  className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="dark"
                onClick={testRemoteConnection}
                loading={remoteBusy}
                disabled={!remoteUrlDraft.trim() || !remoteKeyDraft.trim()}
              >
                <Cable size={14} />
                Testar ligação
              </Button>
              <Button onClick={saveRemoteConfig} loading={remoteBusy} disabled={!remoteUrlDraft.trim() || !remoteKeyDraft.trim()}>
                Ligar e usar este bot
              </Button>
            </div>
            {remoteTestResult && <p className="text-xs text-muted">{remoteTestResult}</p>}
            {remoteError && <p className="text-xs text-danger">❌ {remoteError}</p>}
          </div>
        )}
      </Card>

      <div>
        <label className="text-xs font-semibold tracking-wide text-faint uppercase">Servidor</label>
        <select
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          className="mt-1.5 w-full max-w-xs rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        >
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-6">
        {FIELDS.map((field) => {
          const currentId = settings[field.idKey] as string | null
          const currentName = settings[field.nameKey] as string | null
          const Icon = field.icon
          return (
            <Card key={field.kind} className="flex flex-col gap-3 p-4">
              <SectionHeading
                title={field.title}
                subtitle={field.subtitle}
                action={
                  currentId ? (
                    <Badge tone="success">
                      <Radio size={11} className="mr-1 inline" /> Ativo em #{currentName}
                    </Badge>
                  ) : (
                    <Badge tone="warning">Não configurado</Badge>
                  )
                }
              />
              <div className="flex flex-wrap items-center gap-3">
                <Icon size={16} className="shrink-0 text-faint" />
                <select
                  value={drafts[field.kind]}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [field.kind]: e.target.value }))}
                  className="rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                >
                  <option value="">Nenhum</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </select>
                <Button onClick={() => save(field.kind)} loading={saving === field.kind} disabled={drafts[field.kind] === (currentId ?? '')}>
                  Guardar
                </Button>
              </div>
              {errors[field.kind] && <p className="text-xs text-danger">❌ {errors[field.kind]}</p>}
            </Card>
          )
        })}
      </div>

      <Card className="flex flex-col gap-1.5 p-4 text-xs text-faint">
        <p>
          Ao guardar um canal de <span className="font-semibold text-muted">publicação</span> (fixa ou diária), o bot publica ou atualiza
          logo a mensagem com as instruções e os botões <span className="font-semibold text-muted">Justificar</span> /{' '}
          <span className="font-semibold text-muted">Remover Justificativa</span> nesse canal.
        </p>
        <p>
          Os canais de <span className="font-semibold text-muted">log</span> precisam de estar configurados antes de alguém conseguir
          justificar-se — é para lá que cada justificativa (e cada pedido de remoção) é enviada, para os administradores verificarem.
        </p>
      </Card>
    </div>
  )
}
