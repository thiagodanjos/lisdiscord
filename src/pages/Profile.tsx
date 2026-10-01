import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CircleUser, MousePointerClick, Palette, Radio, Save, Settings2, Target, Trophy } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { Badge, Button, Card, PageHeader, Toggle } from '../components/ui'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import { EmbedPreview } from '../components/EmbedPreview'
import { EmojiTextInput } from '../components/EmojiTextInput'
import { DiscordButtonPreview } from '../components/DiscordButtonEditor'
import { CustomButtonEditor, CustomLinkButtonEditor } from '../components/CustomButtonEditor'
import { defaultProfileSettings, fill, formatProfileGoals, formatRankingLines, progressBar } from '../../shared/movFeatures'
import {
  PROFILE_GOAL_PLACEHOLDERS,
  PROFILE_PLACEHOLDERS,
  PROFILE_RANKING_PLACEHOLDERS,
  RANKING_LINE_PLACEHOLDERS,
  type BotEmoji,
  type EmbedDraft,
  type GuildSummary,
  type ProfileSettings,
  type RemoteBotConfig,
} from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

// Dados de exemplo para a pré-visualização.
const SAMPLE = {
  points: 45,
  totalSeconds: 12 * 3600 + 30 * 60,
  roles: [
    { id: 'r1', name: 'Mov Call' },
    { id: 'r2', name: 'Supervisor' },
  ],
}
const SAMPLE_GOALS = [
  { roleId: 'r1', roleName: 'Mov Call', pointsGoal: 40, hoursGoal: 10 },
  { roleId: 'r2', roleName: 'Supervisor', pointsGoal: 80, hoursGoal: 25 },
]
const SAMPLE_RANKING = [
  { userId: '1', tag: 'ana.dev', points: 80, totalSeconds: 30 * 3600 },
  { userId: '2', tag: 'membro', points: 45, totalSeconds: 12.5 * 3600 },
  { userId: '3', tag: 'ricardo_c', points: 30, totalSeconds: 8 * 3600 },
]

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

