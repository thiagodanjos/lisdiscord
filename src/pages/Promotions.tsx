import { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, Medal, Search, XCircle } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatDuration } from '../lib/format'
import { Avatar, Badge, Card, EmptyState, SectionHeading } from '../components/ui'
import type { GuildSummary, MemberProfile, MemberSearchResult, RoleGoal } from '../../shared/types'

export default function Promotions() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [goals, setGoals] = useState<RoleGoal[]>([])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MemberSearchResult[]>([])
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [selectedRoleId, setSelectedRoleId] = useState('')

  useEffect(() => {
    bridge.listGuilds().then((g) => {
      setGuilds(g)
      setGuildId(g[0]?.id ?? '')
    })
  }, [])

  useEffect(() => {
    if (!guildId) return
    bridge.listRoleGoals(guildId).then(setGoals)
    setProfile(null)
    setSelectedRoleId('')
    setQuery('')
    setResults([])
  }, [guildId])

  useEffect(() => {
    if (!guildId || !query.trim()) {
      setResults([])
      return
    }
    const timeout = setTimeout(() => {
      bridge.searchMembers(guildId, query).then((r) => setResults(r.filter((m) => !m.isBot)))
    }, 300)
    return () => clearTimeout(timeout)
  }, [guildId, query])

  async function pick(member: MemberSearchResult) {
    setQuery('')
    setResults([])
    setLoadingProfile(true)
    const p = await bridge.getMemberProfile(guildId, member.id)
    setProfile(p)
    setSelectedRoleId(p.roles[0]?.id ?? '')
    setLoadingProfile(false)
  }

  const selectedGoal = goals.find((g) => g.roleId === selectedRoleId) ?? null
  const meetsPoints = selectedGoal && profile ? profile.points >= selectedGoal.pointsGoal : null
  const meetsHours = selectedGoal && profile ? profile.totalSeconds >= selectedGoal.hoursGoal * 3600 : null
  const passes = meetsPoints !== null && meetsHours !== null ? meetsPoints && meetsHours : null

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Upamentos" subtitle="Escolhe um membro e um dos cargos dele para veres se já cumpre a meta de pontos e horas" />

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

      <div className="min-w-[16rem] max-w-md">
        <div className="relative">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar membro…"
            className="w-full rounded-full border border-border bg-card py-2 pr-3 pl-9 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>
        {results.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {results.map((m) => (
              <button
                key={m.id}
                onClick={() => pick(m)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-border-strong"
              >
                <Avatar name={m.tag} color="#F0B232" size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{m.tag}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {!profile && !loadingProfile && (
        <EmptyState title="Nenhum membro selecionado" description="Pesquisa e escolhe um membro para veres os cargos, pontos e horas de Mov. Call dele." />
      )}

      {profile && (
        <Card className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Avatar name={profile.tag} color="#F0B232" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">{profile.tag}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {profile.roles.length === 0 ? (
                  <span className="text-xs text-faint">Sem cargos</span>
                ) : (
                  profile.roles.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-text"
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: r.color !== '#000000' ? r.color : '#99AAB5' }} />
                      {r.name}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-4 border-t border-border pt-4">
            <span className="flex items-center gap-1.5 text-sm font-bold text-warning">
              <Medal size={14} /> {profile.points} pontos
            </span>
            <span className="flex items-center gap-1.5 text-sm text-muted">
              <Clock3 size={14} /> {formatDuration(profile.totalSeconds)}
            </span>
          </div>

          {profile.roles.length > 0 && (
            <div className="border-t border-border pt-4">
              <label className="text-xs font-semibold tracking-wide text-faint uppercase">Cargo a verificar</label>
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="mt-1.5 w-full max-w-xs rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              >
                {profile.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              <div className="mt-4">
                {!selectedGoal ? (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-4">
                    <span className="size-2.5 shrink-0 rounded-full bg-faint" />
                    <p className="text-sm text-muted">Sem meta configurada para este cargo — define uma em <strong>Metas</strong>.</p>
                  </div>
                ) : (
                  <div
                    className={`flex items-center gap-3 rounded-xl border p-4 ${
                      passes ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10'
                    }`}
                  >
                    <span className={`size-2.5 shrink-0 rounded-full ${passes ? 'bg-success' : 'bg-danger'}`} />
                    {passes ? <CheckCircle2 size={20} className="shrink-0 text-success" /> : <XCircle size={20} className="shrink-0 text-danger" />}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold ${passes ? 'text-success' : 'text-danger'}`}>
                        {passes ? 'Pode upar' : 'Ainda não pode upar'}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        <Badge tone={meetsPoints ? 'success' : 'danger'}>
                          {profile.points}/{selectedGoal.pointsGoal} pontos
                        </Badge>{' '}
                        <Badge tone={meetsHours ? 'success' : 'danger'}>
                          {formatDuration(profile.totalSeconds)}/{selectedGoal.hoursGoal}h
                        </Badge>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
