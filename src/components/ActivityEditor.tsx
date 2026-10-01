import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Save, Search } from 'lucide-react'
import { Button, Modal, Toggle } from './ui'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { findConflicts, shortDate, zonedParts, zonedToUtc } from '../../shared/calendar'
import type { Activity, ActivityInput, CalendarSettings, CalendarState, ChannelPickerEntry, MemberSearchResult } from '../../shared/types'

const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'
const DURATIONS = [30, 45, 60, 90, 120, 180, 240]

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{children}</label>
}

export function ActivityEditor({
  open,
  onClose,
  initial,
  initialResponsibleTag,
  settings,
  activities,
  channels,
  guildId,
  isRemote,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initial: ActivityInput
  initialResponsibleTag: string | null
  settings: CalendarSettings
  activities: Activity[]
  channels: ChannelPickerEntry[]
  guildId: string
  isRemote: boolean
  onSaved: (state: CalendarState) => void
}) {
  const [form, setForm] = useState<ActivityInput>(initial)
  const [responsibleTag, setResponsibleTag] = useState<string | null>(initialResponsibleTag)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<MemberSearchResult[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof ActivityInput>(key: K, value: ActivityInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
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

  // Conflitos calculados ao vivo, com as mesmas regras do bot.
  const conflicts = useMemo(() => {
    try {
      const startAt = zonedToUtc(form.date, form.time, settings.timezone).toISOString()
      return findConflicts(
        { id: form.id ?? '', startAt, durationMinutes: form.durationMinutes, responsibleId: form.responsibleId, locationChannelId: form.locationChannelId, locationText: form.locationText },
        activities,
        settings.conflictMode,
      )
    } catch {
      return []
    }
  }, [form, activities, settings])

  async function save() {
    setSaving(true)
    setError('')
    try {
      const fn = isRemote ? bridge.saveRemoteActivity : bridge.saveActivity
      onSaved(await fn(guildId, form))
      onClose()
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setSaving(false)
    }
  }

  const places = channels.filter((c) => c.kind === 'voice' || c.kind === 'stage' || c.kind === 'text')

  return (
    <Modal open={open} onClose={onClose} title={form.id ? 'Editar atividade' : 'Nova atividade'} width="lg">
      <div className="flex flex-col gap-4">
        <div>
          <Label>Nome</Label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={100} placeholder="Ex.: Mov Call da noite" className={`mt-1.5 ${inputClass}`} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2">
            <Label>Categoria</Label>
            <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={`mt-1.5 ${inputClass}`}>
              {settings.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Data</Label>
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={`mt-1.5 ${inputClass}`} />
          </div>
          <div>
            <Label>Hora</Label>
            <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} className={`mt-1.5 ${inputClass}`} />
          </div>
        </div>
        <div>
          <Label>Duração</Label>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => set('durationMinutes', d)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${form.durationMinutes === d ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:text-text'}`}
              >
                {d < 60 ? `${d} min` : `${d / 60}h`}
              </button>
            ))}
            <input
              type="number"
              min={5}
              max={1440}
              value={form.durationMinutes}
              onChange={(e) => set('durationMinutes', Number(e.target.value))}
              className="w-24 rounded-lg border border-border bg-black/30 px-2 py-1 text-xs text-text"
            />
            <span className="text-[11px] text-faint">min</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="relative">
            <Label>Responsável</Label>
            <div className="relative mt-1.5">
              <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={responsibleTag ? `@${responsibleTag}` : 'Procurar membro…'} className={`pl-8 ${inputClass}`} />
            </div>
            {results.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-raised shadow-xl">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      set('responsibleId', r.id)
                      setResponsibleTag(r.tag)
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
            <p className="mt-1 text-[11px] text-faint">
              {form.responsibleId ? (
                <>
                  Atual: <span className="text-muted">@{responsibleTag ?? form.responsibleId}</span> ·{' '}
                  <button
                    type="button"
                    className="text-danger hover:underline"
                    onClick={() => {
                      set('responsibleId', null)
                      setResponsibleTag(null)
                    }}
                  >
                    tirar
                  </button>
                </>
              ) : (
                'Sem responsável.'
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vagas participantes</Label>
              <input type="number" min={0} max={500} value={form.participantSlots} onChange={(e) => set('participantSlots', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
            </div>
            <div>
              <Label>Vagas organizadores</Label>
              <input type="number" min={0} max={100} value={form.organizerSlots} onChange={(e) => set('organizerSlots', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
            </div>
            <p className="col-span-2 -mt-1 text-[11px] text-faint">0 = sem limite.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Local (canal)</Label>
            <select value={form.locationChannelId ?? ''} onChange={(e) => set('locationChannelId', e.target.value || null)} className={`mt-1.5 ${inputClass}`}>
              <option value="">—</option>
              {places.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kind === 'text' ? '#' : '🔊 '}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Local (texto)</Label>
            <input value={form.locationText} onChange={(e) => set('locationText', e.target.value)} maxLength={100} placeholder="Ex.: Call principal" className={`mt-1.5 ${inputClass}`} />
          </div>
        </div>
        <div>
          <Label>Descrição</Label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={1000} className={`mt-1.5 ${inputClass}`} />
        </div>

        {conflicts.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-warning">
              <AlertTriangle size={14} /> Conflito de horário
            </p>
            {conflicts.map((c) => {
              const p = zonedParts(c.startAt, settings.timezone)
              return (
                <p key={c.id} className="text-muted">
                  #{c.number} {c.title} — {shortDate(p.date)} às {p.time} ({c.durationMinutes} min)
                </p>
              )
            })}
            <Toggle checked={Boolean(form.force)} onChange={(v) => set('force', v)} label="Gravar mesmo assim" />
          </div>
        )}
        {error && <p className="text-xs text-danger">❌ {error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="dark" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!form.title.trim() || !form.date || !form.time || (conflicts.length > 0 && !form.force)}>
            <Save size={14} /> {form.id ? 'Guardar alterações' : 'Criar atividade'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
