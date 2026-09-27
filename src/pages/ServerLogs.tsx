import { useEffect, useState } from 'react'
import { Clock3, Info, Medal, Palette, PencilLine, Radio, Save, Trash2 } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { Badge, Button, Card, PageHeader, Toggle } from '../components/ui'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import {
  LOG_DELETE_PLACEHOLDERS,
  LOG_EDIT_PLACEHOLDERS,
  LOG_POINTS_PLACEHOLDERS,
  type ChannelPickerEntry,
  type EmbedTemplateKind,
  type GuildSummary,
  type RemoteBotConfig,
  type ServerLogSettings,
} from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

const EMPTY: ServerLogSettings = {
  messageDeleteChannelId: null,
  messageDeleteChannelName: null,
  messageEditChannelId: null,
  messageEditChannelName: null,
  pointsChannelId: null,
  pointsChannelName: null,
  hoursChannelId: null,
  hoursChannelName: null,
  ignoreBots: true,
}

type IdKey = 'messageDeleteChannelId' | 'messageEditChannelId' | 'pointsChannelId' | 'hoursChannelId'

const LOGS: {
  key: IdKey
  nameKey: keyof ServerLogSettings
  template: EmbedTemplateKind
  icon: typeof Trash2
  title: string
  subtitle: string
  tokens: readonly string[]
  preview: Record<string, string>
}[] = [
  {
    key: 'messageDeleteChannelId',
    nameKey: 'messageDeleteChannelName',
    template: 'logMessageDelete',
    icon: Trash2,
    title: 'Mensagens apagadas',
    subtitle: 'Todas as mensagens apagadas no servidor: o conteúdo, quem enviou, quem apagou e quando. Apagamentos em massa (ex.: /limparcdo) aparecem resumidos.',
    tokens: LOG_DELETE_PLACEHOLDERS,
    preview: {
      autor: '@membro',
      nomeAutor: 'membro',
      avatarAutor: '',
      idAutor: '123456789012345678',
      canal: '#chat',
      conteudo: 'olá pessoal, alguém para a call?',
      anexos: '—',
      apagadaPor: '@gestor',
      enviadaEm: 'hoje às 21:04',
      idMensagem: '987654321098765432',
    },
  },
  {
    key: 'messageEditChannelId',
    nameKey: 'messageEditChannelName',
    template: 'logMessageEdit',
    icon: PencilLine,
    title: 'Mensagens editadas',
    subtitle: 'O texto antes e depois de cada edição, com link para a mensagem.',
    tokens: LOG_EDIT_PLACEHOLDERS,
    preview: {
      autor: '@membro',
      nomeAutor: 'membro',
      avatarAutor: '',
      idAutor: '123456789012345678',
      canal: '#chat',
      antes: 'call às 21h',
      depois: 'call às 22h!',
      link: 'https://discord.com',
    },
  },
  {
    key: 'pointsChannelId',
    nameKey: 'pointsChannelName',
    template: 'logPoints',
    icon: Medal,
    title: 'Pontos de Mov. Call',
    subtitle: 'Cada ponto adicionado ou removido — por /movcall, /pontosmovadmin ou pela app — e as reposições do placar.',
    tokens: LOG_POINTS_PLACEHOLDERS,
    preview: { membro: '@membro', nomeMembro: 'membro', acao: 'adicionou', quantidade: '10', total: '45', autor: 'gestor (via /movcall)', nota: 'Mov. Call Normal' },
  },
  {
    key: 'hoursChannelId',
    nameKey: 'hoursChannelName',
    template: 'logHours',
    icon: Clock3,
    title: 'Horas de Mov. Call',
    subtitle: 'Cada hora adicionada ou removida — por /movhoras ou pela app.',
    tokens: LOG_POINTS_PLACEHOLDERS,
    preview: { membro: '@membro', nomeMembro: 'membro', acao: 'adicionou', quantidade: '1h 30m', total: '6h 30m', autor: 'gestor (via /movhoras)', nota: '—' },
  },
]

