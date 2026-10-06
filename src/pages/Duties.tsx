import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  Eye,
  Layers,
  MessageSquare,
  MousePointerClick,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { inputClass } from '../lib/styles'
import { useGuildContext } from '../lib/useGuildContext'
import { renderDiscordMarkdown } from '../lib/discordMarkdown'
import { Badge, Button, Card, ConfirmDialog, PageHeader, Toggle } from '../components/ui'
import { GuildSelect, Label, RemoteBadge, SectionTitle, Tokens } from '../components/form'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import { EmbedPreview } from '../components/EmbedPreview'
import { EmojiTextInput } from '../components/EmojiTextInput'
import { RichTextField } from '../components/RichTextField'
import { DiscordButtonEditor, DiscordButtonPreview } from '../components/DiscordButtonEditor'
import { DEFAULT_DUTIES, defaultDutiesSettings, dutiesText, dutyId, fillDuty, summaryValues } from '../../shared/duties'
import {
  DUTIES_MINE_PLACEHOLDERS,
  DUTIES_PANEL_PLACEHOLDERS,
  DUTIES_SUMMARY_PLACEHOLDERS,
  DUTY_DETAIL_PLACEHOLDERS,
  type DutiesSettings,
  type Duty,
  type DutyAssignee,
  type DutyButtonKind,
  type DutyPanelButton,
  type EmbedDraft,
  type EmbedTemplateKind,
  type MemberSearchResult,
  type RolePickerEntry,
} from '../../shared/types'

const BUTTON_KINDS: { kind: DutyButtonKind; label: string; hint: string }[] = [
  { kind: 'summary', label: 'Resumo', hint: 'Quem cuida de quê (por pessoa).' },
  { kind: 'mine', label: 'As minhas funções', hint: 'O que a pessoa que clicou tem a cargo.' },
  { kind: 'message', label: 'Mensagem', hint: 'Mostra um texto teu.' },
  { kind: 'link', label: 'Link', hint: 'Abre um site.' },
]

const TEMPLATES: { kind: EmbedTemplateKind; title: string; tokens: readonly string[] }[] = [
  { kind: 'dutiesPanel', title: 'Painel (modo embed)', tokens: DUTIES_PANEL_PLACEHOLDERS },
  { kind: 'dutiesSummary', title: 'Resumo — quem cuida de quê', tokens: DUTIES_SUMMARY_PLACEHOLDERS },
  { kind: 'dutiesMine', title: 'As minhas funções', tokens: DUTIES_MINE_PLACEHOLDERS },
  { kind: 'dutyDetail', title: 'Detalhe de uma função (menu)', tokens: DUTY_DETAIL_PLACEHOLDERS },
]

/** Na pré-visualização: listas "- " viram pontos, como na Discord. */
function previewText(text: string) {
  return text
    .split('\n')
    .map((l) => l.replace(/^- /, '  • '))
    .join('\n')
}

function AssigneeChip({ a, onRemove, roles }: { a: DutyAssignee; onRemove: () => void; roles: RolePickerEntry[] }) {
  const color = a.kind === 'role' ? roles.find((r) => r.id === a.id)?.color : undefined
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[#5865F2]/20 py-0.5 pr-0.5 pl-1.5 text-[12px] font-medium text-[#c9cdfb]" style={color && color !== '#000000' ? { color, background: `${color}22` } : undefined}>
      @{a.name}
      <button type="button" onClick={onRemove} className="rounded p-0.5 opacity-60 hover:bg-white/10 hover:opacity-100" title="Tirar">
        <X size={11} />
      </button>
    </span>
  )
}

/** Escolher quem cuida: pesquisa de membros ou um cargo. */
function AssigneePicker({ guildId, isRemote, roles, onPick, onClose }: { guildId: string; isRemote: boolean; roles: RolePickerEntry[]; onPick: (a: DutyAssignee) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<MemberSearchResult[]>([])
  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      (isRemote ? bridge.searchRemoteMembers : bridge.searchMembers)(guildId, q)
        .then(setResults)
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [q, guildId, isRemote])
  const matchingRoles = roles.filter((r) => q.trim() && r.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6)
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-black/40 p-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome de um membro ou cargo…" className={`py-1.5 pl-8 text-xs ${inputClass}`} />
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-faint hover:text-text">
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {results.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick({ kind: 'user', id: m.id, name: m.tag.replace(/#0$/, '').split('#')[0] })}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-text hover:border-accent"
          >
            👤 {m.tag.replace(/#0$/, '')}
          </button>
        ))}
        {matchingRoles.map((r) => (
          <button key={r.id} type="button" onClick={() => onPick({ kind: 'role', id: r.id, name: r.name })} className="rounded-md border border-border px-2 py-1 text-[11px] text-text hover:border-accent">
            <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: r.color === '#000000' ? '#99aab5' : r.color }} />@{r.name}
          </button>
        ))}
        {q.trim() && results.length === 0 && matchingRoles.length === 0 && <span className="px-1 text-[11px] text-faint">Nada encontrado…</span>}
      </div>
    </div>
  )
}

