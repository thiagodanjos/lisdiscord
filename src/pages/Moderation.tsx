import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Clock,
  Gavel,
  Hash,
  Headphones,
  Lock,
  LogOut,
  MessageSquareWarning,
  MicOff,
  Palette,
  Pencil,
  PhoneOff,
  Plus,
  ScrollText,
  Search,
  Shield,
  ShieldOff,
  Tag,
  Trash2,
  Unlock,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { formatDateTime, formatRelativeDate } from '../lib/format'
import { inputClass } from '../lib/styles'
import { useGuildContext } from '../lib/useGuildContext'
import { Badge, Button, Card, ConfirmDialog, Modal, PageHeader, Tabs, Toggle } from '../components/ui'
import { GuildSelect, Label, RemoteBadge, SectionTitle } from '../components/form'
import type { MemberSearchResult, ModerationBan, ModerationLogEntry, ModerationMember, ModerationOp, ModerationRole, ModerationState } from '../../shared/types'

type Tab = 'members' | 'roles' | 'bans' | 'channels' | 'log'

const TIMEOUTS = [
  { label: '1 min', ms: 60_000 },
  { label: '5 min', ms: 300_000 },
  { label: '10 min', ms: 600_000 },
  { label: '1 hora', ms: 3_600_000 },
  { label: '1 dia', ms: 86_400_000 },
  { label: '1 semana', ms: 604_800_000 },
]

const SLOWMODES = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600]

const ACTION_LABEL: Record<ModerationLogEntry['action'], { label: string; tone: 'danger' | 'warning' | 'default' | 'accent' | 'cyan' }> = {
  ban: { label: 'Banido', tone: 'danger' },
  unban: { label: 'Desbanido', tone: 'accent' },
  kick: { label: 'Expulso', tone: 'warning' },
  timeout: { label: 'Castigo', tone: 'warning' },
  removeTimeout: { label: 'Castigo removido', tone: 'accent' },
  addRole: { label: 'Cargo dado', tone: 'accent' },
  removeRole: { label: 'Cargo tirado', tone: 'warning' },
  nickname: { label: 'Apelido', tone: 'default' },
  warn: { label: 'Aviso', tone: 'warning' },
  voiceDisconnect: { label: 'Tirado da call', tone: 'warning' },
  voiceMute: { label: 'Silenciar', tone: 'default' },
  voiceDeafen: { label: 'Ensurdecer', tone: 'default' },
  slowmode: { label: 'Modo lento', tone: 'cyan' },
  purge: { label: 'Mensagens apagadas', tone: 'danger' },
  massRole: { label: 'Cargo em massa', tone: 'cyan' },
  createRole: { label: 'Cargo criado', tone: 'accent' },
  editRole: { label: 'Cargo editado', tone: 'default' },
  deleteRole: { label: 'Cargo apagado', tone: 'danger' },
  lockChannel: { label: 'Canal bloqueado', tone: 'danger' },
  unlockChannel: { label: 'Canal desbloqueado', tone: 'accent' },
}

function seconds(n: number): string {
  if (n === 0) return 'Desligado'
  if (n < 60) return `${n}s`
  if (n < 3600) return `${n / 60} min`
  return `${n / 3600} h`
}

function RoleDot({ color }: { color: string }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color === '#000000' ? '#99aab5' : color }} />
}

