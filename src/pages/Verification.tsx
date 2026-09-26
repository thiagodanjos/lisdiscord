import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, AtSign, BadgeCheck, Camera, CheckCircle2, Clock3, Hash, ImageIcon, Palette, Radio, ScrollText, ShieldCheck, XCircle } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { formatDateTime, formatRelativeDate } from '../lib/format'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, StatCard, Toggle } from '../components/ui'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import {
  VERIFICATION_LOG_PLACEHOLDERS,
  VERIFICATION_PLACEHOLDERS,
  type BotStatus,
  type ChannelPickerEntry,
  type EmbedTemplateKind,
  type GuildSummary,
  type RemoteBotConfig,
  type RolePickerEntry,
  type VerificationEntry,
  type VerificationSettings,
} from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const POLL_INTERVAL_MS = 15_000
const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

const EMPTY_SETTINGS: VerificationSettings = {
  channelId: null,
  channelName: null,
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

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{children}</label>
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

const STEPS = [
  { icon: Camera, title: 'O membro manda a foto', text: 'Print do perfil com os cargos, no canal de verificação.' },
  { icon: ImageIcon, title: 'O bot recria em embed', text: 'Apaga a mensagem original e publica o embed com a foto e ✅ ❌.' },
  { icon: AtSign, title: 'Marca a gestão', text: 'Uma mensagem simples (sem embed) marca o cargo escolhido.' },
  { icon: ShieldCheck, title: 'Um gestor reage', text: 'Só gestores/administração contam — o embed e a marcação somem, fica só a explicação.' },
]

export default function Verification() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [roles, setRoles] = useState<RolePickerEntry[]>([])
  const [settings, setSettings] = useState<VerificationSettings>(EMPTY_SETTINGS)
  const [draft, setDraft] = useState<VerificationSettings>(EMPTY_SETTINGS)
  const [entries, setEntries] = useState<VerificationEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedOk, setSavedOk] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<EmbedTemplateKind | null>(null)

  const isRemote = Boolean(remoteConfig.url && remoteConfig.hasApiKey)
  const guildName = guilds.find((g) => g.id === guildId)?.name ?? 'este servidor'

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemoteConfig)
    bridge.getStatus().then(setStatus).catch(() => setStatus(null))
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

  useEffect(() => {
    if (!guildId) return
    setLoadError('')
    const listChannels = isRemote ? bridge.listRemoteChannels : bridge.listChannels
    const listRoles = isRemote ? bridge.listRemoteRoles : bridge.listRoles
    const getSettings = isRemote ? bridge.getRemoteVerificationSettings : bridge.getVerificationSettings
    listChannels(guildId)
      .then((c) => setChannels(c.filter((ch) => ch.kind === 'text' || ch.kind === 'announcement')))
      .catch((err) => setLoadError(cleanIpcError(err)))
    listRoles(guildId).then(setRoles).catch(() => setRoles([]))
    getSettings(guildId)
      .then((s) => {
        setSettings(s)
        setDraft(s)
      })
      .catch((err) => setLoadError(cleanIpcError(err)))

    const load = () => {
      const list = isRemote ? bridge.listRemoteVerifications : bridge.listVerifications
      list(guildId).then(setEntries).catch(() => undefined)
    }
    load()
    const id = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [guildId, isRemote])

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const pending = useMemo(() => entries.filter((e) => e.status === 'pending'), [entries])
  const history = useMemo(() => entries.filter((e) => e.status !== 'pending'), [entries])
  const approved = history.filter((e) => e.status === 'approved').length
  const rejected = history.filter((e) => e.status === 'rejected').length
  const roleName = (id: string | null) => roles.find((r) => r.id === id)?.name
  const pingRole = roles.find((r) => r.id === draft.pingRoleId)
  const approversFallback = draft.approverRoleIds.length === 0 && pingRole

  async function save() {
    setSaving(true)
    setSaveError('')
    try {
      const setRemote = isRemote ? bridge.setRemoteVerificationSettings : bridge.setVerificationSettings
      const saved = await setRemote(guildId, draft)
      setSettings(saved)
      setDraft(saved)
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Verificação"
        subtitle="O membro manda o print do perfil com os cargos, o bot transforma-o num embed com ✅ ❌ e marca a gestão para aprovar"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isRemote && (
              <Badge tone="cyan">
                <Radio size={11} /> A usar o bot remoto
              </Badge>
            )}
            {settings.channelId ? (
              <Badge tone="success">
                <Radio size={11} /> Ativa em #{settings.channelName}
              </Badge>
            ) : (
              <Badge tone="warning">Desligada</Badge>
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

      {!isRemote && status?.connected && !status.messageContentEnabled && (
        <Card className="flex items-start gap-3 border-warning/40 text-xs text-muted">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <p>
            A intent <span className="font-semibold text-text">Message Content</span> está desligada — sem ela a Discord não manda as imagens ao bot e a
            verificação fica parada. Ativa-a em <span className="font-semibold text-text">Developer Portal → Bot → Privileged Gateway Intents</span> e liga o
            bot outra vez.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((step, i) => (
          <Card key={step.title} className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <step.icon size={17} />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Passo {i + 1}</p>
              <p className="text-sm font-bold text-text">{step.title}</p>
              <p className="mt-0.5 text-xs text-muted">{step.text}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BadgeCheck size={16} className="text-accent" />
            <h3 className="text-sm font-black tracking-wide uppercase">Configuração</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" onClick={() => setEditing('verificationRequest')} disabled={!guildId}>
              <Palette size={14} />
              Personalizar embed da verificação
            </Button>
            <Button variant="dark" onClick={() => setEditing('verificationLog')} disabled={!guildId}>
              <ScrollText size={14} />
              Personalizar log
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Canal de verificação</Label>
            <select
              value={draft.channelId ?? ''}
              onChange={(e) => setDraft({ ...draft, channelId: e.target.value || null })}
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="">Desligada</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-faint">Onde os membros mandam a foto. A mensagem de explicação que já lá tens fica intacta.</p>
          </div>
          <div>
            <Label>Cargo a marcar</Label>
            <select
              value={draft.pingRoleId ?? ''}
              onChange={(e) => setDraft({ ...draft, pingRoleId: e.target.value || null })}
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="">Não marcar ninguém</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  @{r.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-faint">Ex.: @Gestão — marcado numa mensagem simples, sem embed, logo a seguir ao embed.</p>
          </div>
          <div>
            <Label>Texto da marcação</Label>
            <input
              value={draft.pingText}
              onChange={(e) => setDraft({ ...draft, pingText: e.target.value })}
              className={`mt-1.5 ${inputClass}`}
              maxLength={300}
              placeholder="{cargo}"
            />
            <p className="mt-1 text-[11px] text-faint">
              Tokens: <code>{'{cargo}'}</code> <code>{'{membro}'}</code> · fica assim: <span className="text-muted">{pingPreview}</span>
            </p>
          </div>
          <div>
            <Label>Canal de log (opcional)</Label>
            <select
              value={draft.logChannelId ?? ''}
              onChange={(e) => setDraft({ ...draft, logChannelId: e.target.value || null })}
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="">Sem log</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-faint">Guarda o resultado de cada verificação, com a foto, depois de o embed ser apagado.</p>
          </div>
        </div>

        <div>
          <Label>Quem pode aprovar ✅ / recusar ❌</Label>
          <RoleChips roles={roles} selected={draft.approverRoleIds} onChange={(ids) => setDraft({ ...draft, approverRoleIds: ids })} tone="border-accent bg-accent-soft" />
          <p className="mt-1 text-[11px] text-faint">
            Quem tem <span className="text-muted">Administrador</span> pode sempre.{' '}
            {approversFallback ? `Sem cargos escolhidos, vale o cargo marcado (@${pingRole.name}).` : ''} Reações de mais alguém são removidas na hora.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Dar cargos ao aprovar (opcional)</Label>
            <RoleChips roles={roles} selected={draft.addRoleIds} onChange={(ids) => setDraft({ ...draft, addRoleIds: ids })} tone="border-success bg-success/10" />
          </div>
          <div>
            <Label>Tirar cargos ao aprovar (opcional)</Label>
            <RoleChips roles={roles} selected={draft.removeRoleIds} onChange={(ids) => setDraft({ ...draft, removeRoleIds: ids })} tone="border-danger bg-danger/10" />
            <p className="mt-1 text-[11px] text-faint">Ex.: tirar o @Novato. O cargo do bot tem de estar acima destes cargos.</p>
          </div>
        </div>

        <Toggle
          checked={draft.deleteNonImage}
          onChange={(v) => setDraft({ ...draft, deleteNonImage: v })}
          label="Apagar mensagens sem imagem no canal (com um aviso que desaparece sozinho) — mensagens da gestão nunca são apagadas"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} loading={saving} disabled={!guildId || !dirty}>
            {savedOk ? 'Guardado ✓' : 'Guardar configuração'}
          </Button>
          {dirty && <span className="text-xs text-warning">Alterações por guardar</span>}
        </div>
        {saveError && <p className="text-xs text-danger">❌ {saveError}</p>}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="À espera" value={pending.length} icon={Clock3} tone="amber" />
        <StatCard label="Aprovadas" value={approved} icon={CheckCircle2} tone="green" />
        <StatCard label="Recusadas" value={rejected} icon={XCircle} tone="pink" />
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-black tracking-wide uppercase">À espera de um gestor</h3>
          <p className="text-[11px] text-faint">Pedidos com o embed publicado e ainda sem ✅ ou ❌</p>
        </div>
        {pending.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhuma verificação à espera" description="Quando alguém mandar a foto no canal, aparece aqui." />
          </div>
        ) : (
          pending.map((e) => (
            <div key={e.id} className="flex items-center gap-3 border-t border-border/70 px-5 py-3 first:border-t-0">
              <Avatar name={e.userTag} color="#f5b53d" size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{e.userTag}</p>
                <p className="text-[11px] text-faint">
                  {e.imageCount} imagem(ns) · <Hash size={10} className="inline" />
                  {settings.channelName ?? 'canal'}
                </p>
              </div>
              <span className="text-xs text-muted" title={formatDateTime(e.createdAt)}>
                {formatRelativeDate(e.createdAt)}
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
                    <td className="px-5 py-3">
                      {e.status === 'approved' ? <Badge tone="success">✅ Aprovada</Badge> : <Badge tone="danger">❌ Recusada</Badge>}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted">{e.moderatorTag ?? '—'}</td>
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

      <Card className="flex items-start gap-3 text-xs text-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" />
        <p>
          O bot precisa, no canal de verificação, de: <span className="text-text">Ver canal, Enviar mensagens, Inserir links, Anexar ficheiros, Adicionar
          reações, Gerir mensagens e Ler histórico</span> — ao guardar, a app confirma tudo isto. Se o mesmo membro mandar outra foto antes de ser visto, o
          pedido antigo é substituído. {roleName(draft.pingRoleId) ? '' : 'Sem cargo a marcar, só aparece o embed.'}
        </p>
      </Card>

      <TemplateEditorModal
        open={editing === 'verificationRequest'}
        onClose={() => setEditing(null)}
        kind="verificationRequest"
        guildId={guildId}
        isRemote={isRemote}
        title="Personalizar embed da verificação"
        hint="Embed publicado com a foto do membro, com as reações ✅ e ❌ por baixo. {avatar} serve como URL de miniatura ou ícone."
        tokens={VERIFICATION_PLACEHOLDERS}
        imageNote="A imagem grande é sempre a foto que o membro mandou."
        previewPlaceholders={{
          membro: '@membro',
          nome: 'membro',
          avatar: '',
          id: '123456789012345678',
          criada: '12/03/2023',
          entrou: 'há 2 dias',
          servidor: guildName,
        }}
      />
      <TemplateEditorModal
        open={editing === 'verificationLog'}
        onClose={() => setEditing(null)}
        kind="verificationLog"
        guildId={guildId}
        isRemote={isRemote}
        title="Personalizar log da verificação"
        hint="Enviado para o canal de log quando um gestor aprova ou recusa. {estado} fica 'aprovada ✅' ou 'recusada ❌'."
        tokens={VERIFICATION_LOG_PLACEHOLDERS}
        imageNote="A imagem grande é sempre a foto que o membro mandou."
        previewPlaceholders={{
          membro: '@membro',
          nome: 'membro',
          avatar: '',
          id: '123456789012345678',
          estado: 'aprovada ✅',
          moderador: '@gestor',
          cargosDados: '@Membro',
          cargosTirados: '@Novato',
          servidor: guildName,
        }}
      />
    </div>
  )
}
