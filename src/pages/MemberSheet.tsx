import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Archive,
  CheckCircle2,
  Columns3,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  KeyRound,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { formatDateTime, formatRelativeDate } from '../lib/format'
import { inputClass } from '../lib/styles'
import { useGuildContext } from '../lib/useGuildContext'
import { Badge, Button, Card, ConfirmDialog, Modal, PageHeader, Tabs, Toggle } from '../components/ui'
import { GuildSelect, Label, RemoteBadge, RolePills, SectionTitle } from '../components/form'
import { REPORT_TIMEZONES } from '../../shared/movFeatures'
import { buildSheetTabs, defaultMemberSheetSettings, mainSection, SHEET_COLUMN_LABELS } from '../../shared/memberSheet'
import type { MemberRecord, MemberSearchResult, MemberSheetAction, MemberSheetSettings, MemberSheetState } from '../../shared/types'

/** O `inputClass` tem `w-full` — aqui as caixas ficam lado a lado. */
const narrowInput = inputClass.replace('w-full', 'w-56')

const SYNC_OPTIONS = [
  [0, 'Só quando carrego em Sincronizar'],
  [5, 'A cada 5 minutos'],
  [10, 'A cada 10 minutos'],
  [15, 'A cada 15 minutos'],
  [30, 'A cada 30 minutos'],
  [60, 'A cada hora'],
  [120, 'A cada 2 horas'],
  [360, 'A cada 6 horas'],
  [720, 'A cada 12 horas'],
  [1440, 'Uma vez por dia'],
] as const