function MemberAvatar({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt="" className="shrink-0 rounded-full" style={{ width: size, height: size }} />
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-black text-accent" style={{ width: size, height: size }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

interface Confirm {
  title: string
  description: string
  label: string
  op: ModerationOp
  danger?: boolean
}

export default function Moderation() {
  const ctx = useGuildContext({ channels: true })
  const { isRemote, guildId } = ctx
  const [tab, setTab] = useState<Tab>('members')
  const [state, setState] = useState<ModerationState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  // Membros
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MemberSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [member, setMember] = useState<ModerationMember | null>(null)
  const [nick, setNick] = useState('')
  const [reason, setReason] = useState('')
  const [timeoutMs, setTimeoutMs] = useState(600_000)
  const [customMinutes, setCustomMinutes] = useState('')
  const [addRoleId, setAddRoleId] = useState('')
  const [deleteDays, setDeleteDays] = useState(0)

  // Banidos
  const [bans, setBans] = useState<ModerationBan[] | null>(null)
  const [banFilter, setBanFilter] = useState('')
  const [banId, setBanId] = useState('')

  // Cargos
  const [roleEdit, setRoleEdit] = useState<{ id: string | null; name: string; color: string; hoist: boolean; mentionable: boolean } | null>(null)
  const [massRoleId, setMassRoleId] = useState('')
  const [massMode, setMassMode] = useState<'add' | 'remove'>('add')
  const [massFilter, setMassFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  // Canais
  const [channelId, setChannelId] = useState('')
  const [slowmode, setSlowmode] = useState(0)
  const [purgeCount, setPurgeCount] = useState(20)
  const [purgeUser, setPurgeUser] = useState('')

  const roles = useMemo(() => state?.roles ?? [], [state])
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const editableRoles = roles.filter((r) => r.editable)

  function loadState() {
    if (!guildId) return
    bridge
      .getModerationState(guildId, isRemote)
      .then(setState)
      .catch((err) => setError(cleanIpcError(err)))
  }

  useEffect(() => {
    setState(null)
    setMember(null)
    setResults([])
    setBans(null)
    setNote('')
    setError('')
    loadState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  useEffect(() => {
    if (!channelId && ctx.channels[0]) setChannelId(ctx.channels[0].id)
  }, [ctx.channels, channelId])

  useEffect(() => {
    if (!guildId || !query.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    const t = setTimeout(() => {
      (isRemote ? bridge.searchRemoteMembers : bridge.searchMembers)(guildId, query)
        .then(setResults)
        .catch((err) => setError(cleanIpcError(err)))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [guildId, query, isRemote])

  useEffect(() => {
    if (tab === 'bans' && bans === null && guildId) loadBans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, guildId])

  function loadBans() {
    bridge
      .listModerationBans(guildId, isRemote)
      .then(setBans)
      .catch((err) => {
        setBans([])
        setError(cleanIpcError(err))
      })
  }

  async function openMember(id: string) {
    setError('')
    setNote('')
    try {
      const m = await bridge.getModerationMember(guildId, id, isRemote)
      setMember(m)
      setNick(m.nickname ?? '')
      setReason('')
      setAddRoleId('')
    } catch (err) {
      setError(cleanIpcError(err))
    }
  }

  async function run(op: ModerationOp, key: string = op.kind) {
    setBusy(key)
    setError('')
    setNote('')
    try {
      const r = await bridge.moderationAction(guildId, op, isRemote)
      setNote(r.message)
      if ('member' in r) {
        if (r.member) {
          setMember(r.member)
          setNick(r.member.nickname ?? '')
        } else if (op.kind === 'ban' || op.kind === 'kick') {
          setMember(null)
          setResults((list) => list.filter((x) => x.id !== ('userId' in op ? op.userId : '')))
        }
      }
      if (r.state) setState(r.state)
      else loadState()
      if (op.kind === 'unban' || op.kind === 'ban') loadBans()
      return true
    } catch (err) {
      setError(cleanIpcError(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  const memberRoles = member ? member.roleIds.map((id) => roleById.get(id)).filter((r): r is ModerationRole => Boolean(r)) : []
  const addable = member ? editableRoles.filter((r) => !member.roleIds.includes(r.id)) : []
  const visibleRoles = roles.filter((r) => r.name.toLowerCase().includes(roleFilter.trim().toLowerCase()))
  const visibleBans = (bans ?? []).filter((b) => !banFilter.trim() || b.tag.toLowerCase().includes(banFilter.trim().toLowerCase()) || b.userId.includes(banFilter.trim()))
  const channelName = ctx.channels.find((c) => c.id === channelId)?.name ?? 'canal'
  const timedOut = member?.timedOutUntil && new Date(member.timedOutUntil).getTime() > Date.now()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Moderação"
        subtitle="Tudo o que é de moderação, sem sair da app: membros, cargos, castigos, banidos, canais e o registo de quem fez o quê"
        action={<RemoteBadge show={isRemote} />}
      />

      <div className="flex flex-wrap items-end gap-4">
        <GuildSelect guilds={ctx.guilds} value={guildId} onChange={ctx.setGuildId} />
        <Tabs
          tabs={[
            { id: 'members', label: 'Membros' },
            { id: 'roles', label: 'Cargos' },
            { id: 'bans', label: 'Banidos' },
            { id: 'channels', label: 'Canais' },
            { id: 'log', label: 'Registo' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {(error || ctx.error) && (
        <p className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error || ctx.error}
        </p>
      )}
      {note && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">✅ {note}</p>}

      {/* ===================== Membros ===================== */}
      {tab === 'members' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="flex flex-col gap-3 self-start">
            <SectionTitle icon={Search} title="Procurar membro" subtitle="Pelo nome, apelido ou ID" />
            <div className="relative">
              <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou ID…" className={`pl-9 ${inputClass}`} />
            </div>
            {searching && <p className="text-xs text-faint">A procurar…</p>}
            {!searching && query.trim() && results.length === 0 && <p className="text-xs text-faint">Ninguém encontrado.</p>}
            <div className="flex flex-col gap-1.5">
              {results.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void openMember(m.id)}
                  className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${member?.id === m.id ? 'border-accent bg-accent-soft' : 'border-border bg-black/20 hover:border-border-strong'}`}
                >
                  <MemberAvatar url={m.avatarUrl} name={m.tag} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{m.tag}</span>
                  {m.isBot && <Badge>Bot</Badge>}
                  {m.isTimedOut && <Badge tone="warning">Castigo</Badge>}
                </button>
              ))}
            </div>
          </Card>

          {!member ? (
            <Card className="flex min-h-64 flex-col items-center justify-center gap-2 text-center">
              <UserCog size={28} className="text-faint" />
              <p className="text-sm text-muted">Procura e escolhe um membro para dar/tirar cargos, mudar o apelido, castigar, tirar da call, avisar, expulsar ou banir.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              <Card className="flex flex-wrap items-center gap-4">
                <MemberAvatar url={member.avatarUrl} name={member.displayName} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-extrabold text-text">{member.displayName}</p>
                  <p className="truncate font-mono text-xs text-faint">
                    {member.tag} · {member.id}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {member.isOwner && <Badge tone="violet">Dono do servidor</Badge>}
                    {member.isBot && <Badge>Bot</Badge>}
                    {timedOut && <Badge tone="warning">De castigo até {formatDateTime(member.timedOutUntil!)}</Badge>}
                    {member.voiceChannelName && <Badge tone="cyan">🔊 {member.voiceChannelName}</Badge>}
                    {member.joinedAt && <Badge>Entrou {formatRelativeDate(member.joinedAt)}</Badge>}
                    <Badge>Conta criada {formatRelativeDate(member.createdAt)}</Badge>
                  </div>
                </div>
                <button onClick={() => setMember(null)} className="self-start rounded-md p-1 text-faint hover:bg-white/5 hover:text-text" title="Fechar">
                  <X size={16} />
                </button>
              </Card>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="flex flex-col gap-3">
                  <SectionTitle icon={Tag} title="Cargos" subtitle={`${memberRoles.length} cargo(s). Só aparecem para dar os que o bot consegue gerir.`} />
                  <div className="flex flex-wrap gap-1.5">
                    {memberRoles.length === 0 && <p className="text-xs text-faint">Sem cargos.</p>}
                    {memberRoles.map((r) => (
                      <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-black/20 py-1 pr-1 pl-2.5 text-[11px] font-semibold text-text">
                        <RoleDot color={r.color} />
                        {r.name}
                        {r.editable ? (
                          <button
                            onClick={() => void run({ kind: 'removeRole', userId: member.id, roleId: r.id, reason }, `rm:${r.id}`)}
                            disabled={busy === `rm:${r.id}`}
                            className="rounded-full p-0.5 text-faint hover:bg-danger/20 hover:text-danger"
                            title="Tirar cargo"
                          >
                            <X size={12} />
                          </button>
                        ) : (
                          <span className="px-1 text-faint" title="Acima do cargo do bot ou de integração">
                            🔒
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <select value={addRoleId} onChange={(e) => setAddRoleId(e.target.value)} className={inputClass}>
                      <option value="">Dar um cargo…</option>
                      {addable.map((r) => (
                        <option key={r.id} value={r.id}>
                          @{r.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      onClick={async () => {
                        if (await run({ kind: 'addRole', userId: member.id, roleId: addRoleId, reason }, 'addRole')) setAddRoleId('')
                      }}
                      loading={busy === 'addRole'}
                      disabled={!addRoleId}
                    >
                      <Plus size={14} /> Dar
                    </Button>
                  </div>
                </Card>

                <Card className="flex flex-col gap-3">
                  <SectionTitle icon={Pencil} title="Apelido" subtitle="Vazio = volta ao nome normal." />
                  <div className="flex gap-2">
                    <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={32} placeholder={member.tag.split('#')[0]} className={inputClass} />
                    <Button variant="dark" onClick={() => void run({ kind: 'nickname', userId: member.id, nickname: nick })} loading={busy === 'nickname'} disabled={!member.manageable || nick === (member.nickname ?? '')}>
                      Guardar
                    </Button>
                  </div>
                  {!member.manageable && <p className="text-[11px] text-warning">O bot não consegue mudar o apelido deste membro (cargo acima do bot).</p>}
                  <div>
                    <Label>Motivo (usado nas ações abaixo e nos cargos)</Label>
                    <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={400} placeholder="Opcional — fica no registo de auditoria do Discord" className={`mt-1.5 ${inputClass}`} />
                  </div>
                </Card>

                <Card className="flex flex-col gap-3">
                  <SectionTitle icon={Clock} title="Castigo (timeout)" subtitle="Não consegue escrever, falar nem reagir até acabar. Máximo 28 dias." />
                  <div className="flex flex-wrap gap-1.5">
                    {TIMEOUTS.map((t) => (
                      <button
                        key={t.ms}
                        type="button"
                        onClick={() => {
                          setTimeoutMs(t.ms)
                          setCustomMinutes('')
                        }}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${timeoutMs === t.ms && !customMinutes ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-text'}`}
                      >
                        {t.label}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      max={40320}
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      placeholder="minutos"
                      className="w-24 rounded-full border border-border bg-black/30 px-3 py-1 text-xs text-text focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="dark"
                      onClick={() => void run({ kind: 'timeout', userId: member.id, durationMs: customMinutes ? Number(customMinutes) * 60_000 : timeoutMs, reason })}
                      loading={busy === 'timeout'}
                      disabled={!member.moderatable}
                    >
                      <Clock size={14} /> Castigar
                    </Button>
                    {timedOut && (
                      <Button variant="dark" onClick={() => void run({ kind: 'removeTimeout', userId: member.id })} loading={busy === 'removeTimeout'}>
                        <ShieldOff size={14} /> Tirar castigo
                      </Button>
                    )}
                  </div>
                  {!member.moderatable && <p className="text-[11px] text-warning">O bot não consegue castigar este membro (administrador ou cargo acima do bot).</p>}
                </Card>

                <Card className="flex flex-col gap-3">
                  <SectionTitle icon={Headphones} title="Call" subtitle={member.voiceChannelName ? `Está em 🔊 ${member.voiceChannelName}` : 'Não está em nenhuma call agora.'} />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="dark" onClick={() => void run({ kind: 'voiceDisconnect', userId: member.id })} loading={busy === 'voiceDisconnect'} disabled={!member.voiceChannelId}>
                      <PhoneOff size={14} /> Tirar da call
                    </Button>
                    <Button variant="dark" onClick={() => void run({ kind: 'voiceMute', userId: member.id, on: !member.serverMuted })} loading={busy === 'voiceMute'} disabled={!member.voiceChannelId}>
                      <MicOff size={14} /> {member.serverMuted ? 'Tirar silêncio' : 'Silenciar'}
                    </Button>
                    <Button variant="dark" onClick={() => void run({ kind: 'voiceDeafen', userId: member.id, on: !member.serverDeafened })} loading={busy === 'voiceDeafen'} disabled={!member.voiceChannelId}>
                      <Headphones size={14} /> {member.serverDeafened ? 'Tirar ensurdecer' : 'Ensurdecer'}
                    </Button>
                  </div>
                </Card>
              </div>

              <Card className="flex flex-col gap-3 border-danger/30">
                <SectionTitle icon={Gavel} title="Avisar · expulsar · banir" subtitle="Usa o motivo escrito acima." />
                <div className="flex flex-wrap items-end gap-2">
                  <Button variant="dark" onClick={() => void run({ kind: 'warn', userId: member.id, reason })} loading={busy === 'warn'} disabled={!reason.trim()}>
                    <MessageSquareWarning size={14} /> Avisar por DM
                  </Button>
                  <Button
                    variant="dark"
                    disabled={!member.kickable}
                    onClick={() =>
                      setConfirm({ title: `Expulsar ${member.displayName}?`, description: 'Sai do servidor, mas pode voltar a entrar com um convite.', label: 'Expulsar', danger: true, op: { kind: 'kick', userId: member.id, reason } })
                    }
                  >
                    <LogOut size={14} /> Expulsar
                  </Button>
                  <div>
                    <Label>Apagar mensagens dos últimos</Label>
                    <select value={deleteDays} onChange={(e) => setDeleteDays(Number(e.target.value))} className={`mt-1.5 ${inputClass}`}>
                      <option value={0}>Não apagar</option>
                      <option value={1}>1 dia</option>
                      <option value={3}>3 dias</option>
                      <option value={7}>7 dias</option>
                    </select>
                  </div>
                  <Button
                    variant="danger"
                    disabled={!member.bannable}
                    onClick={() =>
                      setConfirm({
                        title: `Banir ${member.displayName}?`,
                        description: 'Sai do servidor e não pode voltar até ser desbanido (separador Banidos).',
                        label: 'Banir',
                        danger: true,
                        op: { kind: 'ban', userId: member.id, reason, deleteMessageSeconds: deleteDays * 86_400 },
                      })
                    }
                  >
                    <Ban size={14} /> Banir
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ===================== Cargos ===================== */}
      {tab === 'roles' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="flex flex-col gap-3">
            <SectionTitle
              icon={Shield}
              title="Cargos do servidor"
              subtitle="🔒 = acima do cargo do bot (ou de integração) — não dá para mexer. Sobe o cargo do bot no Discord para os gerir."
              action={
                <Button onClick={() => setRoleEdit({ id: null, name: '', color: '#1ED760', hoist: false, mentionable: false })}>
                  <Plus size={14} /> Novo cargo
                </Button>
              }
            />
            <input value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} placeholder="Filtrar cargos…" className={inputClass} />
            <div className="flex max-h-[560px] flex-col gap-1 overflow-y-auto">
              {!state && <p className="text-xs text-faint">A carregar…</p>}
              {visibleRoles.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-black/20 px-3 py-2">
                  <RoleDot color={r.color} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{r.name}</span>
                  <span className="text-[11px] text-faint">
                    <Users size={11} className="mr-1 inline" />
                    {r.memberCount}
                  </span>
                  {r.managed && <Badge>Integração</Badge>}
                  {r.editable ? (
                    <>
                      <button
                        onClick={() => setRoleEdit({ id: r.id, name: r.name, color: r.color === '#000000' ? '#99AAB5' : r.color, hoist: r.hoist, mentionable: r.mentionable })}
                        className="rounded-md p-1.5 text-faint hover:bg-white/5 hover:text-text"
                        title="Editar"
                      >
                        <Palette size={14} />
                      </button>
                      <button
                        onClick={() =>
                          setConfirm({ title: `Apagar @${r.name}?`, description: `Quem tem o cargo (${r.memberCount}) perde-o. Não dá para desfazer.`, label: 'Apagar cargo', danger: true, op: { kind: 'deleteRole', roleId: r.id } })
                        }
                        className="rounded-md p-1.5 text-faint hover:bg-danger/10 hover:text-danger"
                        title="Apagar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  ) : (
                    <span className="px-1.5 text-faint" title="O bot não consegue gerir este cargo">
                      🔒
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 self-start">
            <SectionTitle icon={Users} title="Cargo em massa" subtitle="Dá ou tira um cargo a toda a gente (ou só a quem tem outro cargo). Bots ficam de fora." />
            <div className="grid grid-cols-2 gap-2">
              {(['add', 'remove'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMassMode(m)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${massMode === m ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:text-text'}`}
                >
                  {m === 'add' ? 'Dar cargo' : 'Tirar cargo'}
                </button>
              ))}
            </div>
            <div>
              <Label>Cargo</Label>
              <select value={massRoleId} onChange={(e) => setMassRoleId(e.target.value)} className={`mt-1.5 ${inputClass}`}>
                <option value="">Escolhe…</option>
                {editableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Só a quem tem (opcional)</Label>
              <select value={massFilter} onChange={(e) => setMassFilter(e.target.value)} className={`mt-1.5 ${inputClass}`}>
                <option value="">Toda a gente</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="dark"
              disabled={!massRoleId}
              loading={busy === 'massRole'}
              onClick={() =>
                setConfirm({
                  title: massMode === 'add' ? 'Dar o cargo a todos?' : 'Tirar o cargo a todos?',
                  description: `@${roleById.get(massRoleId)?.name} vai ser ${massMode === 'add' ? 'dado a' : 'tirado a'} ${massFilter ? `todos com @${roleById.get(massFilter)?.name}` : 'toda a gente do servidor'}. Em servidores grandes pode demorar alguns minutos.`,
                  label: 'Confirmar',
                  op: { kind: 'massRole', roleId: massRoleId, mode: massMode, filterRoleId: massFilter || null },
                })
              }
            >
              <Users size={14} /> Aplicar
            </Button>
          </Card>
        </div>
      )}

      {/* ===================== Banidos ===================== */}
      {tab === 'bans' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="flex flex-col gap-3">
            <SectionTitle icon={Ban} title="Banidos" subtitle={bans ? `${bans.length} banido(s)` : 'A carregar…'} action={<Button variant="dark" onClick={loadBans}>Atualizar</Button>} />
            <input value={banFilter} onChange={(e) => setBanFilter(e.target.value)} placeholder="Filtrar por nome ou ID…" className={inputClass} />
            <div className="flex max-h-[560px] flex-col gap-1.5 overflow-y-auto">
              {bans?.length === 0 && <p className="text-xs text-faint">Ninguém banido.</p>}
              {visibleBans.map((b) => (
                <div key={b.userId} className="flex items-center gap-3 rounded-lg border border-border bg-black/20 px-3 py-2">
                  <MemberAvatar url={b.avatarUrl} name={b.tag} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{b.tag}</p>
                    <p className="truncate text-[11px] text-faint">
                      {b.userId}
                      {b.reason ? ` · ${b.reason}` : ''}
                    </p>
                  </div>
                  <Button variant="dark" onClick={() => void run({ kind: 'unban', userId: b.userId, reason: '' }, `unban:${b.userId}`)} loading={busy === `unban:${b.userId}`}>
                    <Unlock size={13} /> Desbanir
                  </Button>
                </div>
              ))}
            </div>
          </Card>
          <Card className="flex flex-col gap-3 self-start">
            <SectionTitle icon={Gavel} title="Banir por ID" subtitle="Também funciona com quem já não está no servidor (impede de entrar)." />
            <input value={banId} onChange={(e) => setBanId(e.target.value.replace(/\D/g, ''))} placeholder="ID do utilizador" className={`font-mono ${inputClass}`} />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)" className={inputClass} />
            <Button
              variant="danger"
              disabled={!/^\d{17,20}$/.test(banId)}
              onClick={() => setConfirm({ title: 'Banir este ID?', description: `O utilizador ${banId} fica banido do servidor.`, label: 'Banir', danger: true, op: { kind: 'ban', userId: banId, reason, deleteMessageSeconds: 0 } })}
            >
              <Ban size={14} /> Banir
            </Button>
          </Card>
        </div>
      )}

      {/* ===================== Canais ===================== */}
      {tab === 'channels' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="flex flex-col gap-3 lg:col-span-3">
            <div className="max-w-sm">
              <Label>Canal</Label>
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={`mt-1.5 ${inputClass}`}>
                {ctx.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </div>
          </Card>
          <Card className="flex flex-col gap-3">
            <SectionTitle icon={Lock} title="Bloquear" subtitle="Ninguém (exceto quem tem permissões) consegue escrever." />
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => void run({ kind: 'lockChannel', channelId })} loading={busy === 'lockChannel'} disabled={!channelId}>
                <Lock size={14} /> Bloquear
              </Button>
              <Button variant="dark" onClick={() => void run({ kind: 'unlockChannel', channelId })} loading={busy === 'unlockChannel'} disabled={!channelId}>
                <Unlock size={14} /> Desbloquear
              </Button>
            </div>
          </Card>
          <Card className="flex flex-col gap-3">
            <SectionTitle icon={Clock} title="Modo lento" subtitle="Tempo mínimo entre mensagens de cada pessoa." />
            <div className="flex gap-2">
              <select value={slowmode} onChange={(e) => setSlowmode(Number(e.target.value))} className={inputClass}>
                {SLOWMODES.map((s) => (
                  <option key={s} value={s}>
                    {seconds(s)}
                  </option>
                ))}
              </select>
              <Button variant="dark" onClick={() => void run({ kind: 'slowmode', channelId, seconds: slowmode })} loading={busy === 'slowmode'} disabled={!channelId}>
                Aplicar
              </Button>
            </div>
          </Card>
          <Card className="flex flex-col gap-3">
            <SectionTitle icon={Trash2} title="Apagar mensagens" subtitle="As mais recentes (só com menos de 14 dias)." />
            <div className="flex gap-2">
              <input type="number" min={1} max={500} value={purgeCount} onChange={(e) => setPurgeCount(Number(e.target.value))} className={`w-24 ${inputClass}`} />
              <input value={purgeUser} onChange={(e) => setPurgeUser(e.target.value.replace(/\D/g, ''))} placeholder="Só de um ID (opcional)" className={`font-mono ${inputClass}`} />
            </div>
            <Button
              variant="danger"
              disabled={!channelId || purgeCount < 1}
              loading={busy === 'purge'}
              onClick={() =>
                setConfirm({
                  title: `Apagar ${purgeCount} mensagens?`,
                  description: `Em #${channelName}${purgeUser ? `, só as de ${purgeUser}` : ''}. Não dá para recuperar.`,
                  label: 'Apagar',
                  danger: true,
                  op: { kind: 'purge', channelId, count: purgeCount, userId: purgeUser || null },
                })
              }
            >
              <Hash size={14} /> Apagar
            </Button>
          </Card>
        </div>
      )}

      {/* ===================== Registo ===================== */}
      {tab === 'log' && (
        <Card className="flex flex-col gap-2">
          <SectionTitle icon={ScrollText} title="Registo de moderação" subtitle="Tudo o que foi feito pela app (e por quem)." action={<Button variant="dark" onClick={loadState}>Atualizar</Button>} />
          {state?.log.length === 0 && <p className="text-sm text-muted">Ainda sem ações registadas.</p>}
          {state?.log.map((entry) => {
            const info = ACTION_LABEL[entry.action] ?? { label: entry.action, tone: 'default' as const }
            return (
              <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-border bg-black/20 px-3 py-2">
                <Badge tone={info.tone}>{info.label}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">
                    <span className="font-semibold">{entry.targetTag}</span>
                    {entry.detail ? <span className="text-muted"> · {entry.detail}</span> : null}
                  </p>
                  {(entry.reason || entry.actor) && (
                    <p className="truncate text-xs text-muted">
                      {entry.reason}
                      {entry.reason && entry.actor ? ' · ' : ''}
                      {entry.actor ? `por ${entry.actor}` : ''}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted">{formatRelativeDate(entry.date)}</span>
              </div>
            )
          })}
        </Card>
      )}

      <Modal open={roleEdit !== null} onClose={() => setRoleEdit(null)} title={roleEdit?.id ? 'Editar cargo' : 'Novo cargo'}>
        {roleEdit && (
          <div className="flex flex-col gap-3">
            <div>
              <Label>Nome</Label>
              <input value={roleEdit.name} onChange={(e) => setRoleEdit({ ...roleEdit, name: e.target.value })} maxLength={100} className={`mt-1.5 ${inputClass}`} />
            </div>
            <div>
              <Label>Cor</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <input type="color" value={roleEdit.color} onChange={(e) => setRoleEdit({ ...roleEdit, color: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent" />
                <input value={roleEdit.color} onChange={(e) => setRoleEdit({ ...roleEdit, color: e.target.value })} className={`font-mono ${inputClass}`} />
              </div>
            </div>
            <Toggle checked={roleEdit.hoist} onChange={(hoist) => setRoleEdit({ ...roleEdit, hoist })} label="Mostrar separado na lista de membros" />
            <Toggle checked={roleEdit.mentionable} onChange={(mentionable) => setRoleEdit({ ...roleEdit, mentionable })} label="Qualquer pessoa pode mencionar" />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="dark" onClick={() => setRoleEdit(null)}>
                Cancelar
              </Button>
              <Button
                loading={busy === 'createRole' || busy === 'editRole'}
                disabled={!roleEdit.name.trim()}
                onClick={async () => {
                  const op: ModerationOp = roleEdit.id
                    ? { kind: 'editRole', roleId: roleEdit.id, name: roleEdit.name, color: roleEdit.color, hoist: roleEdit.hoist, mentionable: roleEdit.mentionable }
                    : { kind: 'createRole', name: roleEdit.name, color: roleEdit.color, hoist: roleEdit.hoist, mentionable: roleEdit.mentionable }
                  if (await run(op)) setRoleEdit(null)
                }}
              >
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) void run(confirm.op)
        }}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmLabel={confirm?.label}
        danger={confirm?.danger}
      />
    </div>
  )
}