export default function ServerLogs() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [settings, setSettings] = useState<ServerLogSettings>(EMPTY)
  const [draft, setDraft] = useState<ServerLogSettings>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<(typeof LOGS)[number] | null>(null)

  const isRemote = Boolean(remoteConfig.url && remoteConfig.hasApiKey)
  const guildName = guilds.find((g) => g.id === guildId)?.name ?? 'este servidor'

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemoteConfig)
  }, [])

  useEffect(() => {
    const listGuilds = isRemote ? bridge.listRemoteGuilds : bridge.listGuilds
    listGuilds()
      .then((g) => {
        setGuilds(g)
        setGuildId(g[0]?.id ?? '')
      })
      .catch((err) => setError(cleanIpcError(err)))
  }, [isRemote])

  useEffect(() => {
    if (!guildId) return
    setError('')
    const listChannels = isRemote ? bridge.listRemoteChannels : bridge.listChannels
    const getSettings = isRemote ? bridge.getRemoteServerLogSettings : bridge.getServerLogSettings
    listChannels(guildId)
      .then((c) => setChannels(c.filter((ch) => ch.kind === 'text' || ch.kind === 'announcement')))
      .catch((err) => setError(cleanIpcError(err)))
    getSettings(guildId)
      .then((s) => {
        setSettings(s)
        setDraft(s)
      })
      .catch((err) => setError(cleanIpcError(err)))
  }, [guildId, isRemote])

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  async function save() {
    setSaving(true)
    setError('')
    try {
      const setSettingsFn = isRemote ? bridge.setRemoteServerLogSettings : bridge.setServerLogSettings
      const saved = await setSettingsFn(guildId, draft)
      setSettings(saved)
      setDraft(saved)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Canais de log"
        subtitle="Escolhe para onde o bot manda cada registo: mensagens apagadas e editadas, pontos e horas de Mov. Call"
        action={
          isRemote ? (
            <Badge tone="cyan">
              <Radio size={11} /> A usar o bot remoto
            </Badge>
          ) : undefined
        }
      />

      <div>
        <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Servidor</label>
        <select value={guildId} onChange={(e) => setGuildId(e.target.value)} className={`mt-1.5 block max-w-xs ${inputClass}`}>
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {LOGS.map((log) => {
          const Icon = log.icon
          const activeName = settings[log.nameKey] as string | null
          return (
            <Card key={log.key} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-black tracking-wide uppercase">{log.title}</h3>
                    {settings[log.key] ? (
                      <Badge tone="success">
                        <Radio size={10} /> #{activeName}
                      </Badge>
                    ) : (
                      <Badge tone="default">Desligado</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{log.subtitle}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={draft[log.key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [log.key]: e.target.value || null }))}
                  className={`max-w-xs flex-1 ${inputClass}`}
                >
                  <option value="">Desligado</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </select>
                <Button variant="dark" onClick={() => setEditing(log)} disabled={!guildId}>
                  <Palette size={14} />
                  Personalizar embed
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="flex flex-col gap-4">
        <Toggle
          checked={draft.ignoreBots}
          onChange={(v) => setDraft((d) => ({ ...d, ignoreBots: v }))}
          label="Ignorar mensagens de bots (apagadas e editadas)"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} loading={saving} disabled={!guildId || !dirty}>
            <Save size={14} />
            {savedOk ? 'Guardado ✓' : 'Guardar'}
          </Button>
          {dirty && <span className="text-xs text-warning">Alterações por guardar</span>}
        </div>
        {error && <p className="text-xs text-danger">❌ {error}</p>}
      </Card>

      <Card className="flex items-start gap-3 text-xs text-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-accent" />
        <div className="flex flex-col gap-1.5">
          <p>
            <span className="font-semibold text-text">Quem apagou:</span> vem do registo de auditoria — o bot precisa da permissão{' '}
            <span className="text-text">Ver registo de auditoria</span>. A Discord só regista quando alguém apaga a mensagem de <i>outra</i> pessoa; sem registo, foi o
            próprio autor.
          </p>
          <p>
            <span className="font-semibold text-text">Conteúdo:</span> o bot só sabe o texto das mensagens que viu desde que ligou (precisa da intent Message
            Content). Mensagens mais antigas aparecem como “conteúdo desconhecido”.
          </p>
        </div>
      </Card>

      {editing && (
        <TemplateEditorModal
          open
          onClose={() => setEditing(null)}
          kind={editing.template}
          guildId={guildId}
          isRemote={isRemote}
          title={`Personalizar log — ${editing.title.toLowerCase()}`}
          hint="Os tokens abaixo são trocados pelos dados de cada registo."
          tokens={editing.tokens}
          previewPlaceholders={{ ...editing.preview, servidor: guildName }}
        />
      )}
    </div>
  )
}
