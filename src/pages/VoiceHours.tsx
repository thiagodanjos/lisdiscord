import { useEffect, useMemo, useState } from 'react'
import { Ban, CheckCircle2, Headphones, History, Mic, Palette, Radio, Save, ScrollText, Search, ShieldCheck, SlidersHorizontal, Square, UserX, X } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { formatRelativeDate } from '../lib/format'
import { Badge, Button, Card, EmptyState, PageHeader, Toggle } from '../components/ui'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import { EmojiTextInput } from '../components/EmojiTextInput'
import { VOICE_REASON_LABEL, defaultVoiceHoursSettings } from '../../shared/movFeatures'
import { formatDuration } from '../../shared/leaderboardFormat'
import {
  VOICE_LOG_PLACEHOLDERS,
  type BotEmoji,
  type ChannelPickerEntry,
  type GuildSummary,
  type MemberSearchResult,
  type RemoteBotConfig,
  type RolePickerEntry,
  type VoiceHoursAction,
  type VoiceHoursSettings,
  type VoiceHoursState,
} from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const POLL_MS = 15_000
const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{children}</label>
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-faint">{children}</p>
}

function SectionTitle({ icon: Icon, title, subtitle, action }: { icon: typeof Mic; title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon size={17} />
        </div>
        <div>
          <h3 className="text-sm font-black tracking-wide uppercase">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  )
}

function NumberField({ label, value, min, max, step = 1, onChange, hint }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
      {hint && <Hint>{hint}</Hint>}
    </div>
  )
}

