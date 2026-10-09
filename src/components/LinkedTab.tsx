import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Palette, Sparkles, Trash2, Users, Wand2, X } from 'lucide-react'
import type { LinkedColumn, LinkedSource, LinkedTab, LinkedTabView, RolePickerEntry } from '../../shared/types'
import { colLetter, LINKED_SOURCE_LABELS, orderedOptions, suggestOptionRoles } from '../../shared/linkedSheet'
import { inputClass } from '../lib/styles'
import { Badge, Button, Toggle } from './ui'
import { Label, RolePills } from './form'

const small = inputClass.replace('w-full', '')

// ==========================================================================
// A aba tal como está na planilha (cores, negrito, células juntas) + quem está no servidor
// ==========================================================================

export function SheetGrid({ view, highlightRows }: { view: LinkedTabView; highlightRows?: Set<number> }) {
  const width = Math.max(1, ...view.rows.map((r) => r.length))
  // Células cobertas por uma junção não se desenham; a primeira leva colSpan/rowSpan.
  const { spans, covered } = useMemo(() => {
    const spans = new Map<string, { colSpan: number; rowSpan: number }>()
    const covered = new Set<string>()
    for (const m of view.merges) {
      spans.set(`${m.r0}:${m.c0}`, { colSpan: Math.min(m.c1, width) - m.c0, rowSpan: m.r1 - m.r0 })
      for (let r = m.r0; r < m.r1; r++) for (let c = m.c0; c < Math.min(m.c1, width); c++) if (r !== m.r0 || c !== m.c0) covered.add(`${r}:${c}`)
    }
    return { spans, covered }
  }, [view.merges, width])
  const inCount = Object.values(view.rowStatus).filter((s) => s === 'in').length
  const outCount = Object.values(view.rowStatus).filter((s) => s === 'out').length
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="default">{inCount + outCount} na aba</Badge>
        <Badge tone="success">✅ {inCount} no servidor</Badge>
        {outCount > 0 && <Badge tone="danger">❌ {outCount} fora do servidor</Badge>}
        <Badge tone={view.missing.length ? 'warning' : 'default'}>faltam {view.missing.length}</Badge>
        <a href={view.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-accent hover:underline">
          Abrir no Google Sheets <ExternalLink size={12} />
        </a>
      </div>
      <div className="max-h-[560px] overflow-auto rounded-lg border border-border bg-white/[0.02]">
        <table className="border-collapse text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-9 border border-border bg-raised px-1 text-faint" />
              {Array.from({ length: width }, (_, c) => (
                <th key={c} className="min-w-[90px] border border-border bg-raised px-2 py-1 font-mono font-normal text-faint">
                  {colLetter(c)}
                </th>
              ))}
              <th className="border border-border bg-raised px-2 py-1 font-normal whitespace-nowrap text-faint">No servidor</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row, r) => (
              <tr key={r} className={highlightRows?.has(r) ? 'outline outline-2 -outline-offset-2 outline-accent' : ''}>
                <td className="sticky left-0 z-[5] border border-border bg-raised px-1 text-center font-mono text-faint">{r + 1}</td>
                {Array.from({ length: width }, (_, c) => {
                  if (covered.has(`${r}:${c}`)) return null
                  const cell = row[c] ?? { v: '' }
                  const span = spans.get(`${r}:${c}`)
                  return (
                    <td
                      key={c}
                      colSpan={span?.colSpan}
                      rowSpan={span?.rowSpan}
                      className={`border border-black/30 px-2 py-0.5 whitespace-nowrap ${span ? 'text-center text-base' : ''}`}
                      style={{ background: cell.bg ?? '#ffffff', color: cell.fg ?? '#000000', fontWeight: cell.b ? 700 : 400 }}
                    >
                      {cell.v}
                    </td>
                  )
                })}
                <td className="border border-border px-2 text-center whitespace-nowrap">
                  {view.rowStatus[r] === 'in' ? <span className="text-success">✅</span> : view.rowStatus[r] === 'out' ? <span className="text-danger">❌ fora</span> : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ==========================================================================
// Editor da ligação
// ==========================================================================

const SOURCES = Object.keys(LINKED_SOURCE_LABELS) as LinkedSource[]

function ColorPick({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[10px] text-faint">{label}</span>
      <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent" />
      {value ? (
        <button type="button" onClick={() => onChange('')} title="Não mudar esta cor" className="rounded p-0.5 text-faint hover:text-text">
          <X size={12} />
        </button>
      ) : (
        <span className="text-[10px] text-faint">não muda</span>
      )}
    </span>
  )
}

function OptionRoles({ col, options, roles, onChange }: { col: LinkedColumn; options: string[]; roles: RolePickerEntry[]; onChange: (c: LinkedColumn) => void }) {
  const mapped = options.filter((o) => col.optionRoles[o]).length
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-black/20 p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          Cada opção da lista da planilha ↔ um cargo do Discord (<b className="text-text">{mapped}</b>/{options.length} ligadas). Quem tem vários fica com o cargo mais alto.
        </span>
        <Button
          variant="ghost"
          className="ml-auto px-2 py-1 text-xs"
          onClick={() => onChange({ ...col, optionRoles: { ...suggestOptionRoles(options.filter((o) => !col.optionRoles[o]), roles), ...col.optionRoles } })}
        >
          <Wand2 size={12} /> Sugerir pelos nomes
        </Button>
      </div>
      {options.length === 0 && <p className="text-xs text-warning">Esta coluna não tem lista na planilha — escreve as opções na planilha (Dados → Validação) e carrega em "Atualizar vista".</p>}
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {options.map((o) => (
          <div key={o} className="flex items-center gap-2">
            <span className="w-32 shrink-0 truncate rounded-full border border-border bg-white/[0.04] px-2 py-0.5 text-center text-xs text-text" title={o}>
              {o}
            </span>
            <select
              value={col.optionRoles[o] ?? ''}
              onChange={(e) => {
                const next = { ...col.optionRoles }
                if (e.target.value) next[o] = e.target.value
                else delete next[o]
                onChange({ ...col, optionRoles: next })
              }}
              className={`min-w-0 flex-1 py-1 text-xs ${small}`}
            >
              <option value="">— nenhum cargo —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  @{r.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Para quem não tem nenhum destes cargos (só linhas novas):</span>
        <select value={col.fallback} onChange={(e) => onChange({ ...col, fallback: e.target.value })} className={`py-1 text-xs ${small}`}>
          <option value="">(deixar vazio)</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ColumnRow({ col, tab, options, roles, onChange }: { col: LinkedColumn; tab: LinkedTab; options: Record<number, string[]>; roles: RolePickerEntry[]; onChange: (c: LinkedColumn) => void }) {
  const [open, setOpen] = useState(false)
  const opts = options[col.col] ?? Object.keys(col.optionRoles)
  const roleCols = tab.columns.filter((c) => c.source === 'role' && c.col !== col.col)
  const optionSelect = (value: string, set: (v: string) => void, empty: string) =>
    opts.length ? (
      <select value={value} onChange={(e) => set(e.target.value)} className={`py-1 text-xs ${small}`}>
        <option value="">{empty}</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    ) : (
      <input value={value} onChange={(e) => set(e.target.value)} placeholder={empty} maxLength={100} className={`w-36 py-1 text-xs ${small}`} />
    )
  const updateLabel = col.source === 'nextRole' || (col.source === 'date' && col.dateOf === 'roleChange') ? 'Atualizar nas linhas que já existem quando o cargo mudar' : 'Também nas linhas que já existem'
  return (
    <div className={`flex flex-col gap-2 rounded-lg border border-border px-3 py-2 ${col.source === 'keep' ? 'bg-black/10' : 'bg-black/25'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-7 rounded bg-white/[0.06] py-0.5 text-center font-mono text-xs text-faint">{colLetter(col.col)}</span>
        <span className="w-28 truncate text-sm font-semibold text-text" title={col.header}>
          {col.header}
        </span>
        <select value={col.source} onChange={(e) => onChange({ ...col, source: e.target.value as LinkedSource })} className={`py-1 text-xs ${small}`} disabled={col.col === tab.idCol}>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {LINKED_SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        {col.source === 'role' && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Opções ↔ cargos ({opts.filter((o) => col.optionRoles[o]).length}/{opts.length})
          </button>
        )}
        {col.source === 'nextRole' && (
          <>
            <span className="text-xs text-faint">a seguir a</span>
            <select value={col.fromCol ?? ''} onChange={(e) => onChange({ ...col, fromCol: e.target.value === '' ? null : Number(e.target.value) })} className={`py-1 text-xs ${small}`}>
              <option value="">—</option>
              {roleCols.map((c) => (
                <option key={c.col} value={c.col}>
                  {colLetter(c.col)} · {c.header}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-faint">(pela ordem {opts.length && orderedOptions(opts)[0] !== opts[0] ? 'do número' : 'da lista'})</span>
          </>
        )}
        {col.source === 'date' && (
          <>
            <select value={col.dateOf} onChange={(e) => onChange({ ...col, dateOf: e.target.value as LinkedColumn['dateOf'] })} className={`py-1 text-xs ${small}`}>
              <option value="roleChange">Último up (quando o cargo muda)</option>
              <option value="added">Dia em que entrou na aba</option>
              <option value="verified">Dia da verificação</option>
            </select>
            <input value={col.dateFormat} onChange={(e) => onChange({ ...col, dateFormat: e.target.value })} maxLength={30} className={`w-28 py-1 font-mono text-xs ${small}`} title="dd = dia, MM = mês, yy/yyyy = ano, HH:mm = hora" />
          </>
        )}
        {col.source === 'status' && (
          <>
            <span className="text-xs text-faint">no servidor</span>
            {optionSelect(col.activeValue, (activeValue) => onChange({ ...col, activeValue }), '(não escrever)')}
            <span className="text-xs text-faint">saiu</span>
            {optionSelect(col.leftValue, (leftValue) => onChange({ ...col, leftValue }), '(não escrever)')}
          </>
        )}
        {col.source === 'fixed' && optionSelect(col.fallback, (fallback) => onChange({ ...col, fallback }), 'texto')}
        {col.source === 'id' && <span className="text-xs text-faint">escrito como {tab.idFormat === 'mention' ? '<@ID>' : 'só o número'} · é por aqui que o bot reconhece cada pessoa</span>}
        {col.source === 'keep' && <span className="text-xs text-faint">o bot nunca escreve nesta coluna</span>}
        {!['keep', 'id', 'fixed'].includes(col.source) && (
          <span className="ml-auto">
            <Toggle checked={col.updateExisting} onChange={(updateExisting) => onChange({ ...col, updateExisting })} label={updateLabel} />
          </span>
        )}
      </div>
      {col.source === 'role' && open && <OptionRoles col={col} options={opts} roles={roles} onChange={onChange} />}
    </div>
  )
}

export function LinkedTabEditor({ tab, view, roles, onChange, onRemove }: { tab: LinkedTab; view: LinkedTabView | null; roles: RolePickerEntry[]; onChange: (t: LinkedTab) => void; onRemove: () => void }) {
  const options = view?.options ?? {}
  const setCol = (c: LinkedColumn) => onChange({ ...tab, columns: tab.columns.map((x) => (x.col === c.col ? c : x)) })
  const colorCol = tab.columns.find((c) => c.col === tab.colors.col)
  const colorValues = tab.colors.col !== null ? (options[tab.colors.col] ?? tab.colors.rules.map((r) => r.value)) : []
  const rules = colorValues.map((value) => tab.colors.rules.find((r) => r.value === value) ?? { value, bg: '', fg: '' })
  const setRule = (value: string, patch: Partial<{ bg: string; fg: string }>) =>
    onChange({ ...tab, colors: { ...tab.colors, rules: rules.map((r) => (r.value === value ? { ...r, ...patch } : r)) } })
  const headerCols = tab.columns
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Toggle checked={tab.enabled} onChange={(enabled) => onChange({ ...tab, enabled })} label="Ligada (entra no lote automático)" />
        <span className="text-xs text-faint">Cabeçalhos na linha</span>
        <input type="number" min={1} max={50} value={tab.headerRow} onChange={(e) => onChange({ ...tab, headerRow: Math.max(1, Number(e.target.value) || 1) })} className={`w-16 py-1 text-xs ${small}`} />
        <span className="text-xs text-faint">ID na coluna</span>
        <select
          value={tab.idCol}
          onChange={(e) => {
            const idCol = Number(e.target.value)
            onChange({ ...tab, idCol, columns: tab.columns.map((c) => (c.col === idCol ? { ...c, source: 'id' } : c.source === 'id' ? { ...c, source: 'keep' } : c)) })
          }}
          className={`py-1 text-xs ${small}`}
        >
          {headerCols.map((c) => (
            <option key={c.col} value={c.col}>
              {colLetter(c.col)} · {c.header}
            </option>
          ))}
        </select>
        <select value={tab.idFormat} onChange={(e) => onChange({ ...tab, idFormat: e.target.value as LinkedTab['idFormat'] })} className={`py-1 text-xs ${small}`}>
          <option value="mention">escrito como &lt;@ID&gt;</option>
          <option value="plain">só o número</option>
        </select>
        <Button variant="ghost" className="ml-auto px-2 py-1 text-xs text-danger" onClick={onRemove}>
          <Trash2 size={12} /> Desligar esta aba
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>O que vai em cada coluna</Label>
        {tab.columns.map((c) => (
          <ColumnRow key={c.col} col={c} tab={tab} options={options} roles={roles} onChange={setCol} />
        ))}
        <p className="text-[11px] text-faint">
          Por omissão o bot só preenche as <b>linhas novas</b> e não mexe em nada do que já lá está. Liga "Também nas linhas que já existem" só nas colunas que queres que ele mantenha atualizadas (ex.: Cargo quando alguém sobe).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>
            <Users size={12} className="mr-1 inline" />
            Quem entra nesta aba
          </Label>
          <RolePills roles={roles} value={tab.roleIds} onChange={(roleIds) => onChange({ ...tab, roleIds })} />
          <p className="text-[11px] text-faint">Vazio = quem tem algum dos cargos ligados nas colunas de cargo. Bots nunca entram.</p>
          <Toggle checked={tab.autoAdd} onChange={(autoAdd) => onChange({ ...tab, autoAdd })} label="Acrescentar sozinho quem for verificado (no lote automático)" />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Toggle checked={tab.colors.enabled} onChange={(enabled) => onChange({ ...tab, colors: { ...tab.colors, enabled } })} label="Pintar as linhas pela coluna" />
            <select value={tab.colors.col ?? ''} onChange={(e) => onChange({ ...tab, colors: { ...tab.colors, col: e.target.value === '' ? null : Number(e.target.value), rules: [] } })} className={`py-1 text-xs ${small}`}>
              <option value="">—</option>
              {headerCols.map((c) => (
                <option key={c.col} value={c.col}>
                  {colLetter(c.col)} · {c.header}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
            <Palette size={12} /> da coluna
            <select value={tab.colors.fromCol} onChange={(e) => onChange({ ...tab, colors: { ...tab.colors, fromCol: Number(e.target.value) } })} className={`py-1 text-xs ${small}`}>
              {headerCols.map((c) => (
                <option key={c.col} value={c.col}>
                  {colLetter(c.col)}
                </option>
              ))}
            </select>
            à
            <select value={tab.colors.toCol} onChange={(e) => onChange({ ...tab, colors: { ...tab.colors, toCol: Number(e.target.value) } })} className={`py-1 text-xs ${small}`}>
              {headerCols.map((c) => (
                <option key={c.col} value={c.col}>
                  {colLetter(c.col)}
                </option>
              ))}
            </select>
          </div>
          {colorCol &&
            rules.map((r) => (
              <div key={r.value} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-black/20 px-2 py-1.5">
                <span className="w-28 truncate rounded px-2 py-0.5 text-center text-xs font-semibold" style={{ background: r.bg || 'transparent', color: r.fg || undefined }} title={r.value}>
                  {r.value}
                </span>
                <ColorPick label="fundo" value={r.bg} onChange={(bg) => setRule(r.value, { bg })} />
                <ColorPick label="texto" value={r.fg} onChange={(fg) => setRule(r.value, { fg })} />
              </div>
            ))}
          {!colorCol && <p className="text-[11px] text-faint">Escolhe a coluna (ex.: Hierarquia) — cada valor ganha a sua cor de fundo e de texto.</p>}
          <p className="text-[11px] text-faint">
            <Sparkles size={11} className="mr-1 inline" />
            As cores começam com as que já estão na planilha. Só mudam as linhas com ID.
          </p>
        </div>
      </div>
    </div>
  )
}
