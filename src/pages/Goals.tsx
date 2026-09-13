import { useEffect, useState } from 'react'
import { Clock3, Medal, Plus, Target, Trash2 } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Button, Card, ConfirmDialog, EmptyState, Modal, SectionHeading } from '../components/ui'
import type { GuildSummary, RoleGoal, RolePickerEntry } from '../../shared/types'

export default function Goals() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [roles, setRoles] = useState<RolePickerEntry[]>([])
  const [goals, setGoals] = useState<RoleGoal[]>([])
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState(false)
  const [roleId, setRoleId] = useState('')
  const [pointsGoal, setPointsGoal] = useState(0)
  const [hoursGoal, setHoursGoal] = useState(0)
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<RoleGoal | null>(null)

  useEffect(() => {
    bridge.listGuilds().then((g) => {
      setGuilds(g)
      setGuildId(g[0]?.id ?? '')
    })
  }, [])

  useEffect(() => {
    if (!guildId) return
    setLoading(true)
    Promise.all([bridge.listRoles(guildId), bridge.listRoleGoals(guildId)]).then(([r, g]) => {
      setRoles(r)
      setGoals(g)
      setLoading(false)
    })
  }, [guildId])

  function reloadGoals() {
    bridge.listRoleGoals(guildId).then(setGoals)
  }

  function openNew() {
    const firstWithoutGoal = roles.find((r) => !goals.some((g) => g.roleId === r.id))
    setRoleId(firstWithoutGoal?.id ?? roles[0]?.id ?? '')
    setPointsGoal(0)
    setHoursGoal(0)
    setEditing(true)
  }

  function openEdit(goal: RoleGoal) {
    setRoleId(goal.roleId)
    setPointsGoal(goal.pointsGoal)
    setHoursGoal(goal.hoursGoal)
    setEditing(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!roleId) return
    const roleName = roles.find((r) => r.id === roleId)?.name ?? roleId
    setSaving(true)
    try {
      await bridge.setRoleGoal(guildId, roleId, roleName, pointsGoal, hoursGoal)
      setEditing(false)
      reloadGoals()
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    await bridge.removeRoleGoal(guildId, toDelete.roleId)
    reloadGoals()
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Metas"
        subtitle="Define quantos pontos e horas de Mov. Call cada cargo exige — usado pelos Upamentos e pelo /verificar"
        action={
          <Button onClick={openNew} disabled={roles.length === 0}>
            <Plus size={14} />
            Nova meta
          </Button>
        }
      />

      <div>
        <label className="text-xs font-semibold tracking-wide text-faint uppercase">Servidor</label>
        <select
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          className="mt-1.5 w-full max-w-xs rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        >
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {!loading && roles.length === 0 && (
        <EmptyState title="Sem cargos neste servidor" description="Cria cargos no Discord antes de configurar metas para eles." />
      )}

      {!loading && roles.length > 0 && goals.length === 0 && (
        <EmptyState
          title="Ainda sem metas configuradas"
          description="Cria uma meta para cada cargo que deva exigir pontos e horas mínimas de Mov. Call."
          action={
            <Button onClick={openNew}>
              <Plus size={14} />
              Nova meta
            </Button>
          }
        />
      )}

      {goals.length > 0 && (
        <div className="flex flex-col gap-2">
          {goals.map((goal) => {
            const role = roles.find((r) => r.id === goal.roleId)
            return (
              <Card key={goal.roleId} className="flex items-center gap-4 p-4">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: role?.color && role.color !== '#000000' ? role.color : '#99AAB5' }} />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{role?.name ?? goal.roleName}</p>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                  <Medal size={12} /> {goal.pointsGoal} pontos
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                  <Clock3 size={12} /> {goal.hoursGoal}h
                </span>
                <button onClick={() => openEdit(goal)} className="shrink-0 text-faint hover:text-accent">
                  <Target size={15} />
                </button>
                <button onClick={() => setToDelete(goal)} className="shrink-0 text-faint hover:text-danger">
                  <Trash2 size={15} />
                </button>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Meta de cargo">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Cargo</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold tracking-wide text-faint uppercase">Pontos mínimos</label>
              <input
                type="number"
                min={0}
                value={pointsGoal}
                onChange={(e) => setPointsGoal(Math.max(0, Number(e.target.value)))}
                className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wide text-faint uppercase">Horas mínimas</label>
              <input
                type="number"
                min={0}
                value={hoursGoal}
                onChange={(e) => setHoursGoal(Math.max(0, Number(e.target.value)))}
                className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <p className="text-xs text-faint">
            Um membro só aparece pronto para este cargo nos Upamentos (e no /verificar) quando tiver pelo menos estes pontos E estas
            horas de Mov. Call.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="dark" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving} disabled={!roleId}>
              Guardar meta
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Apagar meta"
        description={`Isto remove a meta configurada para "${toDelete?.roleName}". O cargo deixa de ser avaliado nos Upamentos.`}
        confirmLabel="Apagar"
        danger
      />
    </div>
  )
}
