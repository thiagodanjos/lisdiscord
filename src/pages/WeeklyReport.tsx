import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Eye, ListChecks, MousePointerClick, Palette, Radio, RotateCcw, Save, Send, Users } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { Badge, Button, Card, ConfirmDialog, PageHeader, Toggle } from '../components/ui'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import { EmbedPreview } from '../components/EmbedPreview'
import { EmojiTextInput } from '../components/EmojiTextInput'
import { DiscordButtonPreview } from '../components/DiscordButtonEditor'
import { CustomButtonEditor, CustomLinkButtonEditor } from '../components/CustomButtonEditor'
import { REPORT_TIMEZONES, WEEKDAYS, defaultWeeklyReportSettings, fill } from '../../shared/movFeatures'
import {
  WEEKLY_LINE_PLACEHOLDERS,
  WEEKLY_REPORT_PLACEHOLDERS,
  type BotEmoji,
  type ChannelPickerEntry,
  type EmbedDraft,
  type GuildSummary,
  type RemoteBotConfig,
  type RolePickerEntry,
  type WeeklyReportAction,
  type WeeklyReportSettings,
  type WeeklyReportState,
} from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

const SAMPLE_PREVIEW: Record<string, string> = {
  periodo: '24/09 – 01/10',
  inicio: '24/09 20:00',
  fim: '01/10 20:00',
  topPontos: '**1.** @ana.dev — 45 pontos\n**2.** @ricardo_c — 30 pontos',
  topHoras: '**1.** @ana.dev — 12h 30m\n**2.** @ricardo_c — 8h 5m',
  inativos: '@joao99\n@trouble_maker',
  totalInativos: '2',
  prontos: '@ana.dev → @Supervisor',
  totalProntos: '1',
  pontosSemana: '75',
  horasSemana: '20h 35m',
  membrosAtivos: '2',
  sessoesCall: '14',
  verificados: '4',
  cancelados: '1',
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{children}</label>
}

