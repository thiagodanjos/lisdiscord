import { useEffect, useState } from 'react'
import { Clock3, Eye, EyeOff, Medal, Minus, Plus, Radio, RotateCcw, Search } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatDuration } from '../lib/format'
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, SectionHeading } from '../components/ui'
import type {
  ChannelPickerEntry,
  ExcludedMember,
  GuildSummary,
  MemberSearchResult,
  MovPointsBoardConfig,
  MovPointsEntry,
  RemoteBotConfig,
} from '../../shared/types'

const POLL_INTERVAL_MS = 8_000
const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }

export default function MovPoints() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [board, setBoard] = useState<MovPointsBoardConfig | null>(null)
  const [boardChannelId, setBoardChannelId] = useState('')
  const [leaderboard, setLeaderboard] = useState<MovPointsEntry[]>([])
  const [savingBoard, setSavingBoard] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MemberSearchResult[]>([])
  const [target, setTarget] = useState<MemberSearchResult | null>(null)
  const [amount, setAmount] = useState(10)
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const [busyHours, setBusyHours] = useState(false)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [excludedMembers, setExcludedMembers] = useState<ExcludedMember[]>([])
  const [togglingExclusion, setTogglingExclusion] = useState<string | null>(null)

  const isRemote = Boolean(remoteConfig.url && remoteConfig.hasApiKey)

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemoteConfig)
  }, [])

  useEffect(() => {
    const listGuilds = isRemote ? bridge.listRemoteGuilds : bridge.listGuilds
    listGuilds().then((g) => {
      setGuilds(g)
      setGuildId(g[0]?.id ?? '')
    })
  }, [isRemote])

  useEffect(() => {
    if (!guildId) return
    const listChannels = isRemote ? bridge.listRemoteChannels : bridge.listChannels
    const getBoard = isRemote ? bridge.getRemoteMovPointsBoard : bridge.getMovPointsBoard
    const listExcluded = isRemote ? bridge.listRemoteExcludedMembers : bridge.listExcludedMembers
    listChannels(guildId).then(setChannels)
    getBoard(guildId).then((b) => {
      setBoard(b)
      setBoardChannelId(b.channelId ?? '')
    })
    listExcluded(guildId).then(setExcludedMembers)
    loadLeaderboard()

    const interval = setInterval(loadLeaderboard, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  useEffect(() => {
    if (!guildId || !query.trim()) {
      setResults([])
      return
    }
    const searchMembers = isRemote ? bridge.searchRemoteMembers : bridge.searchMembers
    const timeout = setTimeout(() => {
      searchMembers(guildId, query).then(setResults)
    }, 300)
    return () => clearTimeout(timeout)
  }, [guildId, query, isRemote])

  function loadLeaderboard() {
    if (!guildId) return
    const listMovPoints = isRemote ? bridge.listRemoteMovPoints : bridge.listMovPoints
    listMovPoints(guildId).then(setLeaderboard)
  }

  async function saveBoard() {
    setSavingBoard(true)
    try {
      const setBoard_ = isRemote ? bridge.setRemoteMovPointsBoard : bridge.setMovPointsBoard
      const updated = await setBoard_(guildId, boardChannelId || null)
      setBoard(updated)
    } finally {
      setSavingBoard(false)
    }
  }

  async function apply(direction: 1 | -1) {
    if (!target) return
    setBusy(true)
    try {
      const addPoints = isRemote ? bridge.addRemoteMovPoints : bridge.addMovPoints
      const removePoints = isRemote ? bridge.removeRemoteMovPoints : bridge.removeMovPoints
      const updated = direction === 1 ? await addPoints(guildId, target.id, amount) : await removePoints(guildId, target.id, amount)
      setLeaderboard(updated)
      setTarget(null)
      setQuery('')
      setResults([])
    } finally {
      setBusy(false)
    }
  }

  async function applyHours() {
    if (!target) return
    const totalSeconds = hours * 3600 + minutes * 60 + seconds
    if (totalSeconds <= 0) return
    setBusyHours(true)
    try {
      const addHours = isRemote ? bridge.addRemoteMovHours : bridge.addMovHours
      const updated = await addHours(guildId, target.id, totalSeconds)
      setLeaderboard(updated)
      setTarget(null)
      setQuery('')
      setResults([])
      setHours(0)
      setMinutes(0)
      setSeconds(0)
    } finally {
      setBusyHours(false)
    }
  }

  async function resetPoints() {
    setResetting(true)
    try {
      const reset = isRemote ? bridge.resetRemoteMovPoints : bridge.resetMovPoints
      const updated = await reset(guildId)
      setLeaderboard(updated)
      setConfirmResetOpen(false)
    } finally {
      setResetting(false)
    }
  }

  async function toggleExclusion(userId: string, tag: string, excluded: boolean) {
    setTogglingExclusion(userId)
    try {
      const setExcluded = isRemote ? bridge.setRemoteMemberExcluded : bridge.setMemberExcluded
      const updatedExcluded = await setExcluded(guildId, userId, tag, excluded)
      setExcludedMembers(updatedExcluded)
      loadLeaderboard()
    } finally {
      setTogglingExclusion(null)
    }
  }

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        title="Pontos de MOV. Call"
        subtitle="Pontuação por participação em Mov. Calls, com um painel público sempre atualizado"
        action={
          isRemote ? (
            <Badge tone="success">
              <Radio size={11} className="mr-1 inline" /> A usar o bot remoto
            </Badge>
          ) : undefined
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

      <section>
        <SectionHeading
          title="Painel em tempo real"
          subtitle="Uma mensagem fixa que é atualizada automaticamente sempre que os pontos mudam, no Discord ou aqui"
          action={
            board?.channelId ? (
              <Badge tone="success">
                <Radio size={11} className="mr-1 inline" /> Ativo em #{board.channelName}
              </Badge>
            ) : (
              <Badge tone="warning">Sem painel definido</Badge>
            )
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={boardChannelId}
            onChange={(e) => setBoardChannelId(e.target.value)}
            className="rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            <option value="">Sem painel</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <Button onClick={saveBoard} loading={savingBoard} disabled={boardChannelId === (board?.channelId ?? '')}>
            Guardar
          </Button>
        </div>
      </section>

      <section>
        <SectionHeading title="Atribuir pontos" subtitle="Pesquisa um membro para adicionar ou remover pontos de MOV. Call" />
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-[16rem] flex-1">
            <div className="relative max-w-md">
              <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar membro…"
                className="w-full rounded-full border border-border bg-card py-2 pr-3 pl-9 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </div>
            {results.length > 0 && (
              <div className="mt-3 flex max-w-md flex-col gap-2">
                {results.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setTarget(m)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      target?.id === m.id ? 'border-accent bg-accent-soft' : 'border-border bg-card hover:border-border-strong'
                    }`}
                  >
                    <Avatar name={m.tag} color="#F0B232" size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">{m.tag}</p>
                    </div>
                    {m.isBot && <Badge>Bot</Badge>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {target && (
            <Card className="flex w-full max-w-xs flex-col gap-4">
              <div className="flex items-center gap-3">
                <Avatar name={target.tag} color="#F0B232" size="sm" />
                <p className="truncate text-sm font-semibold text-text">{target.tag}</p>
              </div>

              <div>
                <label className="text-xs font-semibold tracking-wide text-faint uppercase">Pontos</label>
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}
                  className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <Button variant="primary" onClick={() => apply(1)} loading={busy} className="flex-1">
                    <Plus size={14} />
                    Adicionar
                  </Button>
                  <Button variant="danger" onClick={() => apply(-1)} loading={busy} className="flex-1">
                    <Minus size={14} />
                    Remover
                  </Button>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <label className="text-xs font-semibold tracking-wide text-faint uppercase">Horas de Mov. Call</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  <div>
                    <input
                      type="number"
                      min={0}
                      value={hours}
                      onChange={(e) => setHours(Math.max(0, Number(e.target.value)))}
                      placeholder="h"
                      className="w-full rounded-lg border border-border bg-raised px-2 py-2 text-center text-sm text-text focus:border-accent focus:outline-none"
                    />
                    <p className="mt-0.5 text-center text-[10px] text-faint">horas</p>
                  </div>
                  <div>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={minutes}
                      onChange={(e) => setMinutes(Math.max(0, Number(e.target.value)))}
                      placeholder="m"
                      className="w-full rounded-lg border border-border bg-raised px-2 py-2 text-center text-sm text-text focus:border-accent focus:outline-none"
                    />
                    <p className="mt-0.5 text-center text-[10px] text-faint">min</p>
                  </div>
                  <div>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={seconds}
                      onChange={(e) => setSeconds(Math.max(0, Number(e.target.value)))}
                      placeholder="s"
                      className="w-full rounded-lg border border-border bg-raised px-2 py-2 text-center text-sm text-text focus:border-accent focus:outline-none"
                    />
                    <p className="mt-0.5 text-center text-[10px] text-faint">seg</p>
                  </div>
                </div>
                <Button
                  variant="dark"
                  onClick={applyHours}
                  loading={busyHours}
                  disabled={hours === 0 && minutes === 0 && seconds === 0}
                  className="mt-2 w-full"
                >
                  <Clock3 size={14} />
                  Atribuir horas
                </Button>
              </div>
            </Card>
          )}
        </div>
      </section>

      <section>
        <SectionHeading
          title="Ranking"
          subtitle="Mostra sempre todos os membros do servidor (mesmo sem pontos ou horas), exceto quem esconderes abaixo"
          action={
            <div className="flex items-center gap-3">
              {leaderboard.length > 0 && (
                <Button variant="danger" onClick={() => setConfirmResetOpen(true)} className="!px-3 !py-1.5 text-xs">
                  <RotateCcw size={13} />
                  Repor placar
                </Button>
              )}
              <Medal size={16} className="text-faint" />
            </div>
          }
        />
        {leaderboard.length === 0 ? (
          <EmptyState title="Ainda sem membros" description="Assim que o bot conseguir ver membros deste servidor, eles aparecem aqui automaticamente." />
        ) : (
          <div className="flex flex-col gap-2">
            {leaderboard.map((entry, i) => (
              <Card key={entry.userId} className="flex items-center gap-4 p-4">
                <span className="w-8 shrink-0 text-center text-lg">{medals[i] ?? `${i + 1}.`}</span>
                <Avatar name={entry.tag} color="#F0B232" size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{entry.tag}</p>
                {entry.totalSeconds > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                    <Clock3 size={12} /> {formatDuration(entry.totalSeconds)}
                  </span>
                )}
                <span className="shrink-0 text-sm font-bold text-warning">{entry.points} pontos</span>
                <button
                  onClick={() => toggleExclusion(entry.userId, entry.tag, true)}
                  disabled={togglingExclusion === entry.userId}
                  title="Esconder do ranking"
                  className="shrink-0 text-faint hover:text-danger disabled:opacity-50"
                >
                  <EyeOff size={15} />
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading
          title="Membros escondidos"
          subtitle="Quem escondes aqui nunca aparece no ranking, no painel público ou no /pontosmov ranking do Discord"
        />
        {excludedMembers.length === 0 ? (
          <EmptyState title="Ninguém escondido" description="Usa o ícone de olho fechado numa linha do ranking acima para esconder alguém." />
        ) : (
          <div className="flex flex-col gap-2">
            {excludedMembers.map((m) => (
              <Card key={m.userId} className="flex items-center gap-4 p-4">
                <Avatar name={m.tag} color="#99AAB5" size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{m.tag}</p>
                <Button
                  variant="dark"
                  onClick={() => toggleExclusion(m.userId, m.tag, false)}
                  loading={togglingExclusion === m.userId}
                  className="!px-3 !py-1.5 text-xs"
                >
                  <Eye size={13} />
                  Mostrar de novo
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        onConfirm={resetPoints}
        title="Repor placar de Mov. Call"
        description="Isto apaga TODOS os pontos e horas de Mov. Call de todas as pessoas neste servidor, de forma irreversível. O painel fica vazio até novas Mov. Calls serem registadas."
        danger
        confirmLabel={resetting ? 'A apagar…' : 'Sim, apagar tudo'}
      />
    </div>
  )
}