const BACKUP_OPTIONS = [
  [0, 'Desligado'],
  [6, 'A cada 6 horas'],
  [12, 'A cada 12 horas'],
  [24, 'Uma vez por dia'],
  [72, 'A cada 3 dias'],
  [168, 'Uma vez por semana'],
] as const

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function MemberSheet() {
  const ctx = useGuildContext({ channels: true, roles: true })
  const { isRemote, guildId, roles } = ctx
  const [tab, setTab] = useState<'setup' | 'records'>('setup')
  const [state, setState] = useState<MemberSheetState | null>(null)
  const [draft, setDraft] = useState<MemberSheetSettings>(defaultMemberSheetSettings())
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [previewTab, setPreviewTab] = useState(0)
  const [filter, setFilter] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importRoles, setImportRoles] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [addQuery, setAddQuery] = useState('')
  const [addResults, setAddResults] = useState<MemberSearchResult[]>([])
  const [confirm, setConfirm] = useState<{ title: string; text: string; action: MemberSheetAction } | null>(null)
  const keyInput = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)

  function apply(s: MemberSheetState, keepDraft = false) {
    setState(s)
    if (!keepDraft) setDraft(s.settings)
    if (s.message) setNote(s.message)
  }

  useEffect(() => {
    if (!guildId) return
    setError('')
    setNote('')
    bridge
      .getMemberSheet(guildId, isRemote)
      .then((s) => apply(s))
      .catch((err) => setError(cleanIpcError(err)))
  }, [guildId, isRemote])

  useEffect(() => {
    if (!addQuery.trim() || !guildId) {
      setAddResults([])
      return
    }
    const t = setTimeout(() => {
      (isRemote ? bridge.searchRemoteMembers : bridge.searchMembers)(guildId, addQuery)
        .then(setAddResults)
        .catch(() => setAddResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [addQuery, guildId, isRemote])

  const dirty = state ? JSON.stringify(draft) !== JSON.stringify(state.settings) : false
  const set = <K extends keyof MemberSheetSettings>(key: K, value: MemberSheetSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const roleName = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])
  const records = useMemo(() => state?.records ?? [], [state])
  const tabs = useMemo(() => buildSheetTabs(draft, records, { roleNames: roleName }), [draft, records, roleName])
  const shown = tabs[Math.min(previewTab, tabs.length - 1)]
  const visibleRecords = records.filter((r) => {
    const q = filter.trim().toLowerCase()
    return !q || r.displayName.toLowerCase().includes(q) || r.tag.toLowerCase().includes(q) || r.userId.includes(q)
  })

  async function save() {
    setSaving(true)
    setError('')
    setNote('')
    try {
      apply(await bridge.setMemberSheetSettings(guildId, draft, isRemote))
      setNote('Guardado.')
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setSaving(false)
    }
  }

  async function act(action: MemberSheetAction, key: string = action.kind) {
    setBusy(key)
    setError('')
    setNote('')
    try {
      // Sincronizar/testar usam as definições guardadas — guarda primeiro o que está no ecrã.
      if ((action.kind === 'sync' || action.kind === 'test') && dirty) apply(await bridge.setMemberSheetSettings(guildId, draft, isRemote))
      const s = await bridge.memberSheetAction(guildId, action, isRemote)
      apply(s, dirty && action.kind !== 'sync' && action.kind !== 'test')
      if (action.kind === 'export' && s.exportJson) download(`registo-membros-${new Date().toISOString().slice(0, 10)}.json`, s.exportJson)
      return true
    } catch (err) {
      setError(cleanIpcError(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function uploadKey(file: File | undefined) {
    if (!file) return
    setBusy('key')
    setError('')
    setNote('')
    try {
      const r = await bridge.setGoogleKey(await file.text(), isRemote)
      setState((s) => (s ? { ...s, googleEmail: r.googleEmail } : s))
      setNote('Chave guardada no bot. Agora partilha a planilha com o email abaixo (como Editor).')
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setBusy(null)
      if (keyInput.current) keyInput.current.value = ''
    }
  }

  async function removeKey() {
    setBusy('key')
    try {
      const r = await bridge.setGoogleKey(null, isRemote)
      setState((s) => (s ? { ...s, googleEmail: r.googleEmail } : s))
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setBusy(null)
    }
  }

  async function restoreFile(file: File | undefined) {
    if (!file) return
    await act({ kind: 'import', json: await file.text() })
    if (backupInput.current) backupInput.current.value = ''
  }

  const moveSection = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const list = [...d.sections]
      const j = i + dir
      if (j < 0 || j >= list.length) return d
      ;[list[i], list[j]] = [list[j], list[i]]
      return { ...d, sections: list }
    })
  const moveColumn = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const list = [...d.columns]
      const j = i + dir
      if (j < 0 || j >= list.length) return d
      ;[list[i], list[j]] = [list[j], list[i]]
      return { ...d, columns: list }
    })
  const unusedRoles = roles.filter((r) => !draft.sections.some((s) => s.roleId === r.id))
  const status = state?.status

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Registo & Planilha"
        subtitle="Quem é verificado fica gravado no registo do bot com os cargos — e o bot copia tudo para uma planilha do Google, em lote, separado por cargo"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RemoteBadge show={isRemote} />
            <Button variant="dark" onClick={save} loading={saving} disabled={!guildId || !dirty}>
              <Save size={14} /> Guardar
            </Button>
            <Button onClick={() => void act({ kind: 'sync' })} loading={busy === 'sync'} disabled={!guildId || !state?.googleEmail || !draft.spreadsheetId}>
              <RefreshCw size={14} /> Sincronizar agora
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <GuildSelect guilds={ctx.guilds} value={guildId} onChange={ctx.setGuildId} />
        <Tabs
          tabs={[
            { id: 'setup', label: 'Planilha' },
            { id: 'records', label: `Registo (${records.length})` },
          ]}
          value={tab}
          onChange={setTab}
        />
        {dirty && <span className="pb-2 text-xs text-warning">Alterações por guardar</span>}
      </div>
      {(error || ctx.error) && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">❌ {error || ctx.error}</p>}
      {note && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">✅ {note}</p>}
      {status?.lastSyncAt && (
        <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${status.lastSyncOk ? 'border-border bg-black/20 text-muted' : 'border-warning/40 bg-warning/10 text-warning'}`}>
          {status.lastSyncOk ? <CheckCircle2 size={14} className="text-success" /> : <XCircle size={14} />}
          <span>Último lote {formatRelativeDate(status.lastSyncAt)}: {status.lastSyncMessage}</span>
          {status.lastBackupAt && <span className="text-faint">· último backup {formatRelativeDate(status.lastBackupAt)}</span>}
        </div>
      )}

      {tab === 'setup' && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* ---- Google ---- */}
            <Card className="flex flex-col gap-4">
              <SectionTitle icon={KeyRound} title="Ligação ao Google" subtitle="Uma conta de serviço do Google escreve na planilha por ti (grátis). A chave fica guardada só no bot." />
              {state?.googleEmail ? (
                <div className="flex flex-col gap-2 rounded-lg border border-success/40 bg-success/10 p-3">
                  <p className="text-xs text-success">✅ Chave guardada. Partilha a planilha com este email como <b>Editor</b>:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-black/40 px-2 py-1.5 font-mono text-xs text-text">{state.googleEmail}</code>
                    <Button variant="dark" onClick={() => void navigator.clipboard.writeText(state.googleEmail ?? '')}>
                      <Copy size={13} /> Copiar
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => keyInput.current?.click()} loading={busy === 'key'}>
                      <Upload size={13} /> Trocar chave
                    </Button>
                    <Button variant="ghost" onClick={() => void removeKey()}>
                      <Trash2 size={13} /> Remover
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-black/20 p-3 text-xs text-muted">
                  <p className="font-semibold text-text">Como criar (uma vez só, ~5 minutos):</p>
                  <ol className="ml-4 list-decimal space-y-1">
                    <li>
                      Abre <span className="text-text">console.cloud.google.com</span> com a conta dona da planilha e cria um projeto (ex.: "LisDiscord").
                    </li>
                    <li>
                      Em <span className="text-text">APIs e serviços → Biblioteca</span>, ativa a <span className="text-text">Google Sheets API</span>.
                    </li>
                    <li>
                      Em <span className="text-text">IAM → Contas de serviço</span>, cria uma conta → separador <span className="text-text">Chaves</span> → Adicionar chave → <span className="text-text">JSON</span>.
                    </li>
                    <li>Carrega aqui o ficheiro .json que foi descarregado.</li>
                  </ol>
                  <Button className="mt-1 self-start" onClick={() => keyInput.current?.click()} loading={busy === 'key'} disabled={!guildId}>
                    <Upload size={14} /> Carregar a chave (.json)
                  </Button>
                </div>
              )}
              <input ref={keyInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void uploadKey(e.target.files?.[0])} />
              <div>
                <Label>Link da planilha</Label>
                <div className="mt-1.5 flex gap-2">
                  <input value={draft.spreadsheetId} onChange={(e) => set('spreadsheetId', e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className={inputClass} />
                  <Button variant="dark" onClick={() => void act({ kind: 'test' })} loading={busy === 'test'} disabled={!state?.googleEmail || !draft.spreadsheetId}>
                    Testar
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-faint">
                  O bot só mexe nas abas dele (as outras ficam como estão). Partilha a planilha com os membros como <b>só leitura</b> — se alguém apagar ou mudar algo, o lote seguinte volta a pôr tudo certo a partir do registo.
                </p>
              </div>
            </Card>

            {/* ---- Lote ---- */}
            <Card className="flex flex-col gap-4">
              <SectionTitle icon={Database} title="Registo e lote" subtitle="O registo do bot é a fonte da verdade; a planilha é uma cópia atualizada de tempos a tempos." />
              <Toggle checked={draft.autoRegister} onChange={(v) => set('autoRegister', v)} label="Gravar no registo quem é verificado (botão Finalizar do ticket)" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Atualizar a planilha</Label>
                  <select value={draft.syncMinutes} onChange={(e) => set('syncMinutes', Number(e.target.value))} className={`mt-1.5 ${inputClass}`}>
                    {SYNC_OPTIONS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Fuso horário das datas</Label>
                  <select value={draft.timezone} onChange={(e) => set('timezone', e.target.value)} className={`mt-1.5 ${inputClass}`}>
                    {REPORT_TIMEZONES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Estado — quem está</Label>
                  <input value={draft.textActive} onChange={(e) => set('textActive', e.target.value)} maxLength={40} className={`mt-1.5 ${inputClass}`} />
                </div>
                <div>
                  <Label>Estado — quem saiu</Label>
                  <input value={draft.textLeft} onChange={(e) => set('textLeft', e.target.value)} maxLength={40} className={`mt-1.5 ${inputClass}`} />
                </div>
              </div>
              <Toggle checked={draft.includeLeft} onChange={(v) => set('includeLeft', v)} label="Manter na planilha quem saiu do servidor" />
              <div className="border-t border-border pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
                  <Archive size={14} className="text-accent" /> Backup automático
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Canal privado dos backups</Label>
                    <select value={draft.backupChannelId ?? ''} onChange={(e) => set('backupChannelId', e.target.value || null)} className={`mt-1.5 ${inputClass}`}>
                      <option value="">Sem backup automático</option>
                      {ctx.channels.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Frequência</Label>
                    <select value={draft.backupHours} onChange={(e) => set('backupHours', Number(e.target.value))} className={`mt-1.5 ${inputClass}`}>
                      {BACKUP_OPTIONS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-faint">O bot manda o registo inteiro (.json) para esse canal — fica uma cópia fora do bot que se restaura em dois cliques.</p>
              </div>
            </Card>
          </div>

          {/* ---- Abas ---- */}
          <Card className="flex flex-col gap-4">
            <SectionTitle
              icon={Layers}
              title="Abas por cargo"
              subtitle="Uma aba por cargo, pela ordem da lista (a de cima manda): é assim que o membro verificado vai parar à aba certa de acordo com os cargos."
              action={
                <Button
                  variant="dark"
                  disabled={unusedRoles.length === 0}
                  onClick={() => {
                    const r = unusedRoles[0]
                    set('sections', [...draft.sections, { id: `sec${Date.now().toString(36)}`, roleId: r.id, tabName: r.name }])
                  }}
                >
                  <Plus size={14} /> Aba de cargo
                </Button>
              }
            />
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-black/20 px-3 py-2">
                <Toggle checked={draft.allTab.enabled} onChange={(enabled) => set('allTab', { ...draft.allTab, enabled })} />
                <span className="text-sm text-muted">Aba com toda a gente:</span>
                <input value={draft.allTab.name} onChange={(e) => set('allTab', { ...draft.allTab, name: e.target.value })} maxLength={90} className={`py-1.5 ${narrowInput}`} />
              </div>
              {draft.sections.map((sec, i) => (
                <div key={sec.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-black/20 px-3 py-2">
                  <span className="w-6 text-center font-mono text-xs text-faint">{i + 1}</span>
                  <select
                    value={sec.roleId}
                    onChange={(e) => set('sections', draft.sections.map((x) => (x.id === sec.id ? { ...x, roleId: e.target.value, tabName: x.tabName === roleName.get(x.roleId) ? (roleName.get(e.target.value) ?? x.tabName) : x.tabName } : x)))}
                    className={`py-1.5 ${narrowInput}`}
                  >
                    {roles
                      .filter((r) => r.id === sec.roleId || !draft.sections.some((s) => s.roleId === r.id))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          @{r.name}
                        </option>
                      ))}
                  </select>
                  <span className="text-xs text-faint">→ aba</span>
                  <input value={sec.tabName} onChange={(e) => set('sections', draft.sections.map((x) => (x.id === sec.id ? { ...x, tabName: e.target.value } : x)))} maxLength={90} className={`py-1.5 ${narrowInput}`} />
                  <div className="ml-auto flex">
                    <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0} className="rounded p-1 text-faint hover:text-text disabled:opacity-30">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" onClick={() => moveSection(i, 1)} disabled={i === draft.sections.length - 1} className="rounded p-1 text-faint hover:text-text disabled:opacity-30">
                      <ArrowDown size={14} />
                    </button>
                    <button type="button" onClick={() => set('sections', draft.sections.filter((x) => x.id !== sec.id))} className="rounded p-1 text-faint hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-black/20 px-3 py-2">
                <Toggle checked={draft.otherTab.enabled} onChange={(enabled) => set('otherTab', { ...draft.otherTab, enabled })} />
                <span className="text-sm text-muted">Aba para quem não tem nenhum destes cargos:</span>
                <input value={draft.otherTab.name} onChange={(e) => set('otherTab', { ...draft.otherTab, name: e.target.value })} maxLength={90} className={`py-1.5 ${narrowInput}`} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Quem tem vários destes cargos</Label>
                <select value={draft.placement} onChange={(e) => set('placement', e.target.value as MemberSheetSettings['placement'])} className={`mt-1.5 ${inputClass}`}>
                  <option value="first">Aparece só na aba do cargo mais acima da lista</option>
                  <option value="all">Aparece em todas as abas dos cargos que tem</option>
                </select>
              </div>
              <div>
                <Label>Ordenar por</Label>
                <select value={draft.sortBy} onChange={(e) => set('sortBy', e.target.value as MemberSheetSettings['sortBy'])} className={`mt-1.5 ${inputClass}`}>
                  <option value="nome">Nome (A → Z)</option>
                  <option value="verificadoEm">Verificados mais recentes primeiro</option>
                  <option value="pontos">Mais pontos MOV primeiro</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Cargos que aparecem na coluna "Cargos" (vazio = todos)</Label>
              <div className="mt-1.5">
                <RolePills roles={roles} value={draft.trackedRoleIds} onChange={(v) => set('trackedRoleIds', v)} />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            {/* ---- Colunas ---- */}
            <Card className="flex flex-col gap-2 self-start">
              <SectionTitle icon={Columns3} title="Colunas" subtitle="Liga, renomeia e ordena." />
              {draft.columns.map((c, i) => (
                <div key={c.key} className={`flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 ${c.show ? 'bg-black/20' : 'opacity-50'}`}>
                  <Toggle checked={c.show} onChange={(show) => set('columns', draft.columns.map((x) => (x.key === c.key ? { ...x, show } : x)))} />
                  <input value={c.header} onChange={(e) => set('columns', draft.columns.map((x) => (x.key === c.key ? { ...x, header: e.target.value } : x)))} placeholder={SHEET_COLUMN_LABELS[c.key]} maxLength={60} className={`py-1 text-xs ${inputClass}`} />
                  <button type="button" onClick={() => moveColumn(i, -1)} disabled={i === 0} className="rounded p-0.5 text-faint hover:text-text disabled:opacity-30">
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" onClick={() => moveColumn(i, 1)} disabled={i === draft.columns.length - 1} className="rounded p-0.5 text-faint hover:text-text disabled:opacity-30">
                    <ArrowDown size={13} />
                  </button>
                </div>
              ))}
            </Card>

            {/* ---- Pré-visualização ---- */}
            <Card className="flex min-w-0 flex-col gap-3">
              <SectionTitle icon={FileSpreadsheet} title="Pré-visualização da planilha" subtitle="Com os membros que já estão no registo." />
              <div className="flex flex-wrap gap-1">
                {tabs.map((t, i) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setPreviewTab(i)}
                    className={`rounded-t-md border-b-2 px-3 py-1 text-xs font-semibold ${i === Math.min(previewTab, tabs.length - 1) ? 'border-accent bg-accent-soft text-text' : 'border-transparent text-faint hover:text-muted'}`}
                  >
                    {t.name} <span className="text-faint">({t.rows.length - 1})</span>
                  </button>
                ))}
              </div>
              {shown ? (
                <div className="max-h-96 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-raised">
                      <tr>
                        {shown.rows[0].map((h, i) => (
                          <th key={i} className="border-b border-border px-3 py-2 font-bold whitespace-nowrap text-text">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.rows.slice(1).map((row, r) => (
                        <tr key={r} className="odd:bg-white/[0.02]">
                          {row.map((v, i) => (
                            <td key={i} className="border-b border-border/50 px-3 py-1.5 whitespace-nowrap text-muted">
                              {String(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {shown.rows.length === 1 && (
                        <tr>
                          <td colSpan={shown.rows[0].length} className="px-3 py-4 text-center text-faint">
                            Ninguém nesta aba ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-faint">Liga a aba "Todos" ou adiciona uma aba de cargo.</p>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === 'records' && (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <SectionTitle
              icon={Users}
              title="Membros no registo"
              subtitle="Só o bot escreve aqui. Os cargos guardados servem para os repor se o servidor for bagunçado."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button variant="dark" onClick={() => setAddOpen(true)} disabled={!guildId}>
                    <UserPlus size={14} /> Adicionar
                  </Button>
                  <Button variant="dark" onClick={() => setImportOpen(true)} disabled={!guildId}>
                    <Download size={14} /> Importar membros atuais
                  </Button>
                  <Button
                    variant="dark"
                    disabled={records.length === 0}
                    onClick={() => setConfirm({ title: 'Repor os cargos de todos?', text: 'Cada membro que está no servidor volta a receber os cargos guardados no registo que já não tem (só os que o bot consegue dar). Não tira cargo nenhum.', action: { kind: 'restoreRoles', userId: null } })}
                  >
                    <RotateCcw size={14} /> Repor cargos de todos
                  </Button>
                </div>
              }
            />
            <div className="relative max-w-sm">
              <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Procurar no registo…" className={`pl-9 ${inputClass}`} />
            </div>
            <div className="overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-raised">
                  <tr className="text-faint">
                    <th className="px-3 py-2">Membro</th>
                    <th className="px-3 py-2">Cargo principal</th>
                    <th className="px-3 py-2">Cargos guardados</th>
                    <th className="px-3 py-2">Verificado</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-faint">
                        {records.length === 0 ? 'Ainda ninguém — quem for verificado aparece aqui. Também podes importar os membros atuais.' : 'Nada encontrado.'}
                      </td>
                    </tr>
                  )}
                  {visibleRecords.map((r: MemberRecord) => {
                    const main = mainSection(draft, r)
                    return (
                      <tr key={r.userId} className="border-t border-border/60">
                        <td className="px-3 py-2">
                          <p className="font-semibold text-text">{r.displayName}</p>
                          <p className="font-mono text-[10px] text-faint">
                            {r.tag} · {r.userId}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-text">{main ? (roleName.get(main.roleId) ?? '—') : '—'}</td>
                        <td className="max-w-xs px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {r.roleIds.slice(0, 6).map((id, i) => (
                              <span key={id} className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-muted">
                                {roleName.get(id) ?? r.roleNames[i] ?? id}
                              </span>
                            ))}
                            {r.roleIds.length > 6 && <span className="text-[10px] text-faint">+{r.roleIds.length - 6}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {r.verifiedAt ? formatDateTime(r.verifiedAt) : <span className="text-faint">{r.source === 'importado' ? 'importado' : 'manual'}</span>}
                          {r.verifiedByTag && <p className="text-[10px] text-faint">por {r.verifiedByTag}</p>}
                        </td>
                        <td className="px-3 py-2">{r.inServer ? <Badge tone="success">{draft.textActive}</Badge> : <Badge tone="warning">{draft.textLeft}</Badge>}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            title="Repor cargos"
                            disabled={!r.inServer}
                            onClick={() => void act({ kind: 'restoreRoles', userId: r.userId }, `restore:${r.userId}`)}
                            className="rounded p-1.5 text-faint hover:bg-white/5 hover:text-accent disabled:opacity-30"
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            type="button"
                            title="Tirar do registo"
                            onClick={() => setConfirm({ title: `Tirar ${r.displayName} do registo?`, text: 'Sai da planilha no próximo lote. Os cargos no Discord não mudam.', action: { kind: 'remove', userId: r.userId } })}
                            className="rounded p-1.5 text-faint hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <SectionTitle icon={Archive} title="Backup" subtitle="Uma cópia do registo fora do bot, para ninguém conseguir apagar tudo sozinho." />
            <div className="flex flex-wrap gap-2">
              <Button variant="dark" onClick={() => void act({ kind: 'backupNow' })} loading={busy === 'backupNow'} disabled={!state?.settings.backupChannelId}>
                <Archive size={14} /> Enviar backup para o canal agora
              </Button>
              <Button variant="dark" onClick={() => void act({ kind: 'export' })} loading={busy === 'export'}>
                <Download size={14} /> Descarregar cópia (.json)
              </Button>
              <Button variant="dark" onClick={() => backupInput.current?.click()} loading={busy === 'import'}>
                <Upload size={14} /> Restaurar de um ficheiro
              </Button>
              <input ref={backupInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void restoreFile(e.target.files?.[0])} />
            </div>
            {!state?.settings.backupChannelId && <p className="text-[11px] text-faint">Escolhe o canal dos backups no separador Planilha (e guarda) para o envio automático.</p>}
            <p className="text-[11px] text-faint">Restaurar junta o que está no ficheiro ao registo atual (não apaga quem entrou depois). Depois podes usar "Repor cargos de todos".</p>
          </Card>
        </div>
      )}

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importar membros atuais">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Põe no registo quem já está no servidor (útil para começar). Escolhe os cargos — vazio = toda a gente (sem bots).</p>
          <RolePills roles={roles} value={importRoles} onChange={setImportRoles} />
          <div className="flex justify-end gap-2">
            <Button variant="dark" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={busy === 'importMembers'}
              onClick={async () => {
                if (await act({ kind: 'importMembers', roleIds: importRoles })) setImportOpen(false)
              }}
            >
              <Download size={14} /> Importar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Adicionar ao registo">
        <div className="flex flex-col gap-3">
          <input autoFocus value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder="Nome ou ID do membro…" className={inputClass} />
          <div className="flex flex-col gap-1.5">
            {addResults.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={async () => {
                  if (await act({ kind: 'register', userId: m.id }, `reg:${m.id}`)) setAddOpen(false)
                }}
                className="flex items-center justify-between rounded-lg border border-border bg-black/20 px-3 py-2 text-left text-sm text-text hover:border-accent"
              >
                {m.tag}
                <UserPlus size={14} className="text-faint" />
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) void act(confirm.action)
        }}
        title={confirm?.title ?? ''}
        description={confirm?.text ?? ''}
        confirmLabel="Confirmar"
        danger={confirm?.action.kind === 'remove'}
      />
    </div>
  )
}