function Tokens({ tokens }: { tokens: readonly string[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tokens.map((t) => (
        <code key={t} className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-accent">
          {t}
        </code>
      ))}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, subtitle, action }: { icon: typeof Send; title: string; subtitle: string; action?: React.ReactNode }) {
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

function applyDraft(template: EmbedDraft, values: Record<string, string>): EmbedDraft {
  const sub = (t: string | undefined) => fill(t ?? '', values)
  return {
    ...template,
    title: sub(template.title),
    description: sub(template.description),
    footer: sub(template.footer),
    authorName: sub(template.authorName),
    fields: template.fields.map((f) => ({ ...f, name: sub(f.name), value: sub(f.value) })),
  }
}

export default function WeeklyReport() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [roles, setRoles] = useState<RolePickerEntry[]>([])
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [state, setState] = useState<WeeklyReportState | null>(null)
  const [settings, setSettings] = useState<WeeklyReportSettings>(defaultWeeklyReportSettings())
  const [draft, setDraft] = useState<WeeklyReportSettings>(defaultWeeklyReportSettings())
  const [template, setTemplate] = useState<EmbedDraft | null>(null)
  const [preview, setPreview] = useState<Record<string, string> | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [busy, setBusy] = useState<WeeklyReportAction['kind'] | null>(null)
  const [confirm, setConfirm] = useState<'send' | 'resetPeriod' | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

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

  function loadTemplate() {
    if (!guildId) return
    const get = isRemote ? bridge.getRemoteEmbedTemplate : bridge.getEmbedTemplate
    get(guildId, 'weeklyReport')
      .then((r) => setTemplate(r.draft))
      .catch(() => setTemplate(null))
  }

  useEffect(() => {
    if (!guildId) return
    setError('')
    setPreview(null)
    const listChannels = isRemote ? bridge.listRemoteChannels : bridge.listChannels
    const listRoles = isRemote ? bridge.listRemoteRoles : bridge.listRoles
    const get = isRemote ? bridge.getRemoteWeeklyReport : bridge.getWeeklyReport
    listChannels(guildId)
      .then((c) => setChannels(c.filter((ch) => ch.kind === 'text' || ch.kind === 'announcement')))
      .catch(() => setChannels([]))
    listRoles(guildId).then(setRoles).catch(() => setRoles([]))
    get(guildId)
      .then((s) => {
        setState(s)
        setSettings(s.settings)
        setDraft(s.settings)
      })
      .catch((err) => setError(cleanIpcError(err)))
    loadTemplate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const set = <K extends keyof WeeklyReportSettings>(key: K, value: WeeklyReportSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const values = useMemo(() => ({ ...SAMPLE_PREVIEW, ...preview, servidor: guildName }), [preview, guildName])

  async function save() {
    setSaving(true)
    setError('')
    try {
      const fn = isRemote ? bridge.setRemoteWeeklyReportSettings : bridge.setWeeklyReportSettings
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

  async function act(kind: WeeklyReportAction['kind']) {
    setBusy(kind)
    setError('')
    setNote('')
    try {
      const fn = isRemote ? bridge.remoteWeeklyReportAction : bridge.weeklyReportAction
      const s = await fn(guildId, { kind })
      setState(s)
      if (s.preview) setPreview(s.preview)
      if (s.message) setNote(s.message)
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setBusy(null)
    }
  }

  const hh = String(draft.hour).padStart(2, '0')
  const mm = String(draft.minute).padStart(2, '0')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Relatório semanal"
        subtitle="Todas as semanas, no dia e hora que escolheres, o bot publica o resumo da Mov Call: tops, inativos, quem pode upar e verificações"
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
        {note && <span className="pb-2 text-xs text-success">✅ {note}</span>}
      </div>

      {/* ---- Agenda ---- */}
      <Card className={`flex flex-col gap-4 ${draft.enabled ? 'border-success/40' : ''}`}>
        <SectionTitle
          icon={CalendarClock}
          title="Quando e onde"
          subtitle={
            state?.nextAt
              ? `Próximo relatório: ${formatDateTime(state.nextAt)} · período atual desde ${formatDateTime(state.periodStart)}`
              : state
                ? `Período atual desde ${formatDateTime(state.periodStart)}${state.lastSentAt ? ` · último enviado ${formatDateTime(state.lastSentAt)}` : ''}`
                : ''
          }
          action={<Toggle checked={draft.enabled} onChange={(v) => set('enabled', v)} label={draft.enabled ? 'Automático ligado' : 'Automático desligado'} />}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Label>Canal</Label>
            <select value={draft.channelId ?? ''} onChange={(e) => set('channelId', e.target.value || null)} className={`mt-1.5 ${inputClass}`}>
              <option value="">Escolhe o canal…</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Dia</Label>
            <select value={draft.dayOfWeek} onChange={(e) => set('dayOfWeek', Number(e.target.value))} className={`mt-1.5 ${inputClass}`}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Hora</Label>
            <input
              type="time"
              value={`${hh}:${mm}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number)
                setDraft((d) => ({ ...d, hour: h || 0, minute: m || 0 }))
              }}
              className={`mt-1.5 ${inputClass}`}
            />
          </div>
          <div>
            <Label>Fuso horário</Label>
            <select value={draft.timezone} onChange={(e) => set('timezone', e.target.value)} className={`mt-1.5 ${inputClass}`}>
              {REPORT_TIMEZONES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Marcar cargo (opcional)</Label>
            <select value={draft.mentionRoleId ?? ''} onChange={(e) => set('mentionRoleId', e.target.value || null)} className={`mt-1.5 ${inputClass}`}>
              <option value="">Ninguém</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  @{r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button variant="dark" onClick={() => void act('preview')} loading={busy === 'preview'} disabled={!guildId}>
            <Eye size={14} /> Pré-visualizar com dados reais
          </Button>
          <Button onClick={() => setConfirm('send')} loading={busy === 'send'} disabled={!guildId || !settings.channelId}>
            <Send size={14} /> Enviar agora
          </Button>
          <Button variant="dark" onClick={() => setConfirm('resetPeriod')} loading={busy === 'resetPeriod'} disabled={!guildId}>
            <RotateCcw size={14} /> Recomeçar período
          </Button>
          {!settings.channelId && <span className="self-center text-[11px] text-faint">Guarda um canal para poder enviar.</span>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {/* ---- Conteúdo ---- */}
          <Card className="flex flex-col gap-4">
            <SectionTitle
              icon={ListChecks}
              title="Listas do relatório"
              subtitle="Como cada lista é montada."
              action={
                <Button variant="dark" onClick={() => setEditing(true)} disabled={!guildId}>
                  <Palette size={14} /> Personalizar embed
                </Button>
              }
            />
            <Tokens tokens={WEEKLY_REPORT_PLACEHOLDERS} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_6rem]">
              <div>
                <Label>Linha do top pontos / top horas</Label>
                <input value={draft.topLineFormat} onChange={(e) => set('topLineFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
              </div>
              <div>
                <Label>Top</Label>
                <input type="number" min={1} max={25} value={draft.topCount} onChange={(e) => set('topCount', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
              </div>
            </div>
            <Tokens tokens={WEEKLY_LINE_PLACEHOLDERS} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Inativo: menos de (horas)</Label>
                <input type="number" min={0} max={168} step={0.5} value={draft.inactiveMaxHours} onChange={(e) => set('inactiveMaxHours', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
              </div>
              <div>
                <Label>e no máximo (pontos)</Label>
                <input type="number" min={0} value={draft.inactiveMaxPoints} onChange={(e) => set('inactiveMaxPoints', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
              </div>
              <div>
                <Label>Mostrar até</Label>
                <input type="number" min={1} max={100} value={draft.inactiveLimit} onChange={(e) => set('inactiveLimit', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Linha de cada inativo</Label>
                <input value={draft.inactiveLineFormat} onChange={(e) => set('inactiveLineFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
              </div>
              <div>
                <Label>Linha dos prontos para upar</Label>
                <input value={draft.readyLineFormat} onChange={(e) => set('readyLineFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
                <p className="mt-1 text-[11px] text-faint">{'{membro}'} · {'{nome}'} · {'{cargo}'}</p>
              </div>
            </div>
            <div>
              <Label>Texto de lista vazia</Label>
              <div className="mt-1.5">
                <EmojiTextInput value={draft.emptyText} onChange={(v) => set('emptyText', v)} emojis={emojis} maxLength={300} />
              </div>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <SectionTitle icon={Users} title="Quem entra nos inativos e prontos" subtitle="Só membros com um destes cargos (vazio = toda a gente). Bots e escondidos do ranking nunca entram." />
            <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-black/20 p-2">
              {roles.map((r) => {
                const on = draft.roleIds.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => set('roleIds', on ? draft.roleIds.filter((id) => id !== r.id) : [...draft.roleIds, r.id])}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      on ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:text-text'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: r.color === '#000000' ? '#99aab5' : r.color }} />
                    {r.name}
                    {on && <span>✓</span>}
                  </button>
                )
              })}
            </div>
          </Card>
        </div>

        {/* ---- Pré-visualização ---- */}
        <Card className="flex flex-col gap-3 self-start xl:sticky xl:top-20">
          <p className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{preview ? 'Pré-visualização com os dados reais de agora' : 'Pré-visualização (dados de exemplo)'}</p>
          {draft.mentionRoleId && <p className="text-sm text-[#c9cdfb]">@{roles.find((r) => r.id === draft.mentionRoleId)?.name}</p>}
          {template ? <EmbedPreview draft={applyDraft(template, values)} botName="LisDiscord" /> : <p className="text-xs text-faint">A carregar…</p>}
          <div className="flex flex-wrap gap-2 px-1">
            {draft.copyButton.show && <DiscordButtonPreview label={draft.copyButton.label || 'Copiar relatório'} emoji={draft.copyButton.emoji} style={draft.copyButton.style} emojis={emojis} />}
            {draft.rankingButton.show && <DiscordButtonPreview label={draft.rankingButton.label || 'Ranking completo'} emoji={draft.rankingButton.emoji} style={draft.rankingButton.style} emojis={emojis} />}
            {draft.linkButton.show && <DiscordButtonPreview label={`${draft.linkButton.label || 'Link'} ↗`} emoji={draft.linkButton.emoji} style="secondary" emojis={emojis} />}
          </div>
        </Card>
      </div>

      {/* ---- Botões ---- */}
      <Card className="flex flex-col gap-4">
        <SectionTitle
          icon={MousePointerClick}
          title="Botões do relatório"
          subtitle="Copiar = o relatório em texto simples (nomes em vez de menções); Ranking = o mesmo do /perfil (personaliza-o na página /perfil)."
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CustomButtonEditor title="Copiar relatório" value={draft.copyButton} fallback="Copiar relatório" emojis={emojis} onChange={(v) => set('copyButton', v)} />
          <CustomButtonEditor title="Ranking completo" value={draft.rankingButton} fallback="Ranking completo" emojis={emojis} onChange={(v) => set('rankingButton', v)} />
          <CustomLinkButtonEditor title="Link" value={draft.linkButton} fallback="Link" emojis={emojis} onChange={(v) => set('linkButton', v)} />
        </div>
      </Card>

      {editing && (
        <TemplateEditorModal
          open
          onClose={() => {
            setEditing(false)
            loadTemplate()
          }}
          kind="weeklyReport"
          guildId={guildId}
          isRemote={isRemote}
          title="Personalizar o relatório semanal"
          hint="Os números são do período desde o último relatório. Usa {barra} para as divisórias; sai em formato caixa com os botões lá dentro."
          tokens={WEEKLY_REPORT_PLACEHOLDERS}
          previewPlaceholders={values}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) void act(confirm)
        }}
        title={confirm === 'send' ? 'Enviar o relatório agora?' : 'Recomeçar o período?'}
        description={
          confirm === 'send'
            ? `Publica o relatório em #${settings.channelName ?? 'canal'} com os números de agora e começa um período novo (o envio automático continua no dia marcado).`
            : 'Os números da semana (tops, {pontosSemana}, {horasSemana}…) voltam a zero a partir de agora. Os pontos e horas totais não mudam.'
        }
        confirmLabel={confirm === 'send' ? 'Enviar' : 'Recomeçar'}
        danger={confirm === 'resetPeriod'}
      />
    </div>
  )
}
