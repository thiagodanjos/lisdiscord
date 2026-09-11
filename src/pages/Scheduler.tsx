import { useEffect, useState } from 'react'
import { Clock3, Plus, Trash2 } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { FREQUENCY_LABEL, formatRelativeDate } from '../lib/format'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, SectionHeading, Toggle } from '../components/ui'
import type { GuildSummary, ScheduleConfig, ScheduleFrequency } from '../../shared/types'

const FREQUENCIES: ScheduleFrequency[] = ['hourly6', 'hourly12', 'daily', 'daily3', 'weekly']

export default function Scheduler() {
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([])
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [toDelete, setToDelete] = useState<ScheduleConfig | null>(null)

  const [guildId, setGuildId] = useState('')
  const [frequency, setFrequency] = useState<ScheduleFrequency>('daily')
  const [includeBans, setIncludeBans] = useState(false)

  useEffect(() => {
    load()
  }, [])

  function load() {
    Promise.all([bridge.listSchedules(), bridge.listGuilds()]).then(([s, g]) => {
      setSchedules(s)
      setGuilds(g)
      setGuildId((prev) => prev || g[0]?.id || '')
      setLoading(false)
    })
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!guildId) return
    await bridge.createSchedule(guildId, frequency, includeBans)
    setCreating(false)
    load()
  }

  async function toggleEnabled(schedule: ScheduleConfig) {
    await bridge.updateSchedule(schedule.id, { enabled: !schedule.enabled })
    load()
  }

  async function confirmDelete() {
    if (!toDelete) return
    await bridge.deleteSchedule(toDelete.id)
    load()
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Agendamentos"
        subtitle="Backups automáticos, criados sozinhos enquanto a app estiver aberta"
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus size={14} />
            Novo agendamento
          </Button>
        }
      />

      {!loading && schedules.length === 0 && (
        <EmptyState title="Sem agendamentos" description="Cria um para nunca mais teres de lembrar de fazer backup manual." />
      )}

      <div className="flex flex-col gap-2">
        {schedules.map((s) => (
          <Card key={s.id} className="flex items-center gap-3 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Clock3 size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">{s.guildName}</p>
              <p className="text-xs text-muted">
                {FREQUENCY_LABEL[s.frequency]}
                {s.includeBans && ' · com banidos'}
                {s.nextRunAt && s.enabled && ` · próximo ${formatRelativeDate(s.nextRunAt)}`}
              </p>
            </div>
            {!s.enabled && <Badge tone="warning">Pausado</Badge>}
            <Toggle checked={s.enabled} onChange={() => toggleEnabled(s)} />
            <button onClick={() => setToDelete(s)} className="shrink-0 text-faint hover:text-danger">
              <Trash2 size={15} />
            </button>
          </Card>
        ))}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Novo agendamento">
        <form onSubmit={submitCreate} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Servidor</label>
            <select
              value={guildId}
              onChange={(e) => setGuildId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Frequência</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {FREQUENCIES.map((f) => (
                <button
                  type="button"
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    frequency === f ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-raised text-muted hover:text-text'
                  }`}
                >
                  {FREQUENCY_LABEL[f]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-raised px-3.5 py-3">
            <span className="text-sm text-text">Incluir lista de banidos</span>
            <Toggle checked={includeBans} onChange={setIncludeBans} />
          </div>

          <p className="text-xs text-faint">
            Os agendamentos só correm enquanto a LisDiscord estiver aberta — não há nenhum servidor externo a tratar
            disto por ti.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="dark" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!guildId}>
              Criar
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Apagar agendamento"
        description={`O servidor "${toDelete?.guildName}" deixa de ter backups automáticos. Os backups já feitos mantêm-se.`}
        confirmLabel="Apagar"
        danger
      />
    </div>
  )
}