function SectionTitle({ icon: Icon, title, subtitle, action }: { icon: typeof Trophy; title: string; subtitle: string; action?: React.ReactNode }) {
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

export default function Profile() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [settings, setSettings] = useState<ProfileSettings>(defaultProfileSettings())
  const [draft, setDraft] = useState<ProfileSettings>(defaultProfileSettings())
  const [cardTemplate, setCardTemplate] = useState<EmbedDraft | null>(null)
  const [rankingTemplate, setRankingTemplate] = useState<EmbedDraft | null>(null)
  const [editing, setEditing] = useState<'profileCard' | 'profileRanking' | null>(null)
  const [inCall, setInCall] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
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

  function loadTemplates() {
    if (!guildId) return
    const get = isRemote ? bridge.getRemoteEmbedTemplate : bridge.getEmbedTemplate
    get(guildId, 'profileCard').then((r) => setCardTemplate(r.draft)).catch(() => setCardTemplate(null))
    get(guildId, 'profileRanking').then((r) => setRankingTemplate(r.draft)).catch(() => setRankingTemplate(null))
  }

  useEffect(() => {
    if (!guildId) return
    setError('')
    const get = isRemote ? bridge.getRemoteProfileSettings : bridge.getProfileSettings
    get(guildId)
      .then((s) => {
        setSettings(s)
        setDraft(s)
      })
      .catch((err) => setError(cleanIpcError(err)))
    loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const set = <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const goals = useMemo(() => formatProfileGoals(draft, SAMPLE, SAMPLE_GOALS, 'preview'), [draft])
  const cardValues = useMemo(
    () => ({
      membro: '@membro',
      nome: 'membro',
      avatar: '',
      id: '123456789012345678',
      pontos: String(SAMPLE.points),
      horas: '12h 30m',
      posicao: '2',
      totalMembros: '58',
      pontosSemana: '15',
      horasSemana: '4h 10m',
      metas: goals.text,
      metasCumpridas: String(goals.met),
      metasTotal: String(goals.total),
      emCall: inCall ? fill(draft.inCallText, { canal: '#Mov Call 1', duracao: '42m', estadoCall: '🟢 a contar' }) : draft.notInCallText,
      entrou: 'há 3 meses',
      cargoMaisAlto: '@Supervisor',
      servidor: guildName,
    }),
    [goals, draft, inCall, guildName],
  )
  const rankingValues = useMemo(
    () => ({ lista: formatRankingLines(draft.rankingLineFormat, SAMPLE_RANKING, 'preview'), posicao: '2', total: '58', servidor: guildName }),
    [draft.rankingLineFormat, guildName],
  )

  async function save() {
    setSaving(true)
    setError('')
    try {
      const fn = isRemote ? bridge.setRemoteProfileSettings : bridge.setProfileSettings
      const saved = await fn(guildId, draft)
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
        title="/perfil"
        subtitle="O cartão de cada membro: pontos, horas, posição no ranking, a semana, metas com barras de progresso e se está em call"
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {/* ---- Cartão ---- */}
          <Card className="flex flex-col gap-4">
            <SectionTitle
              icon={CircleUser}
              title="Cartão do perfil"
              subtitle="Título, texto, cor hex, miniatura, campos e rodapé — com {barra} para divisórias."
              action={
                <Button variant="dark" onClick={() => setEditing('profileCard')} disabled={!guildId}>
                  <Palette size={14} /> Personalizar embed
                </Button>
              }
            />
            <Tokens tokens={PROFILE_PLACEHOLDERS} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>{'{emCall}'} quando está em call</Label>
                <div className="mt-1.5">
                  <EmojiTextInput value={draft.inCallText} onChange={(v) => set('inCallText', v)} emojis={emojis} maxLength={500} />
                </div>
                <p className="mt-1 text-[11px] text-faint">{'{canal}'} · {'{duracao}'} · {'{estadoCall}'}</p>
              </div>
              <div>
                <Label>{'{emCall}'} quando não está</Label>
                <div className="mt-1.5">
                  <EmojiTextInput value={draft.notInCallText} onChange={(v) => set('notInCallText', v)} emojis={emojis} maxLength={500} placeholder="(vazio = não mostra nada)" />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <Toggle checked={draft.ephemeral} onChange={(v) => set('ephemeral', v)} label="Só quem usa o /perfil vê a resposta" />
              <Toggle checked={draft.allowOthers} onChange={(v) => set('allowOthers', v)} label="Deixar ver o perfil de outras pessoas (a gestão pode sempre)" />
            </div>
          </Card>

          {/* ---- Metas ---- */}
          <Card className="flex flex-col gap-4">
            <SectionTitle icon={Target} title="Metas e barras de progresso" subtitle="O que aparece em {metas} — uma linha por cada cargo do membro com meta (página Metas)." />
            <div>
              <Label>Linha de cada meta</Label>
              <textarea value={draft.goalLineFormat} onChange={(e) => set('goalLineFormat', e.target.value)} rows={3} maxLength={500} className={`mt-1.5 font-mono ${inputClass}`} />
              <Tokens tokens={PROFILE_GOAL_PLACEHOLDERS} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>{'{estado}'} cumprida</Label>
                <div className="mt-1.5">
                  <EmojiTextInput value={draft.goalMet} onChange={(v) => set('goalMet', v)} emojis={emojis} maxLength={100} />
                </div>
              </div>
              <div>
                <Label>{'{estado}'} por cumprir</Label>
                <div className="mt-1.5">
                  <EmojiTextInput value={draft.goalNotMet} onChange={(v) => set('goalNotMet', v)} emojis={emojis} maxLength={100} />
                </div>
              </div>
              <div>
                <Label>Sem metas</Label>
                <div className="mt-1.5">
                  <EmojiTextInput value={draft.goalsEmpty} onChange={(v) => set('goalsEmpty', v)} emojis={emojis} maxLength={500} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_6rem]">
              <div>
                <Label>Barra cheia</Label>
                <div className="mt-1.5">
                  <EmojiTextInput value={draft.barFilled} onChange={(v) => set('barFilled', v)} emojis={emojis} maxLength={100} />
                </div>
              </div>
              <div>
                <Label>Barra vazia</Label>
                <div className="mt-1.5">
                  <EmojiTextInput value={draft.barEmpty} onChange={(v) => set('barEmpty', v)} emojis={emojis} maxLength={100} />
                </div>
              </div>
              <div>
                <Label>Tamanho</Label>
                <input type="number" min={3} max={20} value={draft.barLength} onChange={(e) => set('barLength', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-black/30 px-3 py-2 text-sm">
              <span className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">70% → </span>
              {progressBar(draft, 0.7)}
            </div>
          </Card>

          {/* ---- Ranking ---- */}
          <Card className="flex flex-col gap-4">
            <SectionTitle
              icon={Trophy}
              title="Botão Ranking"
              subtitle="O que aparece (só para quem clicou) ao carregar em Ranking — no /perfil e no relatório semanal."
              action={
                <Button variant="dark" onClick={() => setEditing('profileRanking')} disabled={!guildId}>
                  <Palette size={14} /> Personalizar embed
                </Button>
              }
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem]">
              <div>
                <Label>Linha de cada membro</Label>
                <input value={draft.rankingLineFormat} onChange={(e) => set('rankingLineFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
                <Tokens tokens={RANKING_LINE_PLACEHOLDERS} />
              </div>
              <div>
                <Label>Quantos</Label>
                <input type="number" min={3} max={50} value={draft.rankingSize} onChange={(e) => set('rankingSize', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
              </div>
            </div>
          </Card>
        </div>

        {/* ---- Pré-visualização ---- */}
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 xl:sticky xl:top-20">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Pré-visualização (dados de exemplo)</p>
              <Toggle checked={inCall} onChange={setInCall} label="Em call" />
            </div>
            {cardTemplate ? <EmbedPreview draft={applyDraft(cardTemplate, cardValues)} botName="LisDiscord" /> : <p className="text-xs text-faint">A carregar…</p>}
            <div className="flex flex-wrap gap-2 px-1">
              {draft.refreshButton.show && <DiscordButtonPreview label={draft.refreshButton.label || 'Atualizar'} emoji={draft.refreshButton.emoji} style={draft.refreshButton.style} emojis={emojis} />}
              {draft.rankingButton.show && <DiscordButtonPreview label={draft.rankingButton.label || 'Ranking'} emoji={draft.rankingButton.emoji} style={draft.rankingButton.style} emojis={emojis} />}
              {draft.linkButton.show && <DiscordButtonPreview label={`${draft.linkButton.label || 'Link'} ↗`} emoji={draft.linkButton.emoji} style="secondary" emojis={emojis} />}
            </div>
            <p className="text-[11px] text-faint">Na Discord fica numa caixa, com os botões lá dentro por baixo de uma linha divisória.</p>
            <div className="mt-2 border-t border-border pt-3">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-faint uppercase">
                <BarChart3 size={12} /> Ao clicar em Ranking
              </p>
              {rankingTemplate && <EmbedPreview draft={applyDraft(rankingTemplate, rankingValues)} botName="LisDiscord" />}
            </div>
          </Card>
        </div>
      </div>

      {/* ---- Botões ---- */}
      <Card className="flex flex-col gap-4">
        <SectionTitle icon={MousePointerClick} title="Botões do perfil" subtitle="Mostrar ou esconder, texto, emoji (normal ou do bot) e cor de cada um." />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CustomButtonEditor title="Atualizar" value={draft.refreshButton} fallback="Atualizar" emojis={emojis} onChange={(v) => set('refreshButton', v)} />
          <CustomButtonEditor title="Ranking" value={draft.rankingButton} fallback="Ranking" emojis={emojis} onChange={(v) => set('rankingButton', v)} />
          <CustomLinkButtonEditor title="Link (ex.: regras)" value={draft.linkButton} fallback="Link" emojis={emojis} onChange={(v) => set('linkButton', v)} />
        </div>
      </Card>

      <Card className="flex items-start gap-3 text-xs text-muted">
        <Settings2 size={16} className="mt-0.5 shrink-0 text-accent" />
        <p>
          <span className="font-semibold text-text">{'{pontosSemana}'} / {'{horasSemana}'}</span> contam desde o último relatório semanal. <span className="font-semibold text-text">{'{emCall}'}</span> usa as horas automáticas (se estiverem ligadas).{' '}
          <span className="font-semibold text-text">{'{posicao}'}</span> é a posição no ranking de pontos (desempate por horas).
        </p>
      </Card>

      {editing && (
        <TemplateEditorModal
          open
          onClose={() => {
            setEditing(null)
            loadTemplates()
          }}
          kind={editing}
          guildId={guildId}
          isRemote={isRemote}
          title={editing === 'profileCard' ? 'Personalizar o cartão do /perfil' : 'Personalizar a resposta do botão Ranking'}
          hint={
            editing === 'profileCard'
              ? '{metas} = as linhas das metas (com as barras); {emCall} = se está em call. A miniatura {avatar} é a foto da pessoa.'
              : '{lista} = os primeiros do ranking (linha configurável na página); {posicao} = a posição de quem clicou.'
          }
          tokens={editing === 'profileCard' ? PROFILE_PLACEHOLDERS : PROFILE_RANKING_PLACEHOLDERS}
          previewPlaceholders={editing === 'profileCard' ? cardValues : rankingValues}
        />
      )}
    </div>
  )
}
