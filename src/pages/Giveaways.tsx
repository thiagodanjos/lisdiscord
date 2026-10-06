import { useEffect, useMemo, useState } from 'react'
import { Gift, MessageSquare, MousePointerClick, Palette, Play, Plus, Repeat, Save, Settings2, Trash2, Users } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { formatRelativeDate } from '../lib/format'
import { inputClass } from '../lib/styles'
import { useGuildContext } from '../lib/useGuildContext'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, PageHeader, Tabs, Toggle } from '../components/ui'
import { GuildSelect, Label, RemoteBadge, RolePills, SectionTitle, Tokens } from '../components/form'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import { EmbedPreview } from '../components/EmbedPreview'
import { EmojiTextInput } from '../components/EmojiTextInput'
import { RichTextField } from '../components/RichTextField'
import { CustomButtonEditor } from '../components/CustomButtonEditor'
import { DiscordButtonPreview } from '../components/DiscordButtonEditor'
import { parseDurationMs } from '../../shared/duration'
import { defaultGiveawaySettings, fillGiveaway } from '../../shared/giveaways'
import { GIVEAWAY_PLACEHOLDERS, type EmbedDraft, type EmbedTemplateKind, type Giveaway, type GiveawayAction, type GiveawayMessage, type GiveawaySettings } from '../../shared/types'

const DURATIONS = ['10m', '30m', '1h', '6h', '12h', '1d', '3d', '7d']

type MessageKey = 'start' | 'ended' | 'winners' | 'reroll' | 'noEntrants' | 'winnerDm'

const MESSAGES: { key: MessageKey; kind: EmbedTemplateKind; title: string; hint: string }[] = [
  { key: 'start', kind: 'giveawayStart', title: 'Mensagem do sorteio', hint: 'A que é publicada com o botão Participar.' },
  { key: 'ended', kind: 'giveawayEnded', title: 'Quando termina', hint: 'A mensagem original passa a mostrar isto.' },
  { key: 'winners', kind: 'giveawayWinners', title: 'Anúncio dos vencedores', hint: 'Resposta no canal, com o botão de reroll.' },
  { key: 'reroll', kind: 'giveawayReroll', title: 'Mensagem do reroll', hint: 'Quando alguém carrega em Rerolar.' },
  { key: 'noEntrants', kind: 'giveawayNoEntrants', title: 'Sem participantes', hint: 'Se ninguém entrou.' },
  { key: 'winnerDm', kind: 'giveawayWinnerDm', title: 'DM ao vencedor', hint: 'Só se "avisar por DM" estiver ligado.' },
]

const REPLIES: { key: keyof GiveawaySettings; label: string }[] = [
  { key: 'replyJoined', label: 'Ao entrar' },
  { key: 'replyLeft', label: 'Ao sair (segundo clique)' },
  { key: 'replyAlready', label: 'Já está a participar (se sair estiver desligado)' },
  { key: 'replyEnded', label: 'Sorteio já terminou' },
  { key: 'replyNoRole', label: 'Sem o cargo exigido — {cargos}' },
  { key: 'replyNoPermission', label: 'Sem permissão para rerolar' },
  { key: 'replyRerollDone', label: 'Reroll feito' },
  { key: 'replyRerollEmpty', label: 'Reroll sem ninguém elegível' },
  { key: 'replyNoParticipants', label: 'Lista de participantes vazia' },
]

const SAMPLE: Record<string, string> = {
  premio: 'Nitro de 1 mês',
  descricao: 'Boa sorte a todos!',
  vencedores: '1',
  ganhadores: '@sofia_gamer',
  participantes: '27',
  termina: 'daqui a 2 horas',
  terminaData: '06/10 22:00',
  criador: '@thiagoanjoss',
  emoji: '🎉',
  link: 'https://discord.com',
  cargos: '@Membro',
}

function sub(draft: EmbedDraft, values: Record<string, string>): EmbedDraft {
  const f = (t: string | undefined) => fillGiveaway(t ?? '', values)
  return { ...draft, title: f(draft.title), description: f(draft.description), footer: f(draft.footer), authorName: f(draft.authorName), fields: draft.fields.map((x) => ({ ...x, name: f(x.name), value: f(x.value) })) }
}

