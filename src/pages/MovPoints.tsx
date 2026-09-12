import { useEffect, useState } from 'react'
import { Medal, Minus, Plus, Radio, Search } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Avatar, Badge, Button, Card, EmptyState, SectionHeading } from '../components/ui'
import type { ChannelPickerEntry, GuildSummary, MemberSearchResult, MovPointsBoardConfig, MovPointsEntry } from '../../shared/types'

const POLL_INTERVAL_MS = 8_000

export default function MovPoints() {
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
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    bridge.listGuilds().then((g) => {
      setGuilds(g)
      setGuildId(g[0]?.id ?? '')
    })
  }, [])

  useEffect(() => {
    if (!guildId) return
    bridge.listChannels(guildId).then(setChannels)
    bridge.getMovPointsBoard(guildId).then((b) => {
      setBoard(b)
      setBoardChannelId(b.channelId ?? '')
    })
    loadLeaderboard()

    const interval = setInterval(loadLeaderboard, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId])

  useEffect(() => {
    if (!guildId || !query.trim()) {
      setResults([])
      return
    }
    const timeout = setTimeout(() => {
      bridge.searchMembers(guildId, query).then(setResults)
    }, 300)
    return () => clearTimeout(timeout)
  }, [guildId, query])

  function loadLeaderboard() {
    if (!guildId) return
    bridge.listMovPoints(guildId).then(setLeaderboard)
  }

  async function saveBoard() {
    setSavingBoard(true)
    try {
      const updated = await bridge.setMovPointsBoard(guildId, boardChannelId || null)
      setBoard(updated)
    } finally {
      setSavingBoard(false)
    }
  }

  async function apply(direction: 1 | -1) {
    if (!target) return
    setBusy(true)
    try {
      const updated =
        direction === 1
          ? await bridge.addMovPoints(guildId, target.id, amount)
          : await bridge.removeMovPoints(guildId, target.id, amount)
      setLeaderboard(updated)
      setTarget(null)
      setQuery('')
      setResults([])
    } finally {
      setBusy(false)
    }
  }

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        title="Pontos de MOV. Call"
        subtitle="Pontuação por participação em Mov. Calls, com um painel público sempre atualizado"
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
            <Card className="flex w-full max-w-xs flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={target.tag} color="#F0B232" size="sm" />
                <p className="truncate text-sm font-semibold text-text">{target.tag}</p>
              </div>
              <div>
                <label className="text-xs font-semibold tracking-wide text-faint uppercase">Quantidade</label>
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}
                  className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => apply(1)} loading={busy} className="flex-1">
                  <Plus size={14} />
                  Adicionar
                </Button>
                <Button variant="danger" onClick={() => apply(-1)} loading={busy} className="flex-1">
                  <Minus size={14} />
                  Remover
                </Button>
              </div>
            </Card>
          )}
        </div>
      </section>

      <section>
        <SectionHeading title="Ranking" action={<Medal size={16} className="text-faint" />} />
        {leaderboard.length === 0 ? (
          <EmptyState title="Ainda sem pontos" description="Regista uma Mov. Call com /movcall no Discord ou adiciona pontos manualmente acima." />
        ) : (
          <div className="flex flex-col gap-2">
            {leaderboard.map((entry, i) => (
              <Card key={entry.userId} className="flex items-center gap-4 p-4">
                <span className="w-8 shrink-0 text-center text-lg">{medals[i] ?? `${i + 1}.`}</span>
                <Avatar name={entry.tag} color="#F0B232" size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{entry.tag}</p>
                <span className="shrink-0 text-sm font-bold text-warning">{entry.points} pontos</span>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