function Chips<T extends { id: string; name: string }>({
  items,
  selected,
  onChange,
  prefix,
  color,
}: {
  items: T[]
  selected: string[]
  onChange: (ids: string[]) => void
  prefix: (item: T) => string
  color?: (item: T) => string | undefined
}) {
  if (items.length === 0) return <p className="mt-1.5 text-xs text-faint">Nada para mostrar.</p>
  return (
    <div className="mt-1.5 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-black/20 p-2">
      {items.map((it) => {
        const on = selected.includes(it.id)
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(on ? selected.filter((id) => id !== it.id) : [...selected, it.id])}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              on ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:border-accent/60 hover:text-text'
            }`}
          >
            {color?.(it) && <span className="h-2 w-2 rounded-full" style={{ background: color(it) }} />}
            {prefix(it)}
            {it.name}
            {on && <span>✓</span>}
          </button>
        )
      })}
    </div>
  )
}

export default function VoiceHours() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [roles, setRoles] = useState<RolePickerEntry[]>([])
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [state, setState] = useState<VoiceHoursState | null>(null)
  const [settings, setSettings] = useState<VoiceHoursSettings>(defaultVoiceHoursSettings())
  const [draft, setDraft] = useState<VoiceHoursSettings>(defaultVoiceHoursSettings())
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [error, setError] = useState('')
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [editingLog, setEditingLog] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<MemberSearchResult[]>([])
  const [ignoredNames, setIgnoredNames] = useState<Record<string, string>>({})

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
    const listEmojis = isRemote ? bridge.listRemoteEmojis : bridge.listEmojis
    listEmojis().then(setEmojis).catch(() => setEmojis([]))
  }, [isRemote])

  function refreshLive(resetDraft = false) {
    if (!guildId) return
    const get = isRemote ? bridge.getRemoteVoiceHours : bridge.getVoiceHours
    get(guildId)
      .then((s) => {
        setState(s)
        setSettings(s.settings)
        if (resetDraft) setDraft(s.settings)
      })
      .catch((err) => setError(cleanIpcError(err)))
  }

  useEffect(() => {
    if (!guildId) return
    setError('')
    const listChannels = isRemote ? bridge.listRemoteChannels : bridge.listChannels
    const listRoles = isRemote ? bridge.listRemoteRoles : bridge.listRoles
    listChannels(guildId)
      .then((c) => setChannels(c.filter((ch) => ch.kind === 'text' || ch.kind === 'announcement')))
      .catch(() => setChannels([]))
    listRoles(guildId).then(setRoles).catch(() => setRoles([]))
    refreshLive(true)
    const id = setInterval(() => refreshLive(false), POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  useEffect(() => {
    const q = search.trim()
    if (!guildId || q.length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      const find = isRemote ? bridge.searchRemoteMembers : bridge.searchMembers
      find(guildId, q)
        .then((r) => setResults(r.filter((m) => !m.isBot)))
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [search, guildId, isRemote])

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const set = <K extends keyof VoiceHoursSettings>(key: K, value: VoiceHoursSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))

  async function save() {
    setSaving(true)
    setError('')
    try {
      const fn = isRemote ? bridge.setRemoteVoiceHoursSettings : bridge.setVoiceHoursSettings
      const s = await fn(guildId, draft)
      setState(s)
      setSettings(s.settings)
      setDraft(s.settings)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setSaving(false)
    }
  }

  async function act(action: VoiceHoursAction) {
    setActionBusy(action.userId + action.kind)
    setError('')
    try {
      const fn = isRemote ? bridge.remoteVoiceHoursAction : bridge.voiceHoursAction
      setState(await fn(guildId, action))
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setActionBusy(null)
    }
  }

  const live = state?.live ?? []
  const counting = live.filter((e) => e.reason === 'counting').length
  const voiceItems = useMemo(() => state?.voiceChannels ?? [], [state])
  const creditedToday = (state?.recent ?? []).filter((s) => s.credited && new Date(s.endedAt).toDateString() === new Date().toDateString())

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Horas automáticas"
        subtitle="O bot conta sozinho o tempo de cada membro em call e soma às horas de Mov Call — com regras anti-fraude escolhidas por ti"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isRemote && (
              <Badge tone="cyan">
                <Radio size={11} /> A usar o bot remoto
              </Badge>
            )}
            <Button onClick={save} loading={saving} disabled={!guildId || !dirty}>
              <Save size={14} />
              {savedOk ? 'Guardado ✓' : 'Guardar'}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label>Servidor</Label>
          <select value={guildId} onChange={(e) => setGuildId(e.target.value)} className={`mt-1.5 block w-72 ${inputClass}`}>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        {dirty && <span className="pb-2 text-xs text-warning">Alterações por guardar</span>}
        {error && <span className="pb-2 text-xs text-danger">❌ {error}</span>}
      </div>

      {/* ---- Ligar ---- */}
      <Card className={`flex flex-wrap items-center justify-between gap-4 ${draft.enabled ? 'border-success/40' : ''}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${draft.enabled ? 'bg-success/15 text-success' : 'bg-white/5 text-faint'}`}>
            <Mic size={20} />
          </div>
          <div>
            <p className="text-sm font-black tracking-wide uppercase">{draft.enabled ? 'Contagem ligada' : 'Contagem desligada'}</p>
            <p className="text-xs text-muted">
              {settings.enabled ? `${counting} a contar agora · ${live.length} em call · ${creditedToday.length} sessões creditadas hoje` : 'Liga para o bot começar a contar o tempo em call.'}
            </p>
          </div>
        </div>
        <Toggle checked={draft.enabled} onChange={(v) => set('enabled', v)} label={draft.enabled ? 'Ligado' : 'Desligado'} />
      </Card>

      {/* ---- Ao vivo ---- */}
      <Card className="flex flex-col gap-4">
        <SectionTitle
          icon={Headphones}
          title={`Em call agora (${live.length})`}
          subtitle="Atualiza sozinho a cada 15 s. As horas são creditadas quando a pessoa sai da call."
          action={
            <Button variant="dark" onClick={() => refreshLive(false)}>
              Atualizar
            </Button>
          }
        />
        {!state?.connected && <p className="text-xs text-warning">⚠️ O bot não está ligado — não dá para ver as calls agora.</p>}
        {live.length === 0 ? (
          <EmptyState title="Ninguém em call" description={settings.enabled ? 'Quando alguém entrar numa call, aparece aqui.' : 'A contagem está desligada.'} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-black/30 text-[10px] tracking-[0.12em] text-faint uppercase">
                <tr>
                  <th className="px-3 py-2">Membro</th>
                  <th className="px-3 py-2">Canal</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Sessão</th>
                  <th className="w-44 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {live.map((e) => (
                  <tr key={e.userId} className="border-t border-border/60">
                    <td className="px-3 py-2 font-semibold text-text">{e.tag}</td>
                    <td className="px-3 py-2 text-muted">🔊 {e.channelName}</td>
                    <td className="px-3 py-2">
                      <Badge tone={e.reason === 'counting' ? 'success' : 'default'}>{e.reason === 'counting' ? '🟢 ' : '⏸️ '}{VOICE_REASON_LABEL[e.reason]}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-muted">{e.sessionSeconds > 0 || e.startedAt ? formatDuration(e.sessionSeconds) : '—'}</td>
                    <td className="px-3 py-2">
                      {e.startedAt && (
                        <div className="flex justify-end gap-1.5">
                          <Button variant="dark" onClick={() => void act({ kind: 'end', userId: e.userId })} loading={actionBusy === e.userId + 'end'}>
                            <Square size={12} /> Creditar
                          </Button>
                          <button
                            type="button"
                            title="Descartar esta sessão (não conta)"
                            onClick={() => void act({ kind: 'discard', userId: e.userId })}
                            className="rounded-lg border border-border p-2 text-muted hover:text-danger"
                          >
                            <Ban size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ---- Onde conta ---- */}
        <Card className="flex flex-col gap-4">
          <SectionTitle icon={SlidersHorizontal} title="Onde e quem conta" subtitle="Canais de voz (ou categorias inteiras) e cargos." />
          <div>
            <Label>Canais</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'Todas as calls'],
                  ['only', 'Só as escolhidas'],
                  ['except', 'Todas menos as escolhidas'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('channelMode', v)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${draft.channelMode === v ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:text-text'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {draft.channelMode !== 'all' && (
              <Chips items={voiceItems} selected={draft.channelIds} onChange={(ids) => set('channelIds', ids)} prefix={(c) => (c.kind === 'category' ? '📁 ' : '🔊 ')} />
            )}
            <Hint>Escolher uma categoria vale para todas as calls dentro dela.</Hint>
          </div>
          <div>
            <Label>Só conta quem tem um destes cargos</Label>
            <Chips items={roles} selected={draft.roleIds} onChange={(ids) => set('roleIds', ids)} prefix={() => '@'} color={(r) => (r.color === '#000000' ? '#99aab5' : r.color)} />
            <Hint>{draft.roleIds.length === 0 ? 'Nenhum escolhido → conta toda a gente.' : `${draft.roleIds.length} cargo(s).`}</Hint>
          </div>
          <div>
            <Label>Membros ignorados (nunca contam)</Label>
            <div className="relative mt-1.5">
              <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar membro…" className={`pl-8 ${inputClass}`} />
              {results.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-raised shadow-xl">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        if (!draft.ignoredUserIds.includes(r.id)) set('ignoredUserIds', [...draft.ignoredUserIds, r.id])
                        setIgnoredNames((n) => ({ ...n, [r.id]: r.tag }))
                        setSearch('')
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-accent-soft"
                    >
                      <span className="text-text">{r.tag}</span>
                      <span className="text-faint">{r.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {draft.ignoredUserIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {draft.ignoredUserIds.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                    <UserX size={11} /> {ignoredNames[id] ?? live.find((e) => e.userId === id)?.tag ?? id}
                    <button type="button" onClick={() => set('ignoredUserIds', draft.ignoredUserIds.filter((x) => x !== id))} className="hover:text-danger">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ---- Anti-fraude ---- */}
        <Card className="flex flex-col gap-4">
          <SectionTitle icon={ShieldCheck} title="Anti-fraude" subtitle="Quando o tempo NÃO conta (a sessão fica em pausa)." />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberField label="Mínimo de pessoas na call" value={draft.minMembers} min={1} max={25} onChange={(v) => set('minMembers', v)} hint="2 = quem está sozinho não conta. Bots não contam." />
            <NumberField
              label="Sessão mínima (minutos)"
              value={draft.minSessionMinutes}
              min={0}
              max={240}
              onChange={(v) => set('minSessionMinutes', v)}
              hint="Sessões mais curtas são descartadas."
            />
            <NumberField
              label="Limite por dia (horas)"
              value={draft.dailyCapHours}
              min={0}
              max={24}
              step={0.5}
              onChange={(v) => set('dailyCapHours', v)}
              hint="0 = sem limite. Evita alguém ficar 24h na call."
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <Toggle checked={draft.ignoreSelfDeafened} onChange={(v) => set('ignoreSelfDeafened', v)} label="Não contar quem está ensurdecido (headphones desligados)" />
            <Toggle checked={draft.ignoreSelfMuted} onChange={(v) => set('ignoreSelfMuted', v)} label="Não contar quem está mutado (microfone desligado)" />
            <Toggle checked={draft.ignoreServerMuted} onChange={(v) => set('ignoreServerMuted', v)} label="Não contar quem foi mutado pela staff" />
            <Toggle checked={draft.ignoreAfkChannel} onChange={(v) => set('ignoreAfkChannel', v)} label="Não contar o canal AFK do servidor" />
          </div>
          <Hint>Uma pausa de mais de 15 minutos fecha a sessão (e credita o que já tinha contado).</Hint>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ---- Log ---- */}
        <Card className="flex flex-col gap-4">
          <SectionTitle
            icon={ScrollText}
            title="Canal de log das sessões"
            subtitle="Opcional: uma mensagem por cada sessão creditada (as horas também vão para o Log de horas e o canal de log de horas)."
          />
          <div className="flex flex-wrap items-end gap-2">
            <select value={draft.logChannelId ?? ''} onChange={(e) => set('logChannelId', e.target.value || null)} className={`max-w-xs flex-1 ${inputClass}`}>
              <option value="">Sem canal</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
            <Button variant="dark" onClick={() => setEditingLog(true)} disabled={!guildId}>
              <Palette size={14} /> Personalizar embed
            </Button>
          </div>
          <div className="max-w-[14rem]">
            <NumberField label="Só sessões com pelo menos (min)" value={draft.logMinMinutes} min={0} max={600} onChange={(v) => set('logMinMinutes', v)} />
          </div>
        </Card>

        {/* ---- Textos ---- */}
        <Card className="flex flex-col gap-4">
          <SectionTitle icon={CheckCircle2} title="Textos do estado" subtitle="Usados no {estadoCall} do /perfil." />
          <div>
            <Label>A contar</Label>
            <div className="mt-1.5">
              <EmojiTextInput value={draft.statusCounting} onChange={(v) => set('statusCounting', v)} emojis={emojis} maxLength={100} />
            </div>
          </div>
          <div>
            <Label>Em pausa</Label>
            <div className="mt-1.5">
              <EmojiTextInput value={draft.statusPaused} onChange={(v) => set('statusPaused', v)} emojis={emojis} maxLength={100} />
            </div>
          </div>
        </Card>
      </div>

      {/* ---- Histórico ---- */}
      <Card className="flex flex-col gap-4">
        <SectionTitle icon={History} title="Últimas sessões" subtitle="Creditadas e descartadas, com o motivo." />
        {(state?.recent ?? []).length === 0 ? (
          <EmptyState title="Ainda sem sessões" description="Aparecem aqui quando alguém sai de uma call." />
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#0d1117] text-[10px] tracking-[0.12em] text-faint uppercase">
                <tr>
                  <th className="px-3 py-2">Membro</th>
                  <th className="px-3 py-2">Canal</th>
                  <th className="px-3 py-2">Duração</th>
                  <th className="px-3 py-2">Quando</th>
                  <th className="px-3 py-2">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {(state?.recent ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-border/60">
                    <td className="px-3 py-2 text-text">{s.tag}</td>
                    <td className="px-3 py-2 text-muted">🔊 {s.channelName}</td>
                    <td className="px-3 py-2 font-mono text-muted">{formatDuration(s.seconds)}</td>
                    <td className="px-3 py-2 text-faint">{formatRelativeDate(s.endedAt)}</td>
                    <td className="px-3 py-2">
                      {s.credited ? <Badge tone="success">✅ Creditada</Badge> : <Badge tone="default">✖️ Descartada</Badge>}
                      {s.note && <span className="ml-2 text-[11px] text-faint">{s.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editingLog && (
        <TemplateEditorModal
          open
          onClose={() => setEditingLog(false)}
          kind="voiceSessionLog"
          guildId={guildId}
          isRemote={isRemote}
          title="Personalizar log das sessões em call"
          hint="Enviado no canal de log quando uma sessão é creditada. Sai em formato caixa."
          tokens={VOICE_LOG_PLACEHOLDERS}
          previewPlaceholders={{ membro: '@ana.dev', nome: 'Ana', avatar: '', canal: '#Mov Call 1', duracao: '2h 1m', total: '14h 30m', inicio: '20:03', fim: '22:04', servidor: guildName }}
        />
      )}
    </div>
  )
}
