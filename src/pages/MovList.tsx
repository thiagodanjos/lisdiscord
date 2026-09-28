import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ClipboardCopy, Hash, ListOrdered, MessageSquareText, MousePointerClick, Palette, Radio, Save, ScrollText, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { formatRelativeDate } from '../lib/format'
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Toggle } from '../components/ui'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import { EmbedPreview } from '../components/EmbedPreview'
import { EmojiTextInput } from '../components/EmojiTextInput'
import { DiscordButtonEditor, DiscordButtonPreview } from '../components/DiscordButtonEditor'
import { buildMovListCopy, defaultMovListSettings, paginateMovList } from '../../shared/movList'
import {
  MOV_LIST_COPY_HEADER_PLACEHOLDERS,
  MOV_LIST_LINE_PLACEHOLDERS,
  MOV_LIST_PLACEHOLDERS,
  MOV_LIST_REPLY_PLACEHOLDERS,
  type BotEmoji,
  type ChannelPickerEntry,
  type EmbedDraft,
  type GuildSummary,
  type MemberSearchResult,
  type MovListMember,
  type MovListOp,
  type MovListSettings,
  type RemoteBotConfig,
  type RolePickerEntry,
} from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

type TextKey = {
  [K in keyof MovListSettings]: MovListSettings[K] extends string ? K : never
}[keyof MovListSettings]

const REPLY_FIELDS: { key: TextKey; label: string; hint: string }[] = [
  { key: 'addPrompt', label: 'Janela do "Add Membro"', hint: 'Texto por cima do seletor de membros (só quem clicou vê).' },
  { key: 'removePrompt', label: 'Janela do "Remover membro"', hint: 'Texto por cima da lista de quem pode sair.' },
  { key: 'selectPlaceholder', label: 'Texto dentro do seletor', hint: 'Aparece no seletor antes de escolher alguém.' },
  { key: 'replyAdded', label: 'Resposta: adicionados', hint: '{membros} = menções de quem entrou · {quantidade} · {total}' },
  { key: 'replyRemoved', label: 'Resposta: removidos', hint: '{membros} = menções de quem saiu · {quantidade} · {total}' },
  { key: 'replyAlready', label: 'Resposta: já estavam na lista', hint: '{membros} = quem já lá estava' },
  { key: 'replyNothing', label: 'Resposta: nada mudou', hint: 'Quando não há ninguém para adicionar/remover.' },
  { key: 'replyNoPermission', label: 'Resposta: sem permissão', hint: 'Quando alguém sem cargo de gestão clica.' },
]

/** Botões da mensagem e das janelas — prev/next partilham a mesma cor. */
const BUTTONS: { title: string; label: TextKey; emoji: TextKey; style: 'addStyle' | 'removeStyle' | 'copyStyle' | 'pageStyle' | 'byIdStyle'; fallback: string }[] = [
  { title: 'Add Membro', label: 'addLabel', emoji: 'addEmoji', style: 'addStyle', fallback: 'Add Membro' },
  { title: 'Remover membro', label: 'removeLabel', emoji: 'removeEmoji', style: 'removeStyle', fallback: 'Remover membro' },
  { title: 'Copiar listagem', label: 'copyLabel', emoji: 'copyEmoji', style: 'copyStyle', fallback: 'Copiar listagem' },
  { title: 'Página anterior', label: 'prevLabel', emoji: 'prevEmoji', style: 'pageStyle', fallback: 'Anterior' },
  { title: 'Página seguinte', label: 'nextLabel', emoji: 'nextEmoji', style: 'pageStyle', fallback: 'Seguinte' },
  { title: 'Por ID (nas janelas)', label: 'byIdLabel', emoji: 'byIdEmoji', style: 'byIdStyle', fallback: 'Por ID' },
]

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{children}</label>
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-faint">{children}</p>
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

