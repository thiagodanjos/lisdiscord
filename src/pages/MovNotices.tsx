import { useEffect, useMemo, useState } from 'react'
import { BellRing, CalendarClock, Hash, Megaphone, Palette, Radio, Repeat, Send, Trash2 } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatDateTime, formatRelativeDate } from '../lib/format'
import { cleanIpcError } from '../lib/errors'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, StatCard } from '../components/ui'
import { RichTextField } from '../components/RichTextField'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import {
  MOV_NOTICE_PLACEHOLDERS,
  type BotEmoji,
  type ChannelPickerEntry,
  type GuildSummary,
  type MovNotice,
  type MovNoticeRepeat,
  type RemoteBotConfig,
  type RolePickerEntry,
} from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const POLL_INTERVAL_MS = 20_000
const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

const REPEAT_LABEL: Record<MovNoticeRepeat, string> = { none: 'Uma vez', daily: 'Todos os dias', weekly: 'Todas as semanas' }
const STATUS_BADGE: Record<MovNotice['status'], { label: string; tone: 'success' | 'danger' | 'default' | 'cyan' }> = {
  pending: { label: 'Agendado', tone: 'cyan' },
  sent: { label: 'Enviado', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' },
  cancelled: { label: 'Cancelado', tone: 'default' },
}

/** `<input type="datetime-local">` usa a hora local sem fuso — converte a partir de/para Date. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function inOneHour(): string {
  const d = new Date(Date.now() + 3_600_000)
  d.setSeconds(0, 0)
  return toLocalInput(d)
}

export default function MovNotices() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [roles, setRoles] = useState<RolePickerEntry[]>([])
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [notices, setNotices] = useState<MovNotice[]>([])
  const [loadError, setLoadError] = useState('')

  const [channelId, setChannelId] = useState('')
  const [when, setWhen] = useState(inOneHour)
  const [roleId, setRoleId] = useState('')
  const [repeat, setRepeat] = useState<MovNoticeRepeat>('none')
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createdOk, setCreatedOk] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState(false)

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
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Não consegui carregar os servidores.'))
    const listEmojis = isRemote ? bridge.listRemoteEmojis : bridge.listEmojis
    listEmojis().then(setEmojis).catch(() => setEmojis([]))
  }, [isRemote])

  useEffect(() => {
    if (!guildId) return
    setLoadError('')
    const listChannels = isRemote ? bridge.listRemoteChannels : bridge.listChannels
    const listRoles = isRemote ? bridge.listRemoteRoles : bridge.listRoles
    listChannels(guildId)
      .then((c) => {
        const text = c.filter((ch) => ch.kind === 'text' || ch.kind === 'announcement')
        setChannels(text)
        setChannelId((prev) => (text.some((ch) => ch.id === prev) ? prev : (text[0]?.id ?? '')))
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Não consegui carregar os canais.'))
    listRoles(guildId).then(setRoles).catch(() => setRoles([]))

    const load = () => {
      const list = isRemote ? bridge.listRemoteMovNotices : bridge.listMovNotices
      list(guildId)
        .then(setNotices)
        .catch((err) => setLoadError(err instanceof Error ? err.message : 'Não consegui carregar os avisos.'))
    }
    load()
    const id = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [guildId, isRemote])

  const pending = useMemo(() => notices.filter((n) => n.status === 'pending').sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [notices])
  const history = useMemo(() => notices.filter((n) => n.status !== 'pending'), [notices])
  const sentTotal = notices.reduce((sum, n) => sum + (n.sentCount ?? 0), 0)

  function quick(minutes: number) {
    const d = new Date(Date.now() + minutes * 60_000)
    d.setSeconds(0, 0)
    setWhen(toLocalInput(d))
  }

  async function create() {
    setCreating(true)
    setCreateError('')
    setCreatedOk(false)
    try {
      const due = new Date(when)
      if (Number.isNaN(due.getTime())) throw new Error('Escolhe uma data e hora válidas.')
      const createNotice = isRemote ? bridge.createRemoteMovNotice : bridge.createMovNotice
      const created = await createNotice(guildId, { channelId, message, mentionRoleId: roleId || null, repeat, dueAt: due.toISOString() })
      setNotices((prev) => [created, ...prev.filter((n) => n.id !== created.id)])
      setMessage('')
      setCreatedOk(true)
      setTimeout(() => setCreatedOk(false), 2500)
    } catch (err) {
      setCreateError(cleanIpcError(err))
    } finally {
      setCreating(false)
    }
  }

  async function cancel(id: string) {
    setCancelling(id)
    try {
      const cancelNotice = isRemote ? bridge.cancelRemoteMovNotice : bridge.cancelMovNotice
      setNotices(await cancelNotice(guildId, id))
    } finally {
      setCancelling(null)
    }
  }

  const selectedRole = roles.find((r) => r.id === roleId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Avisos MOV"
        subtitle="Agenda avisos para um canal — pela app ou com /avisomov no Discord — e o bot publica-os na hora certa"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isRemote && (
              <Badge tone="cyan">
                <Radio size={11} /> A usar o bot remoto
              </Badge>
            )}
            <Button variant="dark" onClick={() => setEditingTemplate(true)} disabled={!guildId}>
              <Palette size={14} />
              Personalizar embed do aviso
            </Button>
          </div>
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
        {loadError && <p className="mt-1.5 text-xs text-danger">❌ {loadError}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Agendados" value={pending.length} icon={CalendarClock} tone="cyan" />
        <StatCard label="Repetidos" value={pending.filter((n) => n.repeat !== 'none').length} hint="diários ou semanais" icon={Repeat} tone="violet" />
        <StatCard label="Publicados" value={sentTotal} icon={Send} tone="green" />
        <StatCard
          label="Próximo aviso"
          value={<span className="text-lg">{pending[0] ? formatRelativeDate(pending[0].dueAt) : '—'}</span>}
          hint={pending[0] ? `em #${pending[0].channelName}` : undefined}
          icon={BellRing}
          tone="pink"
        />
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-accent" />
          <h3 className="text-sm font-black tracking-wide uppercase">Novo aviso</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Canal</label>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={`mt-1.5 ${inputClass}`}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Data e hora</label>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`mt-1.5 ${inputClass}`} />
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Marcar cargo (opcional)</label>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className={`mt-1.5 ${inputClass}`}>
              <option value="">Ninguém</option>
              <option value={guildId}>@everyone</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  @{r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Repetir</label>
            <select value={repeat} onChange={(e) => setRepeat(e.target.value as MovNoticeRepeat)} className={`mt-1.5 ${inputClass}`}>
              <option value="none">Não repetir</option>
              <option value="daily">Todos os dias</option>
              <option value="weekly">Todas as semanas</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-faint">Atalhos:</span>
          {[
            ['+15 min', 15],
            ['+30 min', 30],
            ['+1 h', 60],
            ['+3 h', 180],
            ['+1 dia', 1440],
          ].map(([label, minutes]) => (
            <button
              key={label}
              type="button"
              onClick={() => quick(minutes as number)}
              className="rounded-md border border-border bg-black/20 px-2 py-0.5 text-[11px] font-semibold text-muted hover:border-accent hover:text-accent"
            >
              {label}
            </button>
          ))}
        </div>
        <RichTextField label="Mensagem — entra no {mensagem} do embed" value={message} onChange={setMessage} emojis={emojis} rows={4} maxLength={2000} />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={create} loading={creating} disabled={!guildId || !channelId || !message.trim() || !when}>
            <CalendarClock size={14} />
            {createdOk ? 'Agendado ✓' : 'Agendar aviso'}
          </Button>
          {when && !Number.isNaN(new Date(when).getTime()) && (
            <span className="text-xs text-muted">
              Publica {formatRelativeDate(new Date(when).toISOString())}
              {selectedRole ? ` · marca @${selectedRole.name}` : roleId ? ' · marca @everyone' : ''}
              {repeat !== 'none' ? ` · ${REPEAT_LABEL[repeat].toLowerCase()}` : ''}
            </span>
          )}
        </div>
        {createError && <p className="text-xs text-danger">❌ {createError}</p>}
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-black tracking-wide uppercase">Agendados</h3>
          <p className="text-[11px] text-faint">{pending.length} aviso(s) à espera da hora</p>
        </div>
        {pending.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhum aviso agendado" description="Cria um aqui em cima ou usa /avisomov no Discord." />
          </div>
        ) : (
          <div className="flex flex-col">
            {pending.map((n) => (
              <NoticeRow key={n.id} notice={n} onCancel={() => cancel(n.id)} cancelling={cancelling === n.id} />
            ))}
          </div>
        )}
      </Card>

      {history.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-sm font-black tracking-wide uppercase">Histórico</h3>
            <p className="text-[11px] text-faint">Últimos avisos publicados, falhados ou cancelados</p>
          </div>
          <div className="flex flex-col">
            {history.map((n) => (
              <NoticeRow key={n.id} notice={n} />
            ))}
          </div>
        </Card>
      )}

      <Card className="flex items-start gap-3 text-xs text-muted">
        <Megaphone size={16} className="mt-0.5 shrink-0 text-accent" />
        <p>
          <span className="font-semibold text-text">/avisomov canal: tempo: [mensagem:] [marcar:] [repetir:]</span> — agenda pelo Discord (só gestores). O
          tempo é daqui a quanto (ex.: <code>30m</code>, <code>2h</code>, <code>1h30m</code>, <code>1d</code>); sem mensagem, abre uma janela para escrever com
          várias linhas. O cargo escolhido é marcado por cima do embed, e o visual do embed é o que definires em{' '}
          <span className="font-semibold text-text">Personalizar embed do aviso</span>.
        </p>
      </Card>

      <TemplateEditorModal
        open={editingTemplate}
        onClose={() => setEditingTemplate(false)}
        kind="avisoMov"
        guildId={guildId}
        isRemote={isRemote}
        title="Personalizar embed do aviso"
        hint="Visual de todos os avisos deste servidor. {mensagem} é o texto de cada aviso; {cargo} é o cargo marcado (se houver)."
        tokens={MOV_NOTICE_PLACEHOLDERS}
        previewContent={selectedRole ? `@${selectedRole.name}` : undefined}
        previewPlaceholders={{
          mensagem: message.trim() || 'Mov Call hoje às 21h! Todos na call de eventos 🎉',
          autor: '@gestor',
          nomeAutor: 'gestor',
          avatarAutor: '',
          canal: `#${channels.find((c) => c.id === channelId)?.name ?? 'avisos'}`,
          cargo: selectedRole ? `@${selectedRole.name}` : '',
          servidor: guildName,
        }}
      />
    </div>
  )
}

function NoticeRow({ notice: n, onCancel, cancelling }: { notice: MovNotice; onCancel?: () => void; cancelling?: boolean }) {
  const badge = STATUS_BADGE[n.status]
  return (
    <div className="flex flex-wrap items-start gap-4 border-t border-border/70 px-5 py-4 first:border-t-0">
      <Avatar name={n.createdByTag} color={n.source === 'app' ? '#a855f7' : '#1ed760'} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-black/20 px-2 py-0.5 font-mono text-muted">
            <Hash size={11} />
            {n.channelName}
          </span>
          {n.repeat !== 'none' && (
            <Badge tone="violet">
              <Repeat size={10} /> {REPEAT_LABEL[n.repeat]}
            </Badge>
          )}
          {n.mentionRoleName && <Badge tone="warning">marca @{n.mentionRoleName.replace(/^@/, '')}</Badge>}
          <span className="text-faint">por {n.createdByTag}</span>
        </div>
        <p className="mt-1.5 line-clamp-3 text-sm whitespace-pre-wrap text-text">{n.message}</p>
        {n.error && <p className="mt-1 text-xs text-danger">❌ {n.error}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 text-right">
        <span className="text-xs font-semibold text-text" title={formatDateTime(n.status === 'pending' ? n.dueAt : (n.sentAt ?? n.dueAt))}>
          {formatRelativeDate(n.status === 'pending' ? n.dueAt : (n.sentAt ?? n.dueAt))}
        </span>
        <span className="text-[11px] text-faint">{formatDateTime(n.status === 'pending' ? n.dueAt : (n.sentAt ?? n.dueAt))}</span>
        {(n.sentCount ?? 0) > 0 && n.status === 'pending' && <span className="text-[11px] text-faint">já publicado {n.sentCount}×</span>}
        {onCancel && (
          <Button variant="dark" onClick={onCancel} loading={cancelling}>
            <Trash2 size={13} />
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}
