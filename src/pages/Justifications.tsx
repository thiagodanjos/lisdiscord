import { useEffect, useState } from 'react'
import { AlertTriangle, Calendar, CalendarClock, MessageSquareWarning, Pin, Radio } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Badge, Button, Card, SectionHeading } from '../components/ui'
import type { ChannelPickerEntry, GuildSummary, JustificationChannelKind, JustificationSettings } from '../../shared/types'

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

  useEffect(() => {
    bridge.listGuilds().then((g) => {
      setGuilds(g)
      setGuildId(g[0]?.id ?? '')
    })
  }, [])

  useEffect(() => {
    if (!guildId) return
    bridge.listChannels(guildId).then(setChannels)
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId])

  function loadSettings() {
    if (!guildId) return
    bridge.getJustificationSettings(guildId).then((s) => {
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
      const updated = await bridge.setJustificationChannel(guildId, kind, drafts[kind] || null)
      setSettings(updated)
    } catch (err) {
      setErrors((prev) => ({ ...prev, [kind]: err instanceof Error ? err.message : 'Ocorreu um erro inesperado.' }))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        title="Justificativas"
        subtitle='Configura os canais onde o bot publica os pedidos de justificativa fixa e diária, e para onde envia os alarmes de log'
      />

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