function AssigneeRow({
  list,
  onChange,
  guildId,
  isRemote,
  roles,
  pickerKey,
  openPicker,
  setOpenPicker,
}: {
  list: DutyAssignee[]
  onChange: (next: DutyAssignee[]) => void
  guildId: string
  isRemote: boolean
  roles: RolePickerEntry[]
  pickerKey: string
  openPicker: string | null
  setOpenPicker: (k: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {list.map((a) => (
          <AssigneeChip key={`${a.kind}:${a.id}`} a={a} roles={roles} onRemove={() => onChange(list.filter((x) => !(x.kind === a.kind && x.id === a.id)))} />
        ))}
        <button
          type="button"
          onClick={() => setOpenPicker(openPicker === pickerKey ? null : pickerKey)}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-faint hover:border-accent hover:text-accent"
        >
          <UserPlus size={11} /> {list.length ? 'Mais' : 'Quem cuida?'}
        </button>
      </div>
      {openPicker === pickerKey && (
        <AssigneePicker
          guildId={guildId}
          isRemote={isRemote}
          roles={roles}
          onClose={() => setOpenPicker(null)}
          onPick={(a) => {
            if (!list.some((x) => x.kind === a.kind && x.id === a.id)) onChange([...list, a])
            setOpenPicker(null)
          }}
        />
      )}
    </div>
  )
}

function sub(draft: EmbedDraft, values: Record<string, string>): EmbedDraft {
  const f = (t: string | undefined) => fillDuty(t ?? '', values)
  return { ...draft, title: f(draft.title), description: f(draft.description), footer: f(draft.footer), fields: draft.fields.map((x) => ({ ...x, name: f(x.name), value: f(x.value) })) }
}

export default function Duties() {
  const ctx = useGuildContext({ channels: true, roles: true, emojis: true })
  const { isRemote, guildId, emojis, roles } = ctx
  const [settings, setSettings] = useState<DutiesSettings>(defaultDutiesSettings())
  const [draft, setDraft] = useState<DutiesSettings>(defaultDutiesSettings())
  const [panelTemplate, setPanelTemplate] = useState<EmbedDraft | null>(null)
  const [editing, setEditing] = useState<(typeof TEMPLATES)[number] | null>(null)
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  function loadTemplate() {
    if (!guildId) return
    ;(isRemote ? bridge.getRemoteEmbedTemplate : bridge.getEmbedTemplate)(guildId, 'dutiesPanel')
      .then((r) => setPanelTemplate(r.draft))
      .catch(() => setPanelTemplate(null))
  }

  useEffect(() => {
    if (!guildId) return
    setError('')
    setNote('')
    bridge
      .getDuties(guildId, isRemote)
      .then((s) => {
        setSettings(s.settings)
        setDraft(s.settings)
      })
      .catch((err) => setError(cleanIpcError(err)))
    loadTemplate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const set = <K extends keyof DutiesSettings>(key: K, value: DutiesSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setDuty = (id: string, patch: Partial<Duty>) => setDraft((d) => ({ ...d, duties: d.duties.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
  const setButton = (id: string, patch: Partial<DutyPanelButton>) => setDraft((d) => ({ ...d, buttons: d.buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))
  const moveDuty = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      const list = [...d.duties]
      const j = index + dir
      if (j < 0 || j >= list.length) return d
      ;[list[index], list[j]] = [list[j], list[index]]
      return { ...d, duties: list }
    })
  const guildName = ctx.guilds.find((g) => g.id === guildId)?.name ?? 'Servidor'
  const funcoes = useMemo(() => dutiesText(draft, 'plain'), [draft])
  const summary = useMemo(() => summaryValues(draft, 'plain', guildName), [draft, guildName])
  const panelValues = { funcoes, total: String(draft.duties.length), atualizado: 'agora mesmo', servidor: guildName }

  async function save() {
    setSaving(true)
    setError('')
    setNote('')
    try {
      const s = await bridge.setDutiesSettings(guildId, draft, isRemote)
      setSettings(s.settings)
      setDraft(s.settings)
      setNote(s.message ?? 'Guardado.')
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setSaving(false)
    }
  }

  async function act(kind: 'publish' | 'remove') {
    setBusy(kind)
    setError('')
    setNote('')
    try {
      // Publicar guarda primeiro, para o painel sair com o que está no ecrã.
      if (kind === 'publish' && dirty) {
        const saved = await bridge.setDutiesSettings(guildId, draft, isRemote)
        setSettings(saved.settings)
        setDraft(saved.settings)
      }
      const s = await bridge.dutiesAction(guildId, { kind }, isRemote)
      setSettings(s.settings)
      setDraft(s.settings)
      setNote(s.message ?? 'Feito.')
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Funções da gestão"
        subtitle="Um painel no Discord com quem cuida de cada função — com botões para ver o resumo, as funções de cada um e cada função em detalhe"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RemoteBadge show={isRemote} />
            <Button variant="dark" onClick={save} loading={saving} disabled={!guildId || !dirty}>
              <Save size={14} /> Guardar
            </Button>
            <Button onClick={() => void act('publish')} loading={busy === 'publish'} disabled={!guildId || !draft.channelId}>
              <Send size={14} /> {settings.messageId ? 'Atualizar painel' : 'Publicar painel'}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <GuildSelect guilds={ctx.guilds} value={guildId} onChange={ctx.setGuildId} />
        <div>
          <Label>Canal do painel</Label>
          <select value={draft.channelId ?? ''} onChange={(e) => set('channelId', e.target.value || null)} className={`mt-1.5 block w-64 ${inputClass}`}>
            <option value="">Escolhe o canal…</option>
            {ctx.channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </div>
        {settings.messageId ? <Badge tone="success">Painel publicado em #{settings.channelName ?? 'canal'}</Badge> : <Badge>Ainda não publicado</Badge>}
        {settings.messageId && (
          <Button variant="ghost" onClick={() => void act('remove')} loading={busy === 'remove'}>
            <Trash2 size={13} /> Apagar painel do Discord
          </Button>
        )}
        {dirty && <span className="pb-2 text-xs text-warning">Alterações por guardar</span>}
      </div>
      {(error || ctx.error) && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">❌ {error || ctx.error}</p>}
      {note && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">✅ {note}</p>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        {/* ---- Funções ---- */}
        <Card className="flex flex-col gap-3">
          <SectionTitle
            icon={ClipboardList}
            title="Funções"
            subtitle="Escreve o nome, põe quem cuida (pessoas ou cargos) e, se quiseres, divide por dias/partes."
            action={
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setConfirmReset(true)}>
                  <RotateCcw size={13} /> Repor
                </Button>
                <Button
                  variant="dark"
                  disabled={draft.duties.length >= 25}
                  onClick={() => {
                    const id = dutyId()
                    set('duties', [...draft.duties, { id, title: 'Nova função', note: '', description: '', assignees: [], subItems: [] }])
                    setExpanded(id)
                  }}
                >
                  <Plus size={14} /> Função
                </Button>
              </div>
            }
          />
          {draft.duties.length === 0 && <p className="text-sm text-muted">Sem funções. Adiciona uma ou repõe as de fábrica.</p>}
          {draft.duties.map((d, i) => (
            <div key={d.id} className="flex flex-col gap-2 rounded-xl border border-border bg-black/20 p-3">
              <div className="flex items-start gap-2">
                <span className="pt-2 text-sm text-faint">{draft.arrow || '↳'}</span>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
                  <input value={d.title} onChange={(e) => setDuty(d.id, { title: e.target.value })} maxLength={200} className={`font-semibold ${inputClass}`} />
                  <input value={d.note} onChange={(e) => setDuty(d.id, { note: e.target.value })} maxLength={200} placeholder="Nota (ex.: durante o dia)" className={inputClass} />
                </div>
                <div className="flex shrink-0 items-center">
                  <button type="button" onClick={() => moveDuty(i, -1)} disabled={i === 0} className="rounded p-1 text-faint hover:text-text disabled:opacity-30" title="Subir">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" onClick={() => moveDuty(i, 1)} disabled={i === draft.duties.length - 1} className="rounded p-1 text-faint hover:text-text disabled:opacity-30" title="Descer">
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="rounded p-1 text-faint hover:text-text" title="Mais opções">
                    <Layers size={14} />
                  </button>
                  <button type="button" onClick={() => set('duties', draft.duties.filter((x) => x.id !== d.id))} className="rounded p-1 text-faint hover:text-danger" title="Apagar">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="pl-5">
                <AssigneeRow
                  list={d.assignees}
                  onChange={(assignees) => setDuty(d.id, { assignees })}
                  guildId={guildId}
                  isRemote={isRemote}
                  roles={roles}
                  pickerKey={d.id}
                  openPicker={openPicker}
                  setOpenPicker={setOpenPicker}
                />
              </div>
              {d.subItems.length > 0 && (
                <div className="flex flex-col gap-2 border-l-2 border-border pl-4 ml-5">
                  {d.subItems.map((s) => (
                    <div key={s.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-faint">•</span>
                        <input
                          value={s.label}
                          onChange={(e) => setDuty(d.id, { subItems: d.subItems.map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x)) })}
                          maxLength={100}
                          className={`py-1 text-xs ${inputClass}`}
                        />
                        <button type="button" onClick={() => setDuty(d.id, { subItems: d.subItems.filter((x) => x.id !== s.id) })} className="rounded p-1 text-faint hover:text-danger" title="Tirar divisão">
                          <X size={13} />
                        </button>
                      </div>
                      <div className="pl-4">
                        <AssigneeRow
                          list={s.assignees}
                          onChange={(assignees) => setDuty(d.id, { subItems: d.subItems.map((x) => (x.id === s.id ? { ...x, assignees } : x)) })}
                          guildId={guildId}
                          isRemote={isRemote}
                          roles={roles}
                          pickerKey={`${d.id}:${s.id}`}
                          openPicker={openPicker}
                          setOpenPicker={setOpenPicker}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {expanded === d.id && (
                <div className="flex flex-col gap-2 pl-5">
                  <RichTextField label="Descrição (aparece ao ver a função em detalhe)" value={d.description} onChange={(description) => setDuty(d.id, { description })} emojis={emojis} rows={2} maxLength={1500} />
                  <Button
                    variant="ghost"
                    className="self-start"
                    disabled={d.subItems.length >= 10}
                    onClick={() => setDuty(d.id, { subItems: [...d.subItems, { id: dutyId('s'), label: `Parte ${d.subItems.length + 1}`, assignees: [] }] })}
                  >
                    <Plus size={13} /> Dividir (ex.: um responsável por dia)
                  </Button>
                </div>
              )}
            </div>
          ))}
        </Card>

        {/* ---- Pré-visualização ---- */}
        <Card className="flex flex-col gap-3 self-start xl:sticky xl:top-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-faint uppercase">
              <Eye size={12} /> Pré-visualização do painel
            </p>
            <div className="inline-flex gap-1 rounded-lg border border-border bg-black/30 p-0.5">
              {[
                { on: true, label: 'Embed' },
                { on: false, label: 'Texto simples' },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => set('useEmbed', o.on)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${draft.useEmbed === o.on ? 'bg-accent-soft text-accent' : 'text-faint hover:text-muted'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {draft.useEmbed && (
            <Button onClick={() => setEditing(TEMPLATES[0])} disabled={!guildId}>
              <Palette size={14} /> Personalizar o embed (cor, título, imagem, rodapé…)
            </Button>
          )}
          {draft.useEmbed && panelTemplate ? (
            <EmbedPreview draft={sub({ ...panelTemplate, description: previewText(panelTemplate.description) }, { ...panelValues, funcoes: previewText(funcoes) })} botName="LisDiscord" />
          ) : (
            <div className="max-h-[520px] overflow-y-auto rounded-lg bg-raised p-4 text-sm leading-relaxed whitespace-pre-wrap text-text">
              {renderDiscordMarkdown(previewText(fillDuty(draft.plainTemplate, panelValues)))}
            </div>
          )}
          {draft.showSelect && draft.duties.length > 0 && (
            <div className="rounded-md border border-border bg-black/40 px-3 py-2 text-xs text-faint">{draft.selectPlaceholder || 'Ver uma função'} ▾</div>
          )}
          <div className="flex flex-wrap gap-2">
            {draft.buttons
              .filter((b) => b.show)
              .map((b) => (
                <DiscordButtonPreview key={b.id} label={`${b.label}${b.kind === 'link' ? ' ↗' : ''}`} emoji={b.emoji} style={b.kind === 'link' ? 'secondary' : b.style} emojis={emojis} />
              ))}
          </div>
          <div className="border-t border-border pt-3">
            <p className="mb-1 text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Resumo (botão)</p>
            <div className="max-h-48 overflow-y-auto text-xs whitespace-pre-wrap text-muted">{summary.resumo}</div>
            {summary.semResponsavel !== '—' && <p className="mt-2 text-[11px] text-warning">Sem responsável: {summary.semResponsavel}</p>}
          </div>
        </Card>
      </div>

      {/* ---- Aparência ---- */}
      <Card className="flex flex-col gap-4">
        <SectionTitle
          icon={Palette}
          title="Aparência do painel"
          subtitle="Texto simples (como uma mensagem normal, igual à imagem) ou embed."
          action={<Toggle checked={draft.useEmbed} onChange={(v) => set('useEmbed', v)} label={draft.useEmbed ? 'Em embed' : 'Texto simples'} />}
        />
        {draft.useEmbed ? (
          <Button variant="dark" className="self-start" onClick={() => setEditing(TEMPLATES[0])} disabled={!guildId}>
            <Palette size={14} /> Personalizar o embed do painel
          </Button>
        ) : (
          <div>
            <RichTextField label="Texto do painel" value={draft.plainTemplate} onChange={(v) => set('plainTemplate', v)} emojis={emojis} rows={3} maxLength={3500} />
            <Tokens tokens={DUTIES_PANEL_PLACEHOLDERS} />
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <Label>Linha de cada função</Label>
            <input value={draft.lineFormat} onChange={(e) => set('lineFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
            <Tokens tokens={['{seta}', '{funcao}', '{nota}', '{responsaveis}', '{numero}']} />
          </div>
          <div>
            <Label>Linha de uma função dividida</Label>
            <input value={draft.groupLineFormat} onChange={(e) => set('groupLineFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
            <Tokens tokens={['{seta}', '{funcao}', '{nota}', '{numero}']} />
          </div>
          <div>
            <Label>Linha de cada divisão</Label>
            <input value={draft.subLineFormat} onChange={(e) => set('subLineFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
            <Tokens tokens={['{item}', '{responsaveis}']} />
          </div>
          <div>
            <Label>Seta ({'{seta}'}) — pode ser um emoji do bot</Label>
            <div className="mt-1.5">
              <EmojiTextInput value={draft.arrow} onChange={(v) => set('arrow', v)} emojis={emojis} maxLength={100} />
            </div>
          </div>
          <div>
            <Label>Entre responsáveis</Label>
            <input value={draft.separator} onChange={(e) => set('separator', e.target.value)} maxLength={20} className={`mt-1.5 font-mono ${inputClass}`} />
          </div>
          <div>
            <Label>Quando não há ninguém</Label>
            <div className="mt-1.5">
              <EmojiTextInput value={draft.emptyAssignee} onChange={(v) => set('emptyAssignee', v)} emojis={emojis} maxLength={200} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <Toggle checked={draft.spacing} onChange={(v) => set('spacing', v)} label="Linha em branco entre funções" />
          <Toggle checked={draft.pingOnPublish} onChange={(v) => set('pingOnPublish', v)} label="As menções notificam as pessoas" />
        </div>
      </Card>

      {/* ---- Botões ---- */}
      <Card className="flex flex-col gap-4">
        <SectionTitle
          icon={MousePointerClick}
          title="Botões e menu"
          subtitle="Já vêm dois por defeito — podes tirar, mudar tudo ou adicionar mais (até 20)."
          action={
            <Button
              variant="dark"
              disabled={draft.buttons.length >= 20}
              onClick={() => set('buttons', [...draft.buttons, { id: dutyId('b'), kind: 'message', show: true, label: 'Novo botão', emoji: '', style: 'secondary', url: '', text: '' }])}
            >
              <Plus size={14} /> Botão
            </Button>
          }
        />
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-black/20 p-3">
          <Toggle checked={draft.showSelect} onChange={(v) => set('showSelect', v)} label='Menu "ver uma função em detalhe"' />
          {draft.showSelect && (
            <div className="max-w-md">
              <Label>Texto do menu</Label>
              <input value={draft.selectPlaceholder} onChange={(e) => set('selectPlaceholder', e.target.value)} maxLength={150} className={`mt-1.5 ${inputClass}`} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {draft.buttons.map((b) => (
            <div key={b.id} className="flex flex-col gap-2 rounded-xl border border-border bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <select value={b.kind} onChange={(e) => setButton(b.id, { kind: e.target.value as DutyButtonKind })} className={`w-48 ${inputClass}`}>
                  {BUTTON_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <span className="flex-1 text-[11px] text-muted">{BUTTON_KINDS.find((k) => k.kind === b.kind)?.hint}</span>
                <Toggle checked={b.show} onChange={(show) => setButton(b.id, { show })} />
                <button type="button" onClick={() => set('buttons', draft.buttons.filter((x) => x.id !== b.id))} className="rounded p-1 text-faint hover:text-danger" title="Apagar botão">
                  <Trash2 size={14} />
                </button>
              </div>
              <DiscordButtonEditor
                title="Botão"
                label={b.label}
                emoji={b.emoji}
                style={b.kind === 'link' ? 'secondary' : b.style}
                fallbackLabel="Botão"
                emojis={emojis}
                onChange={(p) => setButton(b.id, { ...(p.label !== undefined && { label: p.label }), ...(p.emoji !== undefined && { emoji: p.emoji }), ...(p.style && { style: p.style }) })}
              />
              {b.kind === 'link' && <input value={b.url} onChange={(e) => setButton(b.id, { url: e.target.value })} placeholder="https://…" className={inputClass} />}
              {b.kind === 'message' && <RichTextField label="Texto que aparece" value={b.text} onChange={(text) => setButton(b.id, { text })} emojis={emojis} rows={3} maxLength={2000} />}
            </div>
          ))}
        </div>
      </Card>

      {/* ---- Respostas ---- */}
      <Card className="flex flex-col gap-4">
        <SectionTitle icon={MessageSquare} title="O que aparece ao clicar" subtitle="Resumo, as minhas funções e o detalhe de cada função saem em caixa (embed) personalizável." />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label>Linha de cada pessoa no resumo</Label>
            <input value={draft.summaryLineFormat} onChange={(e) => set('summaryLineFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
            <Tokens tokens={['{membro}', '{funcoes}', '{total}']} />
          </div>
          <div>
            <Label>Linha em "as minhas funções"</Label>
            <input value={draft.mineLineFormat} onChange={(e) => set('mineLineFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
            <Tokens tokens={['{seta}', '{funcao}', '{item}']} />
          </div>
          <div>
            <Label>Quando a pessoa não tem funções</Label>
            <div className="mt-1.5">
              <EmojiTextInput value={draft.replyNoDuties} onChange={(v) => set('replyNoDuties', v)} emojis={emojis} maxLength={500} />
            </div>
          </div>
          <div className="flex items-end">
            <Toggle checked={draft.ephemeral} onChange={(v) => set('ephemeral', v)} label="Só quem clicou vê a resposta" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.slice(1).map((t) => (
            <Button key={t.kind} variant="dark" onClick={() => setEditing(t)} disabled={!guildId}>
              <Palette size={14} /> {t.title}
            </Button>
          ))}
        </div>
      </Card>

      {editing && (
        <TemplateEditorModal
          open
          onClose={() => {
            setEditing(null)
            loadTemplate()
          }}
          kind={editing.kind}
          guildId={guildId}
          isRemote={isRemote}
          title={`Personalizar — ${editing.title}`}
          hint="As menções aparecem como @nome na pré-visualização. Usa {barra} para uma linha divisória."
          tokens={editing.tokens}
          previewPlaceholders={{
            ...panelValues,
            ...summary,
            membro: '@Nivia',
            funcoes: editing.kind === 'dutiesPanel' ? previewText(funcoes) : `${draft.arrow} Planilha\n${draft.arrow} Lista de membros inativos`,
            funcao: draft.duties[0]?.title ?? 'Função',
            nota: draft.duties[0]?.note ?? '',
            descricao: draft.duties[0]?.description || '—',
            responsaveis: '@Nivia | @Hsx',
            divisoes: '',
          }}
        />
      )}

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => set('duties', structuredClone(DEFAULT_DUTIES))}
        title="Repor as funções de fábrica?"
        description="Volta à lista das 12 funções (sem responsáveis). Só fica guardado quando carregares em Guardar."
        confirmLabel="Repor"
        danger
      />
    </div>
  )
}