export default function Giveaways() {
  const ctx = useGuildContext({ channels: true, roles: true, emojis: true })
  const { isRemote, guildId, emojis } = ctx
  const [tab, setTab] = useState<'list' | 'custom'>('list')
  const [giveaways, setGiveaways] = useState<Giveaway[]>([])
  const [settings, setSettings] = useState<GiveawaySettings>(defaultGiveawaySettings())
  const [draft, setDraft] = useState<GiveawaySettings>(defaultGiveawaySettings())
  const [templates, setTemplates] = useState<Partial<Record<EmbedTemplateKind, EmbedDraft>>>({})
  const [editing, setEditing] = useState<(typeof MESSAGES)[number] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [toDelete, setToDelete] = useState<Giveaway | null>(null)

  const [creating, setCreating] = useState(false)
  const [channelId, setChannelId] = useState('')
  const [prize, setPrize] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('1h')
  const [winnerCount, setWinnerCount] = useState(1)

  function loadTemplates() {
    if (!guildId) return
    const get = isRemote ? bridge.getRemoteEmbedTemplate : bridge.getEmbedTemplate
    Promise.all(MESSAGES.map((m) => get(guildId, m.kind).then((r) => [m.kind, r.draft] as const)))
      .then((list) => setTemplates(Object.fromEntries(list)))
      .catch(() => setTemplates({}))
  }

  function load() {
    if (!guildId) return
    bridge
      .getGiveawayState(guildId, isRemote)
      .then((s) => {
        setGiveaways(s.giveaways)
        setSettings(s.settings)
        setDraft(s.settings)
      })
      .catch((err) => setError(cleanIpcError(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setError('')
    setNote('')
    load()
    loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  useEffect(() => {
    if (!channelId && ctx.channels[0]) setChannelId(ctx.channels[0].id)
  }, [ctx.channels, channelId])

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const set = <K extends keyof GiveawaySettings>(key: K, value: GiveawaySettings[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setMsg = (key: MessageKey, patch: Partial<GiveawayMessage>) => setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }))
  const durationMs = parseDurationMs(duration)
  const guildName = ctx.guilds.find((g) => g.id === guildId)?.name ?? 'Servidor'
  const values = useMemo<Record<string, string>>(() => ({ ...SAMPLE, servidor: guildName }), [guildName])

  async function save() {
    setSaving(true)
    setError('')
    try {
      const s = await bridge.setGiveawaySettings(guildId, draft, isRemote)
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

  async function act(action: GiveawayAction, key: string) {
    setBusy(key)
    setError('')
    setNote('')
    try {
      const s = await bridge.giveawayAction(guildId, action, isRemote)
      setGiveaways(s.giveaways)
      if (s.message) setNote(s.message)
      return true
    } catch (err) {
      setError(cleanIpcError(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!durationMs) return
    const ok = await act({ kind: 'create', channelId, prize, description, durationMs, winnerCount }, 'create')
    if (ok) {
      setCreating(false)
      setPrize('')
      setDescription('')
    }
  }

  const active = giveaways.filter((g) => !g.ended)
  const ended = giveaways.filter((g) => g.ended)
  const startTemplate = templates.giveawayStart

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sorteios"
        subtitle="Participação por botão ou reação, reroll e todas as mensagens e botões personalizáveis — também com /sorteio no Discord"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RemoteBadge show={isRemote} />
            {tab === 'custom' ? (
              <Button onClick={save} loading={saving} disabled={!guildId || !dirty}>
                <Save size={14} /> {savedOk ? 'Guardado ✓' : 'Guardar'}
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)} disabled={!guildId}>
                <Plus size={14} /> Novo sorteio
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <GuildSelect guilds={ctx.guilds} value={guildId} onChange={ctx.setGuildId} />
        <Tabs
          tabs={[
            { id: 'list', label: 'Sorteios' },
            { id: 'custom', label: 'Personalizar' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {dirty && <span className="pb-2 text-xs text-warning">Alterações por guardar</span>}
      </div>
      {(error || ctx.error) && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">❌ {error || ctx.error}</p>}
      {note && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">✅ {note}</p>}

      {tab === 'list' && (
        <>
          {!loading && giveaways.length === 0 && (
            <EmptyState
              title="Sem sorteios"
              description="Cria um sorteio aqui ou com /sorteio no Discord. Personaliza primeiro as mensagens e os botões no separador Personalizar."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus size={14} /> Novo sorteio
                </Button>
              }
            />
          )}
          {[
            { title: 'A decorrer', list: active },
            { title: 'Terminados', list: ended },
          ].map(
            (group) =>
              group.list.length > 0 && (
                <section key={group.title} className="flex flex-col gap-2">
                  <h3 className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">
                    {group.title} · {group.list.length}
                  </h3>
                  {group.list.map((g) => (
                    <Card key={g.id} className="flex flex-wrap items-center gap-3 p-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                        <Gift size={17} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text">{g.prize}</p>
                        <p className="text-xs text-muted">
                          #{g.channelName} · {g.winnerCount} {g.winnerCount === 1 ? 'vencedor' : 'vencedores'} · {(g.entryMode ?? 'reaction') === 'button' ? 'botão' : 'reação'}
                          {g.entrants ? ` · ${g.entrants.length} participante(s)` : ''}
                          {g.hostTag ? ` · por ${g.hostTag.replace(/<@\d+>/, 'Discord')}` : ''}
                        </p>
                        {g.ended && <p className="mt-0.5 text-xs text-success">{g.winners.length > 0 ? `🏆 ${g.winners.join(', ')}` : 'Sem participantes'}</p>}
                      </div>
                      {g.ended ? <Badge>Terminado {formatRelativeDate(g.endsAt)}</Badge> : <Badge tone="accent">Termina {formatRelativeDate(g.endsAt)}</Badge>}
                      {!g.ended && (
                        <Button variant="dark" onClick={() => void act({ kind: 'end', id: g.id }, `end:${g.id}`)} loading={busy === `end:${g.id}`}>
                          <Play size={13} /> Terminar agora
                        </Button>
                      )}
                      {g.ended && (
                        <Button variant="dark" onClick={() => void act({ kind: 'reroll', id: g.id }, `reroll:${g.id}`)} loading={busy === `reroll:${g.id}`}>
                          <Repeat size={13} /> Reroll
                        </Button>
                      )}
                      <button onClick={() => setToDelete(g)} className="rounded-md p-1.5 text-faint hover:bg-danger/10 hover:text-danger" title="Apagar">
                        <Trash2 size={15} />
                      </button>
                    </Card>
                  ))}
                </section>
              ),
          )}
        </>
      )}

      {tab === 'custom' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <Card className="flex flex-col gap-4">
              <SectionTitle icon={Settings2} title="Participação" subtitle="Vale para os sorteios novos (os que já estão a decorrer mantêm a forma de participar)." />
              <div className="grid grid-cols-2 gap-2">
                {(['button', 'reaction'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set('entryMode', m)}
                    className={`rounded-xl border px-3 py-3 text-left ${draft.entryMode === m ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong'}`}
                  >
                    <p className="text-sm font-bold text-text">{m === 'button' ? '🔘 Botão "Participar"' : '😀 Reação'}</p>
                    <p className="text-[11px] text-muted">{m === 'button' ? 'Mostra quantos estão a participar no próprio botão.' : 'Quem reagir com o emoji entra.'}</p>
                  </button>
                ))}
              </div>
              {draft.entryMode === 'reaction' ? (
                <div className="max-w-xs">
                  <Label>Emoji da reação</Label>
                  <div className="mt-1.5">
                    <EmojiTextInput value={draft.reactionEmoji} onChange={(v) => set('reactionEmoji', v)} emojis={emojis} maxLength={100} />
                  </div>
                </div>
              ) : (
                <Toggle checked={draft.allowLeave} onChange={(v) => set('allowLeave', v)} label="Carregar outra vez no botão = sair do sorteio" />
              )}
              <Toggle checked={draft.dmWinners} onChange={(v) => set('dmWinners', v)} label="Avisar os vencedores por DM" />
              <div>
                <Label>Marcar cargo quando o sorteio é publicado</Label>
                <select value={draft.mentionRoleId ?? ''} onChange={(e) => set('mentionRoleId', e.target.value || null)} className={`mt-1.5 max-w-xs ${inputClass}`}>
                  <option value="">Ninguém</option>
                  {ctx.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      @{r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Só quem tem um destes cargos pode participar (vazio = toda a gente)</Label>
                <div className="mt-1.5">
                  <RolePills roles={ctx.roles} value={draft.requiredRoleIds} onChange={(v) => set('requiredRoleIds', v)} />
                </div>
              </div>
              <div>
                <Label>Quem pode rerolar pelo botão (além de quem gere o servidor)</Label>
                <div className="mt-1.5">
                  <RolePills roles={ctx.roles} value={draft.managerRoleIds} onChange={(v) => set('managerRoleIds', v)} />
                </div>
              </div>
            </Card>

            <Card className="flex flex-col gap-3 self-start xl:sticky xl:top-4">
              <p className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Pré-visualização do sorteio</p>
              {draft.mentionRoleId && <p className="text-sm text-[#c9cdfb]">@{ctx.roles.find((r) => r.id === draft.mentionRoleId)?.name}</p>}
              {draft.start.embed && startTemplate ? (
                <EmbedPreview draft={sub(startTemplate, values)} botName="LisDiscord" content={fillGiveaway(draft.start.content, values)} />
              ) : (
                <div className="rounded-lg bg-raised p-4 text-sm whitespace-pre-wrap text-text">{fillGiveaway(draft.start.content, values) || `🎉 **${values.premio}** — 1 vencedor(es), termina ${values.termina}.`}</div>
              )}
              <div className="flex flex-wrap gap-2 px-1">
                {draft.entryMode === 'button' && <DiscordButtonPreview label={fillGiveaway(draft.joinButton.label || 'Participar', values)} emoji={draft.joinButton.emoji} style={draft.joinButton.style} emojis={emojis} />}
                {draft.participantsButton.show && <DiscordButtonPreview label={draft.participantsButton.label || 'Participantes'} emoji={draft.participantsButton.emoji} style={draft.participantsButton.style} emojis={emojis} />}
                {draft.entryMode === 'reaction' && <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-sm">{draft.reactionEmoji} 27</span>}
              </div>
            </Card>
          </div>

          <Card className="flex flex-col gap-4">
            <SectionTitle icon={MousePointerClick} title="Botões" subtitle="No texto do botão Participar podes usar {participantes} — o número atualiza sozinho." />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <CustomButtonEditor title="Participar" value={{ ...draft.joinButton, show: true }} fallback="Participar" emojis={emojis} onChange={(v) => set('joinButton', { ...v, show: true })} />
              <CustomButtonEditor title="Participantes (lista)" value={draft.participantsButton} fallback="Participantes" emojis={emojis} onChange={(v) => set('participantsButton', v)} />
              <CustomButtonEditor title="Rerolar" value={draft.rerollButton} fallback="Rerolar" emojis={emojis} onChange={(v) => set('rerollButton', v)} />
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <SectionTitle icon={MessageSquare} title="Mensagens" subtitle="Cada uma pode ir em embed (personalizável) ou só em texto. O texto aparece por cima do embed — é aí que as menções notificam." />
            <Tokens tokens={GIVEAWAY_PLACEHOLDERS} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {MESSAGES.map((m) => (
                <div key={m.key} className="flex flex-col gap-2 rounded-xl border border-border bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-text">{m.title}</p>
                      <p className="text-[11px] text-muted">{m.hint}</p>
                    </div>
                    <Toggle checked={draft[m.key].embed} onChange={(embed) => setMsg(m.key, { embed })} label="Em embed" />
                  </div>
                  <RichTextField
                    label={draft[m.key].embed ? 'Texto por cima do embed (opcional)' : 'Texto da mensagem'}
                    value={draft[m.key].content}
                    onChange={(content) => setMsg(m.key, { content })}
                    emojis={emojis}
                    rows={2}
                    maxLength={1800}
                  />
                  {draft[m.key].embed && (
                    <Button variant="dark" onClick={() => setEditing(m)} disabled={!guildId}>
                      <Palette size={14} /> Personalizar embed
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <SectionTitle icon={Users} title="Respostas a quem clica" subtitle="Só a pessoa que clicou vê. Tokens: {premio}, {participantes}, {cargos}…" />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {REPLIES.map((r) => (
                <div key={r.key}>
                  <Label>{r.label}</Label>
                  <div className="mt-1.5">
                    <EmojiTextInput value={String(draft[r.key])} onChange={(v) => set(r.key, v as never)} emojis={emojis} maxLength={500} />
                  </div>
                </div>
              ))}
              <div>
                <Label>Linha de cada participante na lista — {'{posicao}'}, {'{membro}'}</Label>
                <input value={draft.participantLine} onChange={(e) => set('participantLine', e.target.value)} maxLength={200} className={`mt-1.5 font-mono ${inputClass}`} />
              </div>
            </div>
          </Card>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Novo sorteio" width="lg">
        <form onSubmit={create} className="flex flex-col gap-4">
          <div>
            <Label>Canal</Label>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={`mt-1.5 ${inputClass}`}>
              {ctx.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Prémio</Label>
            <input value={prize} onChange={(e) => setPrize(e.target.value)} maxLength={200} placeholder="Ex.: Nitro de 1 mês" className={`mt-1.5 ${inputClass}`} />
          </div>
          <RichTextField label="Descrição (opcional — {descricao})" value={description} onChange={setDescription} emojis={emojis} rows={3} maxLength={1500} />
          <div>
            <Label>Duração (ex.: 1h30m, 2d, 45m)</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {DURATIONS.map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${duration === d ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-text'}`}
                >
                  {d}
                </button>
              ))}
              <input value={duration} onChange={(e) => setDuration(e.target.value)} className={`w-28 font-mono ${inputClass}`} />
            </div>
            {!durationMs && <p className="mt-1 text-[11px] text-danger">Formato inválido.</p>}
          </div>
          <div>
            <Label>Número de vencedores</Label>
            <input type="number" min={1} max={50} value={winnerCount} onChange={(e) => setWinnerCount(Number(e.target.value))} className={`mt-1.5 w-24 ${inputClass}`} />
          </div>
          <p className="text-xs text-faint">Usa as mensagens e os botões do separador Personalizar. Termina sozinho {isRemote ? '(o bot remoto está sempre ligado)' : 'enquanto o bot estiver ligado'}.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="dark" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy === 'create'} disabled={!channelId || !prize.trim() || !durationMs || winnerCount < 1}>
              <Gift size={14} /> Publicar sorteio
            </Button>
          </div>
        </form>
      </Modal>

      {editing && (
        <TemplateEditorModal
          open
          onClose={() => {
            setEditing(null)
            loadTemplates()
          }}
          kind={editing.kind}
          guildId={guildId}
          isRemote={isRemote}
          title={`Personalizar — ${editing.title}`}
          hint="{ganhadores} são as menções dos vencedores; {termina} conta o tempo sozinho no Discord. Usa {barra} para uma linha divisória."
          tokens={GIVEAWAY_PLACEHOLDERS}
          previewPlaceholders={values}
          previewContent={fillGiveaway(draft[editing.key].content, values)}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void act({ kind: 'delete', id: toDelete.id }, `del:${toDelete.id}`)
        }}
        title="Apagar sorteio"
        description={toDelete?.ended ? `Tira "${toDelete?.prize}" da lista (as mensagens no Discord ficam).` : `Cancela "${toDelete?.prize}" e apaga a mensagem do sorteio no Discord.`}
        confirmLabel="Apagar"
        danger
      />
    </div>
  )
}
