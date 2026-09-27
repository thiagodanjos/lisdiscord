import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  FolderLock,
  Hash,
  ImageIcon,
  MousePointerClick,
  Palette,
  Radio,
  ScrollText,
  ShieldCheck,
  Ticket,
  XCircle,
} from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { formatDateTime, formatRelativeDate } from '../lib/format'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, StatCard, Toggle } from '../components/ui'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import {
  TICKET_NAME_PLACEHOLDERS,
  VERIFICATION_LOG_PLACEHOLDERS,
  VERIFICATION_PANEL_PLACEHOLDERS,
  VERIFICATION_PLACEHOLDERS,
  VERIFICATION_TICKET_PLACEHOLDERS,
  type ChannelPickerEntry,
  type EmbedTemplateKind,
  type GuildSummary,
  type RemoteBotConfig,
  type RolePickerEntry,
  type VerificationButtonStyle,
  type VerificationDiagnostics,
  type VerificationEntry,
  type VerificationSettings,
  type VerificationTicket,
} from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const POLL_INTERVAL_MS = 15_000
const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

const EMPTY_SETTINGS: VerificationSettings = {
  channelId: null,
  channelName: null,
  panelMessageId: null,
  buttonLabel: 'Verificar',
  buttonEmoji: '✅',
  buttonStyle: 'success',
  ticketCategoryId: null,
  ticketCategoryName: null,
  ticketNameTemplate: 'verificacao-{usuario}',
  maxTicketsPerWindow: 2,
  ticketWindowMinutes: 60,
  closeMessage: 'Verificação **{estado}** por {moderador}. Este canal vai ser apagado em {segundos} segundos.',
  claimLabel: 'Assumir',
  finishLabel: 'Finalizar',
  cancelLabel: 'Cancelar',
  staffPanelLabel: 'Painel staff',
  pingRoleId: null,
  pingRoleName: null,
  pingText: '{cargo}',
  approverRoleIds: [],
  addRoleIds: [],
  removeRoleIds: [],
  logChannelId: null,
  logChannelName: null,
  deleteNonImage: true,
}

const BUTTON_STYLE_CLASS: Record<VerificationButtonStyle, string> = {
  success: 'bg-[#248046]',
  primary: 'bg-[#5865f2]',
  secondary: 'bg-[#4e5058]',
  danger: 'bg-[#da373c]',
}

const TEMPLATE_INFO: Record<
  'verificationPanel' | 'verificationTicket' | 'verificationRequest' | 'verificationLog',
  { title: string; hint: string; tokens: readonly string[]; imageNote?: string }
> = {
  verificationPanel: {
    title: 'Personalizar embed do painel',
    hint: 'Embed fixo no canal do painel, com o botão por baixo. Ao guardar, o bot atualiza logo a mensagem que já lá está.',
    tokens: VERIFICATION_PANEL_PLACEHOLDERS,
  },
  verificationTicket: {
    title: 'Personalizar embed do ticket',
    hint: 'Primeira mensagem de cada ticket, com o botão "Fechar ticket". {numero} é o número do ticket; {avatar} serve como URL de miniatura.',
    tokens: VERIFICATION_TICKET_PLACEHOLDERS,
  },
  verificationRequest: {
    title: 'Personalizar embed da foto',
    hint: 'Embed publicado com a foto do membro, com os botões da gestão por baixo. {responsavel} e {estado} atualizam sozinhos quando alguém assume.',
    tokens: VERIFICATION_PLACEHOLDERS,
    imageNote: 'A imagem grande é sempre a foto que o membro mandou.',
  },
  verificationLog: {
    title: 'Personalizar log da verificação',
    hint: "Enviado para o canal de log quando um gestor finaliza ou cancela. {estado} fica 'finalizada ✅' ou 'cancelada ✖️'; {motivo} é o motivo do cancelamento; {duracao} o tempo desde que o ticket abriu.",
    tokens: VERIFICATION_LOG_PLACEHOLDERS,
    imageNote: 'A imagem grande é sempre a foto que o membro mandou.',
  },
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{children}</label>
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-faint">{children}</p>
}