function SectionTitle({ icon: Icon, title, subtitle }: { icon: typeof Hash; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon size={17} />
      </div>
      <div>
        <h3 className="text-sm font-black tracking-wide uppercase">{title}</h3>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  )
}

function substitute(text: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), text)
}

export default function MovList() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [roles, setRoles] = useState<RolePickerEntry[]>([])
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [settings, setSettings] = useState<MovListSettings>(defaultMovListSettings())
  const [draft, setDraft] = useState<MovListSettings>(defaultMovListSettings())
  const [members, setMembers] = useState<MovListMember[]>([])
  const [template, setTemplate] = useState<EmbedDraft | null>(null)
  const [editingEmbed, setEditingEmbed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [error, setError] = useState('')
  const [memberError, setMemberError] = useState('')
  const [memberNote, setMemberNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<MemberSearchResult[]>([])
  const [idsText, setIdsText] = useState('')
  const [importRoleId, setImportRoleId] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [previewPage, setPreviewPage] = useState(0)

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
    get(guildId, 'movList')
      .then((r) => setTemplate(r.draft))
      .catch(() => setTemplate(null))
  }

  useEffect(() => {
    if (!guildId) return
    setError('')
    setMemberError('')
    setMemberNote('')
    const listChannels = isRemote ? bridge.listRemoteChannels : bridge.listChannels
    const listRoles = isRemote ? bridge.listRemoteRoles : bridge.listRoles
    const getList = isRemote ? bridge.getRemoteMovList : bridge.getMovList
    listChannels(guildId)
      .then((c) => setChannels(c.filter((ch) => ch.kind === 'text' || ch.kind === 'announcement')))
      .catch((err) => setError(cleanIpcError(err)))
    listRoles(guildId).then(setRoles).catch(() => setRoles([]))
    getList(guildId)
      .then((s) => {
        setSettings(s.settings)
        setDraft(s.settings)
        setMembers(s.members)
      })
      .catch((err) => setError(cleanIpcError(err)))
    loadTemplate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  // Pesquisa de membros para adicionar (com um pequeno atraso enquanto se escreve).
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
  const set = <K extends keyof MovListSettings>(key: K, value: MovListSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const pages = useMemo(() => paginateMovList(draft, members, 'preview'), [draft, members])
  const page = Math.min(previewPage, pages.length - 1)
  const placeholders = useMemo(
    () => ({ listagem: pages[page], total: String(members.length), pagina: String(page + 1), paginas: String(pages.length), atualizado: 'hoje às 21:04', servidor: guildName }),
    [pages, page, members.length, guildName],
  )
  const previewDraft = useMemo<EmbedDraft | null>(() => {
    if (!template) return null
    const sub = (t: string | undefined) => substitute(t ?? '', placeholders)
    return {
      ...template,
      title: sub(template.title),
      description: sub(template.description),
      footer: sub(template.footer),
      authorName: sub(template.authorName),
      fields: template.fields.map((f) => ({ ...f, name: sub(f.name), value: sub(f.value) })),
    }
  }, [template, placeholders])
  const copyPreview = useMemo(() => buildMovListCopy(draft, members, guildName, new Date().toLocaleDateString('pt-PT')), [draft, members, guildName])

  async function save() {
    setSaving(true)
    setError('')
    try {
      const setFn = isRemote ? bridge.setRemoteMovListSettings : bridge.setMovListSettings
      const saved = await setFn(guildId, draft)
      setSettings(saved.settings)
      setDraft(saved.settings)
      setMembers(saved.members)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setSaving(false)
    }
  }

  async function runOp(op: MovListOp) {
    setBusy(true)
    setMemberError('')
    setMemberNote('')
    try {
      const update = isRemote ? bridge.updateRemoteMovListMembers : bridge.updateMovListMembers
      const state = await update(guildId, op)
      setMembers(state.members)
      if (state.message) setMemberNote(state.message)
    } catch (err) {
      setMemberError(cleanIpcError(err))
    } finally {
      setBusy(false)
    }
  }

  const listedIds = new Set(members.map((m) => m.userId))
  const idsFromText = [...new Set(idsText.match(/\d{17,20}/g) ?? [])]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Listagem Mov Call"
        subtitle="Uma mensagem com todos os membros de Mov Call numerados (menção e ID) e os botões Add Membro · Remover membro · Copiar listagem"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isRemote && (
              <Badge tone="cyan">
                <Radio size={11} /> A usar o bot remoto
              </Badge>
            )}
            <Button onClick={save} loading={saving} disabled={!guildId || !dirty}>
              <Save size={14} />
              {savedOk ? 'Guardado ✓' : 'Guardar e publicar'}
            </Button>
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
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ---- Mensagem ---- */}
        <Card className="flex flex-col gap-4">
          <SectionTitle icon={Hash} title="Mensagem da listagem" subtitle="O canal onde fica a lista. Ao guardar, o bot publica (ou atualiza) a mensagem." />
          <div className="flex flex-wrap items-center gap-2">
            <select value={draft.channelId ?? ''} onChange={(e) => set('channelId', e.target.value || null)} className={`max-w-xs flex-1 ${inputClass}`}>
              <option value="">Desligada</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
            <Button variant="dark" onClick={() => setEditingEmbed(true)} disabled={!guildId}>
              <Palette size={14} />
              Personalizar embed
            </Button>
            {settings.channelId ? (
              <Badge tone="success">
                <Radio size={10} /> #{settings.channelName}
              </Badge>
            ) : (
              <Badge tone="default">Não publicada</Badge>
            )}
          </div>
          <Hint>
            No embed, <code className="text-accent">{'{listagem}'}</code> é onde entra a lista numerada. O título, a cor (hexadecimal), a imagem e o rodapé mudam-se em
            "Personalizar embed".
          </Hint>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <div>
              <Label>Linha de cada membro</Label>
              <input value={draft.lineFormat} onChange={(e) => set('lineFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
              <Tokens tokens={MOV_LIST_LINE_PLACEHOLDERS} />
            </div>
            <div>
              <Label>Por página</Label>
              <input
                type="number"
                min={5}
                max={100}
                value={draft.perPage}
                onChange={(e) => set('perPage', Number(e.target.value))}
                className={`mt-1.5 ${inputClass}`}
              />
            </div>
          </div>
          <Toggle checked={draft.blankLineBetween} onChange={(v) => set('blankLineBetween', v)} label="Linha em branco entre membros" />
          <div>
            <Label>Texto com a lista vazia</Label>
            <div className="mt-1.5">
              <EmojiTextInput value={draft.emptyText} onChange={(v) => set('emptyText', v)} emojis={emojis} maxLength={1000} />
            </div>
          </div>
        </Card>

        {/* ---- Pré-visualização ---- */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Pré-visualização</p>
            {pages.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <button type="button" className="rounded border border-border px-2 py-0.5 disabled:opacity-40" disabled={page === 0} onClick={() => setPreviewPage(page - 1)}>
                  ◀
                </button>
                {page + 1}/{pages.length}
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 disabled:opacity-40"
                  disabled={page >= pages.length - 1}
                  onClick={() => setPreviewPage(page + 1)}
                >
                  ▶
                </button>
              </div>
            )}
          </div>
          {previewDraft ? <EmbedPreview draft={previewDraft} botName="LisDiscord" /> : <p className="text-xs text-faint">A carregar…</p>}
          <div className="flex flex-wrap gap-2 px-1">
            <DiscordButtonPreview label={draft.addLabel || 'Add Membro'} emoji={draft.addEmoji} style={draft.addStyle} emojis={emojis} />
            <DiscordButtonPreview label={draft.removeLabel || 'Remover membro'} emoji={draft.removeEmoji} style={draft.removeStyle} emojis={emojis} />
            <DiscordButtonPreview label={draft.copyLabel || 'Copiar listagem'} emoji={draft.copyEmoji} style={draft.copyStyle} emojis={emojis} />
          </div>
          {pages.length > 1 && (
            <div className="flex flex-wrap gap-2 px-1">
              <DiscordButtonPreview label={draft.prevLabel || 'Anterior'} emoji={draft.prevEmoji} style={draft.pageStyle} emojis={emojis} disabled={page === 0} />
              <DiscordButtonPreview label={`${page + 1}/${pages.length}`} emoji="" style="secondary" emojis={emojis} disabled />
              <DiscordButtonPreview label={draft.nextLabel || 'Seguinte'} emoji={draft.nextEmoji} style={draft.pageStyle} emojis={emojis} disabled={page >= pages.length - 1} />
            </div>
          )}
          <p className="text-[11px] text-faint">Na Discord, os botões ficam dentro da caixa, por baixo de uma linha divisória. As menções aparecem azuis e não notificam ninguém.</p>
        </Card>
      </div>

      {/* ---- Membros ---- */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle icon={Users} title={`Membros na listagem (${members.length})`} subtitle="Mudanças aqui vão logo para a mensagem na Discord — não precisas de guardar." />
          <Button variant="dark" onClick={() => setConfirmClear(true)} disabled={!guildId || members.length === 0 || busy}>
            <Trash2 size={14} />
            Limpar lista
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="relative">
            <Label>Adicionar por nome</Label>
            <div className="relative mt-1.5">
              <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Escreve parte do nome…" className={`pl-8 ${inputClass}`} />
            </div>
            {results.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-raised shadow-xl">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={listedIds.has(r.id) || busy}
                    onClick={() => {
                      void runOp({ kind: 'add', userIds: [r.id] })
                      setSearch('')
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-accent-soft disabled:opacity-50"
                  >
                    <span className="truncate text-text">{r.tag}</span>
                    <span className="shrink-0 text-faint">{listedIds.has(r.id) ? 'já está' : r.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>Adicionar por ID</Label>
            <div className="mt-1.5 flex gap-2">
              <input value={idsText} onChange={(e) => setIdsText(e.target.value)} placeholder="IDs separados por espaço ou vírgula" className={`font-mono ${inputClass}`} />
              <Button
                onClick={() => {
                  void runOp({ kind: 'add', userIds: idsFromText })
                  setIdsText('')
                }}
                disabled={idsFromText.length === 0 || busy}
              >
                <UserPlus size={14} />
              </Button>
            </div>
            {idsText && <Hint>{idsFromText.length} ID(s) reconhecido(s)</Hint>}
          </div>
          <div>
            <Label>Importar todos de um cargo</Label>
            <div className="mt-1.5 flex gap-2">
              <select value={importRoleId} onChange={(e) => setImportRoleId(e.target.value)} className={inputClass}>
                <option value="">Escolhe o cargo…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
              <Button onClick={() => void runOp({ kind: 'importRole', roleId: importRoleId })} disabled={!importRoleId || busy}>
                Importar
              </Button>
            </div>
          </div>
        </div>

        {memberNote && <p className="text-xs text-success">✅ {memberNote}</p>}
        {memberError && <p className="text-xs text-danger">❌ {memberError}</p>}

        {members.length === 0 ? (
          <EmptyState title="Ninguém na listagem" description="Adiciona membros aqui ou pelo botão Add Membro na Discord." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-black/30 text-[10px] tracking-[0.12em] text-faint uppercase">
                <tr>
                  <th className="w-12 px-3 py-2">Nº</th>
                  <th className="px-3 py-2">Membro</th>
                  <th className="px-3 py-2">ID</th>
                  <th className="hidden px-3 py-2 md:table-cell">Adicionado</th>
                  <th className="w-28 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.userId} className="border-t border-border/60 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-bold text-muted">{i + 1}.</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-text">{m.displayName || m.username}</span>
                      <span className="ml-1.5 text-faint">@{m.username}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-muted">{m.userId}</td>
                    <td className="hidden px-3 py-2 text-faint md:table-cell">
                      {formatRelativeDate(m.addedAt)}
                      {m.addedByTag ? ` · ${m.addedByTag}` : ''}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="Subir"
                          disabled={i === 0 || busy}
                          onClick={() => void runOp({ kind: 'move', userId: m.userId, delta: -1 })}
                          className="rounded border border-border p-1 text-muted hover:text-text disabled:opacity-30"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          title="Descer"
                          disabled={i === members.length - 1 || busy}
                          onClick={() => void runOp({ kind: 'move', userId: m.userId, delta: 1 })}
                          className="rounded border border-border p-1 text-muted hover:text-text disabled:opacity-30"
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          title="Remover"
                          disabled={busy}
                          onClick={() => void runOp({ kind: 'remove', userIds: [m.userId] })}
                          className="rounded border border-border p-1 text-muted hover:text-danger disabled:opacity-30"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---- Botões ---- */}
      <Card className="flex flex-col gap-4">
        <SectionTitle
          icon={MousePointerClick}
          title="Botões"
          subtitle="Texto, emoji (normal ou do bot) e cor de cada botão. Anterior/Seguinte só aparecem quando a lista tem mais de uma página."
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {BUTTONS.map((b) => (
            <DiscordButtonEditor
              key={b.label}
              title={b.title}
              label={draft[b.label]}
              emoji={draft[b.emoji]}
              style={draft[b.style]}
              fallbackLabel={b.fallback}
              emojis={emojis}
              onChange={(patch) =>
                setDraft((d) => ({
                  ...d,
                  ...(patch.label !== undefined ? { [b.label]: patch.label } : {}),
                  ...(patch.emoji !== undefined ? { [b.emoji]: patch.emoji } : {}),
                  ...(patch.style !== undefined ? { [b.style]: patch.style } : {}),
                }))
              }
            />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ---- Permissões ---- */}
        <Card className="flex flex-col gap-3">
          <SectionTitle icon={ShieldCheck} title="Quem pode usar" subtitle="Administradores e quem tem Gerir servidor podem sempre. Junta aqui os cargos da gestão." />
          {roles.length === 0 ? (
            <p className="text-xs text-faint">Sem cargos para mostrar.</p>
          ) : (
            <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-black/20 p-2">
              {roles.map((r) => {
                const on = draft.managerRoleIds.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => set('managerRoleIds', on ? draft.managerRoleIds.filter((id) => id !== r.id) : [...draft.managerRoleIds, r.id])}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      on ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:border-accent/60 hover:text-text'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: r.color === '#000000' ? '#99aab5' : r.color }} />
                    {r.name}
                    {on && <span>✓</span>}
                  </button>
                )
              })}
            </div>
          )}
          <Toggle checked={draft.copyForEveryone} onChange={(v) => set('copyForEveryone', v)} label='"Copiar listagem" para todos (senão só a gestão)' />
        </Card>

        {/* ---- Copiar ---- */}
        <Card className="flex flex-col gap-3">
          <SectionTitle icon={ClipboardCopy} title="Copiar listagem" subtitle="O texto que o bot manda (só para quem clicou) — pronto a copiar no dia de puxar horas." />
          <div>
            <Label>Cabeçalho</Label>
            <div className="mt-1.5">
              <EmojiTextInput value={draft.copyHeader} onChange={(v) => set('copyHeader', v)} emojis={emojis} maxLength={300} />
            </div>
            <Tokens tokens={MOV_LIST_COPY_HEADER_PLACEHOLDERS} />
          </div>
          <div>
            <Label>Linha de cada membro</Label>
            <input value={draft.copyFormat} onChange={(e) => set('copyFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
            <Tokens tokens={MOV_LIST_LINE_PLACEHOLDERS} />
          </div>
          <Toggle checked={draft.copyAsCodeBlock} onChange={(v) => set('copyAsCodeBlock', v)} label="Em bloco de código (fácil de selecionar tudo)" />
          <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-black/40 p-3 font-mono text-[11px] whitespace-pre-wrap text-muted">{copyPreview}</pre>
          <Hint>Se a lista passar o limite de uma mensagem, o bot manda-a num ficheiro .txt.</Hint>
        </Card>
      </div>

      {/* ---- Textos ---- */}
      <Card className="flex flex-col gap-4">
        <SectionTitle icon={MessageSquareText} title="Janelas e respostas" subtitle="Tudo o que o bot escreve a quem clica nos botões (só essa pessoa vê)." />
        <Tokens tokens={MOV_LIST_REPLY_PLACEHOLDERS} />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {REPLY_FIELDS.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <div className="mt-1.5">
                <EmojiTextInput value={draft[f.key] as string} onChange={(v) => set(f.key, v)} emojis={emojis} maxLength={f.key === 'selectPlaceholder' ? 150 : 1500} />
              </div>
              <Hint>{f.hint}</Hint>
            </div>
          ))}
        </div>
      </Card>

      {/* ---- Log ---- */}
      <Card className="flex flex-col gap-3">
        <SectionTitle icon={ScrollText} title="Log da listagem" subtitle="Opcional: regista quem adicionou ou removeu membros — útil para o controlo de staff." />
        <select value={draft.logChannelId ?? ''} onChange={(e) => set('logChannelId', e.target.value || null)} className={`max-w-xs ${inputClass}`}>
          <option value="">Sem log</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <Label>Quando alguém adiciona</Label>
            <div className="mt-1.5">
              <EmojiTextInput value={draft.logAdded} onChange={(v) => set('logAdded', v)} emojis={emojis} maxLength={1500} />
            </div>
          </div>
          <div>
            <Label>Quando alguém remove</Label>
            <div className="mt-1.5">
              <EmojiTextInput value={draft.logRemoved} onChange={(v) => set('logRemoved', v)} emojis={emojis} maxLength={1500} />
            </div>
          </div>
        </div>
        <Hint>{'{autor}'} = quem mexeu · {'{membros}'} · {'{quantidade}'} · {'{total}'}</Hint>
      </Card>

      <Card className="flex flex-wrap items-center gap-3">
        <ListOrdered size={16} className="text-accent" />
        <Button onClick={save} loading={saving} disabled={!guildId || !dirty}>
          <Save size={14} />
          {savedOk ? 'Guardado ✓' : 'Guardar e publicar'}
        </Button>
        {dirty ? <span className="text-xs text-warning">Alterações por guardar</span> : <span className="text-xs text-faint">Tudo guardado</span>}
        {error && <p className="w-full text-xs text-danger">❌ {error}</p>}
      </Card>

      {editingEmbed && (
        <TemplateEditorModal
          open
          onClose={() => {
            setEditingEmbed(false)
            loadTemplate()
          }}
          kind="movList"
          guildId={guildId}
          isRemote={isRemote}
          title="Personalizar embed da listagem"
          hint="Mensagem fixa com a lista. {listagem} é onde entram os membros numerados; {pagina}/{paginas} ajudam quando a lista tem várias páginas. Na Discord aparece como uma caixa com a barra de cor e os botões lá dentro. Ao guardar, o bot atualiza logo a mensagem."
          tokens={MOV_LIST_PLACEHOLDERS}
          previewPlaceholders={placeholders}
        />
      )}

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => void runOp({ kind: 'clear' })}
        title="Limpar a listagem?"
        description={`Tira os ${members.length} membros da lista. A mensagem na Discord fica vazia.`}
        confirmLabel="Limpar"
        danger
      />
    </div>
  )
}
