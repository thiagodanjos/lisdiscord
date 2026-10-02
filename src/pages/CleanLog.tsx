import { useEffect, useMemo, useState } from 'react'
import { Clock3, Eraser, Hash, Radio, Search, ShieldAlert, Trash2 } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatDateTime, formatRelativeDate } from '../lib/format'
import { Avatar, Badge, Card, EmptyState, PageHeader, StatCard } from '../components/ui'
import type { CleanLogEntry, GuildSummary, RemoteBotConfig } from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const POLL_INTERVAL_MS = 15_000

export default function CleanLog() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [log, setLog] = useState<CleanLogEntry[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const isRemote = Boolean(remoteConfig.url && remoteConfig.hasApiKey)

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemoteConfig)
  }, [])

  useEffect(() => {
    setLoadError('')
    const listGuilds = isRemote ? bridge.listRemoteGuilds : bridge.listGuilds
    listGuilds()
      .then((g) => {
        setGuilds(g)
        setGuildId(g[0]?.id ?? '')
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Não consegui carregar os servidores.'))
  }, [isRemote])

  useEffect(() => {
    if (!guildId) return
    const load = () => {
      const listLog = isRemote ? bridge.listRemoteCleanLog : bridge.listCleanLog
      listLog(guildId)
        .then((entries) => {
          setLog(entries)
          setLoadError('')
        })
        .catch((err) => setLoadError(err instanceof Error ? err.message : 'Não consegui carregar os logs.'))
        .finally(() => setLoading(false))
    }
    setLoading(true)
    load()
    const id = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [guildId, isRemote])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return log
    return log.filter((e) => [e.actorTag, e.channelName, e.targetTag ?? ''].some((v) => v.toLowerCase().includes(q)))
  }, [log, filter])

  const totalDeleted = log.reduce((sum, e) => sum + e.deleted, 0)
  const totalOld = log.reduce((sum, e) => sum + e.skippedOld, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Logs de limpeza"
        subtitle="Cada /limparcdo usado no Discord — quem limpou, onde, quantas mensagens e quando"
        action={
          isRemote ? (
            <Badge tone="cyan">
              <Radio size={11} /> A usar o bot remoto
            </Badge>
          ) : undefined
        }
      />

      <div>
        <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Servidor</label>
        <select
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          className="mt-1.5 block w-full max-w-xs rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        >
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {loadError && <p className="mt-1.5 text-xs text-danger">❌ {loadError}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Limpezas" value={log.length} icon={Eraser} tone="green" />
        <StatCard label="Mensagens apagadas" value={totalDeleted.toLocaleString('pt-PT')} icon={Trash2} tone="pink" />
        <StatCard label="Antigas (+14 dias)" value={totalOld} hint="não dá para apagar em massa" icon={Clock3} tone="amber" />
        <StatCard
          label="Última limpeza"
          value={<span className="text-lg">{log[0] ? formatRelativeDate(log[0].date) : '—'}</span>}
          hint={log[0] ? `por ${log[0].actorTag}` : undefined}
          icon={ShieldAlert}
          tone="violet"
        />
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-sm font-black tracking-wide uppercase">Histórico de limpezas</h3>
            <p className="text-[11px] text-faint">{log.length} registos</p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar por admin, canal ou membro…"
              className="w-full rounded-lg border border-border bg-black/30 py-2 pr-3 pl-8 text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {!loading && visible.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={log.length === 0 ? 'Ainda sem limpezas' : 'Nada corresponde ao filtro'}
              description={log.length === 0 ? 'Usa /limparcdo num canal do Discord (só administração) e aparece aqui.' : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold tracking-[0.14em] text-faint uppercase">
                  <th className="px-5 py-3">Administrador</th>
                  <th className="px-5 py-3">Canal</th>
                  <th className="px-5 py-3">Apagadas</th>
                  <th className="px-5 py-3">Filtro</th>
                  <th className="px-5 py-3 text-right">Quando</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id} className="border-t border-border/70 transition-colors hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.actorTag} color="#1ed760" size="sm" />
                        <span className="font-semibold text-text">{e.actorTag}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-black/20 px-2 py-0.5 font-mono text-xs text-muted">
                        <Hash size={11} />
                        {e.channelName}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono font-bold text-accent">{e.deleted}</span>
                      <span className="font-mono text-xs text-faint"> / {e.requested}</span>
                      {e.skippedOld > 0 && (
                        <span className="ml-2">
                          <Badge tone="warning">{e.skippedOld} antigas</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">{e.targetTag ? <Badge tone="violet">só @{e.targetTag}</Badge> : <span className="text-xs text-faint">todas</span>}</td>
                    <td className="px-5 py-3 text-right text-xs text-muted" title={formatDateTime(e.date)}>
                      {formatRelativeDate(e.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="flex items-start gap-3 text-xs text-muted">
        <Eraser size={16} className="mt-0.5 shrink-0 text-accent" />
        <p>
          <span className="font-semibold text-text">/limparcdo quantidade: [membro:] [canal:]</span> — apaga até 1000 mensagens (acima de 100 pede
          confirmação). Só aparece e só funciona para quem tem permissão de <span className="font-semibold text-text">Administrador</span>. Mensagens
          fixadas não são apagadas, e a Discord não deixa apagar em massa mensagens com mais de 14 dias.
        </p>
      </Card>
    </div>
  )
}