/** Escolha de vários cargos com chips clicáveis. */
function RoleChips({ roles, selected, onChange, tone }: { roles: RolePickerEntry[]; selected: string[]; onChange: (ids: string[]) => void; tone: string }) {
  if (roles.length === 0) return <p className="mt-1.5 text-xs text-faint">Sem cargos para mostrar.</p>
  return (
    <div className="mt-1.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-black/20 p-2">
      {roles.map((r) => {
        const on = selected.includes(r.id)
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(on ? selected.filter((id) => id !== r.id) : [...selected, r.id])}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              on ? `${tone} text-text` : 'border-border text-muted hover:border-accent/60 hover:text-text'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: r.color === '#000000' ? '#99aab5' : r.color }} />
            {r.name}
            {on && <span>✓</span>}
          </button>
        )
      })}
    </div>
  )
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${ok ? 'border-success/30 bg-success/5' : 'border-danger/40 bg-danger/10'}`}>
      {ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />}
      <div>
        <p className="text-xs font-semibold text-text">{label}</p>
        {!ok && detail && <p className="mt-0.5 text-[11px] text-danger">{detail}</p>}
      </div>
    </div>
  )
}

function SectionTitle({ n, icon: Icon, title, subtitle, actions }: { n: number; icon: typeof Ticket; title: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon size={17} />
        </div>
        <div>
          <p className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Passo {n}</p>
          <h3 className="text-sm font-black tracking-wide uppercase">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Mesmo algoritmo do bot (buildTicketName) — para a pré-visualização bater certo com o canal criado. */
function previewTicketName(template: string, username: string, id: string, number: number): string {
  const raw = (template || 'verificacao-{usuario}')
    .split('{usuario}')
    .join(username)
    .split('{id}')
    .join(id)
    .split('{numero}')
    .join(String(number).padStart(3, '0'))
  return (
    raw
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}\p{Extended_Pictographic}_・•|-]/gu, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100) || `verificacao-${number}`
  )
}

export default function Verification() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [diagnostics, setDiagnostics] = useState<VerificationDiagnostics | null>(null)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [categories, setCategories] = useState<ChannelPickerEntry[]>([])
  const [roles, setRoles] = useState<RolePickerEntry[]>([])
  const [settings, setSettings] = useState<VerificationSettings>(EMPTY_SETTINGS)
  const [draft, setDraft] = useState<VerificationSettings>(EMPTY_SETTINGS)
  const [entries, setEntries] = useState<VerificationEntry[]>([])
  const [tickets, setTickets] = useState<VerificationTicket[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedOk, setSavedOk] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<keyof typeof TEMPLATE_INFO | null>(null)

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
      .catch((err) => setLoadError(cleanIpcError(err)))
  }, [isRemote])

  function refreshLive() {
    if (!guildId) return
    const list = isRemote ? bridge.listRemoteVerifications : bridge.listVerifications
    list(guildId).then(setEntries).catch(() => undefined)
    const listTickets = isRemote ? bridge.listRemoteVerificationTickets : bridge.listVerificationTickets
    listTickets(guildId).then(setTickets).catch(() => undefined)
    const diagnose = isRemote ? bridge.getRemoteVerificationDiagnostics : bridge.getVerificationDiagnostics
    diagnose(guildId).then(setDiagnostics).catch(() => setDiagnostics(null))
  }

  useEffect(() => {
    if (!guildId) return
    setLoadError('')
    const listChannels = isRemote ? bridge.listRemoteChannels : bridge.listChannels
    const listCategories = isRemote ? bridge.listRemoteCategories : bridge.listCategories
    const listRoles = isRemote ? bridge.listRemoteRoles : bridge.listRoles
    const getSettings = isRemote ? bridge.getRemoteVerificationSettings : bridge.getVerificationSettings
    listChannels(guildId)
      .then((c) => setChannels(c.filter((ch) => ch.kind === 'text' || ch.kind === 'announcement')))
      .catch((err) => setLoadError(cleanIpcError(err)))
    listCategories(guildId).then(setCategories).catch(() => setCategories([]))
    listRoles(guildId).then(setRoles).catch(() => setRoles([]))
    getSettings(guildId)
      .then((s) => {
        setSettings(s)
        setDraft(s)
      })
      .catch((err) => setLoadError(cleanIpcError(err)))

    refreshLive()
    const id = setInterval(refreshLive, POLL_INTERVAL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const openTickets = useMemo(() => tickets.filter((t) => t.status === 'open'), [tickets])
  const history = useMemo(() => entries.filter((e) => e.status !== 'pending'), [entries])
  const pendingByTicket = useMemo(() => new Set(entries.filter((e) => e.status === 'pending').map((e) => e.ticketId)), [entries])
  const approved = history.filter((e) => e.status === 'approved').length
  const rejected = history.filter((e) => e.status === 'rejected').length
  const pingRole = roles.find((r) => r.id === draft.pingRoleId)
  const nextNumber = tickets.reduce((max, t) => Math.max(max, t.number), 0) + 1

  async function save() {
    setSaving(true)
    setSaveError('')
    try {
      const setRemote = isRemote ? bridge.setRemoteVerificationSettings : bridge.setVerificationSettings
      const saved = await setRemote(guildId, draft)
      setSettings(saved)
      setDraft(saved)
      refreshLive()
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (err) {
      setSaveError(cleanIpcError(err))
    } finally {
      setSaving(false)
    }
  }

  const pingPreview = (draft.pingText || '{cargo}')
    .split('{cargo}')
    .join(pingRole ? `@${pingRole.name}` : '@cargo')
    .split('{membro}')
    .join('@membro')

  const set = <K extends keyof VerificationSettings>(key: K, value: VerificationSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const templateInfo = editing ? TEMPLATE_INFO[editing] : null
  const templatePlaceholders: Record<string, string> = {
    membro: '@membro',
    nome: 'membro',
    avatar: '',
    id: '123456789012345678',
    numero: String(nextNumber),
    cargo: pingRole ? `@${pingRole.name}` : '',
    criada: '12/03/2023',
    entrou: 'há 2 dias',
    estado: editing === 'verificationLog' ? 'finalizada ✅' : '🟡 Em análise',
    responsavel: '@gestor',
    moderador: '@gestor',
    motivo: '—',
    ticket: String(nextNumber),
    duracao: '12 min',
    cargosDados: roles.filter((r) => draft.addRoleIds.includes(r.id)).map((r) => `@${r.name}`).join(', ') || '—',
    cargosTirados: roles.filter((r) => draft.removeRoleIds.includes(r.id)).map((r) => `@${r.name}`).join(', ') || '—',
    servidor: guildName,
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Verificação"
        subtitle="Painel com botão → ticket privado → o membro manda o print dos cargos → a gestão assume, escolhe os cargos e finaliza"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isRemote && (
              <Badge tone="cyan">
                <Radio size={11} /> A usar o bot remoto
              </Badge>
            )}
            {settings.channelId && settings.ticketCategoryId ? (
              <Badge tone="success">
                <Radio size={11} /> Painel em #{settings.channelName}
              </Badge>
            ) : (
              <Badge tone="warning">Por configurar</Badge>
            )}
          </div>
        }
      />

      <div>
        <Label>Servidor</Label>
        <select value={guildId} onChange={(e) => setGuildId(e.target.value)} className={`mt-1.5 block max-w-xs ${inputClass}`}>
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {loadError && <p className="mt-1.5 text-xs text-danger">❌ {loadError}</p>}
      </div>

      {diagnostics && (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-accent" />
            <h3 className="text-sm font-black tracking-wide uppercase">Diagnóstico</h3>
            <span className="text-[11px] text-faint">· atualiza sozinho a cada 15 s</span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {diagnostics.checks.map((c) => (
              <Check key={c.label} ok={c.ok} label={c.label} detail={c.detail} />
            ))}
          </div>
          <div>
            <Label>O que o bot fez recentemente</Label>
            {diagnostics.events.length === 0 ? (
              <p className="mt-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-faint">
                Ainda nada desde que o bot arrancou. Clica no botão do painel no Discord para testar — a gestão não tem limite de tickets.
              </p>
            ) : (
              <div className="mt-1.5 flex max-h-56 flex-col overflow-y-auto rounded-lg border border-border bg-black/20">
                {diagnostics.events.map((ev, idx) => (
                  <div key={idx} className="flex items-start gap-3 border-t border-border/60 px-3 py-2 text-xs first:border-t-0">
                    <span className={ev.level === 'error' ? 'text-danger' : ev.level === 'warn' ? 'text-warning' : 'text-accent'}>●</span>
                    <span className="flex-1 text-muted">{ev.text}</span>
                    <span className="shrink-0 text-faint" title={formatDateTime(ev.at)}>
                      {formatRelativeDate(ev.at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 1. Painel */}
      <Card className="flex flex-col gap-4">
        <SectionTitle
          n={1}
          icon={MousePointerClick}
          title="Painel com o botão"
          subtitle="Embed fixo num canal (ex.: #verificação) com o botão que abre o ticket."
          actions={
            <Button variant="dark" onClick={() => setEditing('verificationPanel')} disabled={!guildId}>
              <Palette size={14} />
              Personalizar embed do painel
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <Label>Canal do painel</Label>
            <select value={draft.channelId ?? ''} onChange={(e) => set('channelId', e.target.value || null)} className={`mt-1.5 ${inputClass}`}>
              <option value="">Desligada</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
            <Hint>Ao guardar, o bot publica (ou atualiza) o painel neste canal.</Hint>
          </div>
          <div>
            <Label>Texto do botão</Label>
            <input value={draft.buttonLabel} onChange={(e) => set('buttonLabel', e.target.value)} maxLength={80} className={`mt-1.5 ${inputClass}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Emoji</Label>
              <input value={draft.buttonEmoji} onChange={(e) => set('buttonEmoji', e.target.value)} placeholder="✅" className={`mt-1.5 ${inputClass}`} />
            </div>
            <div>
              <Label>Cor</Label>
              <select value={draft.buttonStyle} onChange={(e) => set('buttonStyle', e.target.value as VerificationButtonStyle)} className={`mt-1.5 ${inputClass}`}>
                <option value="success">Verde</option>
                <option value="primary">Azul</option>
                <option value="secondary">Cinzento</option>
                <option value="danger">Vermelho</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-faint">Pré-visualização do botão:</span>
          <span className={`inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-medium text-white ${BUTTON_STYLE_CLASS[draft.buttonStyle]}`}>
            {draft.buttonEmoji && <span>{draft.buttonEmoji}</span>}
            {draft.buttonLabel || 'Verificar'}
          </span>
        </div>
      </Card>

      {/* 2. Tickets */}
      <Card className="flex flex-col gap-4">
        <SectionTitle
          n={2}
          icon={FolderLock}
          title="Tickets"
          subtitle="Canal privado criado ao clicar no botão — só o membro, a gestão (cargos de aprovação) e o bot o veem."
          actions={
            <Button variant="dark" onClick={() => setEditing('verificationTicket')} disabled={!guildId}>
              <Palette size={14} />
              Personalizar embed do ticket
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Categoria dos tickets</Label>
            <select value={draft.ticketCategoryId ?? ''} onChange={(e) => set('ticketCategoryId', e.target.value || null)} className={`mt-1.5 ${inputClass}`}>
              <option value="">Escolhe uma categoria…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  📁 {c.name}
                </option>
              ))}
            </select>
            <Hint>Ex.: a categoria “Verifique-se”. O bot precisa de Gerir canais nela e de Gerir cargos no servidor.</Hint>
          </div>
          <div>
            <Label>Nome do canal</Label>
            <input value={draft.ticketNameTemplate} onChange={(e) => set('ticketNameTemplate', e.target.value)} maxLength={90} className={`mt-1.5 ${inputClass}`} />
            <Hint>
              Tokens: {TICKET_NAME_PLACEHOLDERS.map((t) => <code key={t} className="mr-1">{t}</code>)} · fica:{' '}
              <span className="font-mono text-muted">#{previewTicketName(draft.ticketNameTemplate, 'thiagoanjoss', '123456789012345678', nextNumber)}</span>
            </Hint>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Máx. de tickets</Label>
              <input
                type="number"
                min={1}
                max={20}
                value={draft.maxTicketsPerWindow}
                onChange={(e) => set('maxTicketsPerWindow', Number(e.target.value))}
                className={`mt-1.5 ${inputClass}`}
              />
            </div>
            <div>
              <Label>Por quantos minutos</Label>
              <input
                type="number"
                min={1}
                max={10080}
                value={draft.ticketWindowMinutes}
                onChange={(e) => set('ticketWindowMinutes', Number(e.target.value))}
                className={`mt-1.5 ${inputClass}`}
              />
            </div>
            <p className="col-span-2 text-[11px] text-faint">
              Cada membro pode abrir no máximo {draft.maxTicketsPerWindow} ticket(s) a cada {draft.ticketWindowMinutes} min — e só um aberto de cada vez. A gestão não
              tem limite (para poder testar).
            </p>
          </div>
          <div>
            <Label>Mensagem quando a verificação é decidida</Label>
            <input value={draft.closeMessage} onChange={(e) => set('closeMessage', e.target.value)} maxLength={500} className={`mt-1.5 ${inputClass}`} />
            <Hint>
              Tokens: <code>{'{estado}'}</code> <code>{'{membro}'}</code> <code>{'{moderador}'}</code> <code>{'{segundos}'}</code> · depois o canal é apagado
              sozinho.
            </Hint>
          </div>
        </div>
        <Toggle
          checked={draft.deleteNonImage}
          onChange={(v) => set('deleteNonImage', v)}
          label="Apagar o texto que o membro mandar no ticket (com um aviso que desaparece) — só fotos contam; a gestão pode escrever à vontade"
        />
      </Card>

      {/* 3. Aprovação */}
      <Card className="flex flex-col gap-4">
        <SectionTitle
          n={3}
          icon={ShieldCheck}
          title="Foto e botões da gestão"
          subtitle="O membro manda a foto no ticket → embed com os botões da gestão → marcação → um gestor assume, escolhe os cargos num painel só dele e finaliza."
          actions={
            <>
              <Button variant="dark" onClick={() => setEditing('verificationRequest')} disabled={!guildId}>
                <ImageIcon size={14} />
                Personalizar embed da foto
              </Button>
              <Button variant="dark" onClick={() => setEditing('verificationLog')} disabled={!guildId}>
                <ScrollText size={14} />
                Personalizar log
              </Button>
            </>
          }
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <Label>Cargo a marcar</Label>
            <select value={draft.pingRoleId ?? ''} onChange={(e) => set('pingRoleId', e.target.value || null)} className={`mt-1.5 ${inputClass}`}>
              <option value="">Não marcar ninguém</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  @{r.name}
                </option>
              ))}
            </select>
            <Hint>Ex.: @Gestão — numa mensagem simples, sem embed, logo a seguir à foto.</Hint>
          </div>
          <div>
            <Label>Texto da marcação</Label>
            <input value={draft.pingText} onChange={(e) => set('pingText', e.target.value)} className={`mt-1.5 ${inputClass}`} maxLength={300} placeholder="{cargo}" />
            <Hint>
              <code>{'{cargo}'}</code> <code>{'{membro}'}</code> · fica: <span className="text-muted">{pingPreview}</span>
            </Hint>
          </div>
          <div>
            <Label>Canal de log (opcional)</Label>
            <select value={draft.logChannelId ?? ''} onChange={(e) => set('logChannelId', e.target.value || null)} className={`mt-1.5 ${inputClass}`}>
              <option value="">Sem log</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
            <Hint>Guarda o resultado com a foto, depois de o ticket ser apagado.</Hint>
          </div>
        </div>

        <div>
          <Label>Botões no embed da foto</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2 md:grid-cols-4">
            {(
              [
                ['claimLabel', 'Assumir'],
                ['finishLabel', 'Finalizar'],
                ['cancelLabel', 'Cancelar'],
                ['staffPanelLabel', 'Painel staff'],
              ] as const
            ).map(([key, fallback]) => (
              <input key={key} value={draft[key]} onChange={(e) => set(key, e.target.value)} maxLength={60} placeholder={fallback} className={inputClass} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-black/20 p-3">
            <span className={`inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-medium text-white ${BUTTON_STYLE_CLASS.primary}`}>🙋 {draft.claimLabel || 'Assumir'}</span>
            <span className={`inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-medium text-white ${BUTTON_STYLE_CLASS.success}`}>✅ {draft.finishLabel || 'Finalizar'}</span>
            <span className={`inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-medium text-white ${BUTTON_STYLE_CLASS.danger}`}>✖️ {draft.cancelLabel || 'Cancelar'}</span>
            <span className="basis-full" />
            <span className={`inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-medium text-white ${BUTTON_STYLE_CLASS.secondary}`}>🛠️ {draft.staffPanelLabel || 'Painel staff'}</span>
          </div>
          <Hint>
            <b>Assumir</b> marca o gestor como responsável e abre-lhe um painel (só ele vê) para escolher os cargos do membro — dados na hora. <b>Finalizar</b> dá
            também os cargos automáticos abaixo, manda o log e fecha o ticket. <b>Cancelar</b> pede um motivo opcional, retira os cargos dados no painel e fecha o
            ticket. <b>Painel staff</b> reabre o painel.
          </Hint>
        </div>

        <div>
          <Label>Gestão — quem vê os tickets e pode usar os botões</Label>
          <RoleChips roles={roles} selected={draft.approverRoleIds} onChange={(ids) => set('approverRoleIds', ids)} tone="border-accent bg-accent-soft" />
          <Hint>
            Quem tem <span className="text-muted">Administrador</span> também pode sempre.{' '}
            {draft.approverRoleIds.length === 0 && pingRole ? `Sem cargos escolhidos, vale o cargo marcado (@${pingRole.name}).` : ''} Depois de alguém assumir, só essa pessoa (ou um administrador) finaliza ou cancela.
          </Hint>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Dar cargos automaticamente ao finalizar (opcional)</Label>
            <RoleChips roles={roles} selected={draft.addRoleIds} onChange={(ids) => set('addRoleIds', ids)} tone="border-success bg-success/10" />
          </div>
          <div>
            <Label>Tirar cargos automaticamente ao finalizar (opcional)</Label>
            <RoleChips roles={roles} selected={draft.removeRoleIds} onChange={(ids) => set('removeRoleIds', ids)} tone="border-danger bg-danger/10" />
            <Hint>Ex.: tirar o @Novato. O cargo do bot tem de estar acima destes cargos.</Hint>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-2 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-black/70 px-4 py-3 backdrop-blur">
        <Button onClick={save} loading={saving} disabled={!guildId || !dirty}>
          <BadgeCheck size={14} />
          {savedOk ? 'Guardado ✓' : 'Guardar e publicar painel'}
        </Button>
        {dirty ? <span className="text-xs text-warning">Alterações por guardar</span> : <span className="text-xs text-faint">Tudo guardado</span>}
        {saveError && <p className="w-full text-xs text-danger">❌ {saveError}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Tickets abertos" value={openTickets.length} icon={Ticket} tone="amber" />
        <StatCard label="Finalizadas" value={approved} icon={CheckCircle2} tone="green" />
        <StatCard label="Canceladas" value={rejected} icon={XCircle} tone="pink" />
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-black tracking-wide uppercase">Tickets abertos</h3>
          <p className="text-[11px] text-faint">Canais de verificação que ainda não foram decididos nem fechados</p>
        </div>
        {openTickets.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhum ticket aberto" description="Quando alguém clicar no botão do painel, aparece aqui." />
          </div>
        ) : (
          openTickets.map((t) => (
            <div key={t.id} className="flex items-center gap-3 border-t border-border/70 px-5 py-3 first:border-t-0">
              <Avatar name={t.userTag} color="#f5b53d" size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{t.userTag}</p>
                <p className="text-[11px] text-faint">
                  <Hash size={10} className="inline" />
                  {t.channelName} · ticket #{t.number}
                </p>
              </div>
              {pendingByTicket.has(t.id) ? (
                <Badge tone="warning">
                  <Clock3 size={10} /> Foto à espera da gestão
                </Badge>
              ) : (
                <Badge tone="default">À espera da foto</Badge>
              )}
              <span className="text-xs text-muted" title={formatDateTime(t.createdAt)}>
                {formatRelativeDate(t.createdAt)}
              </span>
            </div>
          ))
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-black tracking-wide uppercase">Histórico</h3>
          <p className="text-[11px] text-faint">{history.length} verificação(ões) decididas</p>
        </div>
        {history.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Ainda sem verificações decididas" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold tracking-[0.14em] text-faint uppercase">
                  <th className="px-5 py-3">Membro</th>
                  <th className="px-5 py-3">Resultado</th>
                  <th className="px-5 py-3">Gestor</th>
                  <th className="px-5 py-3">Cargos</th>
                  <th className="px-5 py-3 text-right">Quando</th>
                </tr>
              </thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id} className="border-t border-border/70 transition-colors hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.userTag} color={e.status === 'approved' ? '#22e584' : '#f43f5e'} size="sm" />
                        <span className="font-semibold text-text">{e.userTag}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">{e.status === 'approved' ? <Badge tone="success">✅ Finalizada</Badge> : <Badge tone="danger">✖️ Cancelada</Badge>}</td>
                    <td className="px-5 py-3 text-xs text-muted">
                      {e.moderatorTag ?? '—'}
                      {e.claimedByTag && e.claimedByTag !== e.moderatorTag && <span className="block text-faint">assumido por {e.claimedByTag}</span>}
                      {e.cancelReason && <span className="block text-danger">motivo: {e.cancelReason}</span>}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {e.rolesAdded?.map((n) => (
                        <span key={`a${n}`} className="mr-1 text-success">
                          +@{n}
                        </span>
                      ))}
                      {e.rolesRemoved?.map((n) => (
                        <span key={`r${n}`} className="mr-1 text-danger">
                          −@{n}
                        </span>
                      ))}
                      {!e.rolesAdded?.length && !e.rolesRemoved?.length && <span className="text-faint">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-muted" title={formatDateTime(e.decidedAt ?? e.createdAt)}>
                      {formatRelativeDate(e.decidedAt ?? e.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && templateInfo && (
        <TemplateEditorModal
          open
          onClose={() => {
            setEditing(null)
            refreshLive()
          }}
          kind={editing as EmbedTemplateKind}
          guildId={guildId}
          isRemote={isRemote}
          title={templateInfo.title}
          hint={templateInfo.hint}
          tokens={templateInfo.tokens}
          imageNote={templateInfo.imageNote}
          previewContent={editing === 'verificationTicket' ? '@membro' : undefined}
          previewPlaceholders={templatePlaceholders}
        />
      )}
    </div>
  )
}
