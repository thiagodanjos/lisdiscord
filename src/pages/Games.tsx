import { useEffect, useState } from 'react'
import { Brain, Cherry, Coins, Dice5, Disc3, Flag, Gamepad2, Grid3x3, Hand, Hash, HelpCircle, Shuffle, Skull, Spade, Swords, Wallet } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Card, SectionHeading, Toggle } from '../components/ui'
import type { GameId, GameInfo, GameSettings, GuildSummary } from '../../shared/types'

const GAME_ICONS: Record<GameId, typeof Gamepad2> = {
  dado: Dice5,
  moeda: Coins,
  ppt: Hand,
  oitobola: HelpCircle,
  trivia: Brain,
  forca: Skull,
  blackjack: Spade,
  jogodavelha: Grid3x3,
  duelo: Swords,
  roleta: Disc3,
  cacaniqueis: Cherry,
  corrida: Flag,
  numero: Hash,
  desembaralhar: Shuffle,
  economia: Wallet,
}

const REWARDS_COINS: GameId[] = ['trivia', 'forca', 'jogodavelha', 'numero', 'desembaralhar']
const WAGER_GAMES: GameId[] = ['blackjack', 'duelo', 'roleta', 'cacaniqueis', 'corrida']

export default function Games() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [games, setGames] = useState<GameInfo[]>([])
  const [settings, setSettings] = useState<GameSettings | null>(null)

  useEffect(() => {
    Promise.all([bridge.listGuilds(), bridge.listGames()]).then(([g, gm]) => {
      setGuilds(g)
      setGuildId(g[0]?.id ?? '')
      setGames(gm)
    })
  }, [])

  useEffect(() => {
    if (!guildId) return
    bridge.getGameSettings(guildId).then(setSettings)
  }, [guildId])

  async function toggle(gameId: GameId, enabled: boolean) {
    const updated = await bridge.setGameSettings(guildId, gameId, enabled)
    setSettings(updated)
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Jogos" subtitle="Mini-jogos que os membros do servidor podem usar como comandos" />

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

      <div className="flex flex-col gap-2">
        {games.map((game) => {
          const Icon = GAME_ICONS[game.id] ?? Gamepad2
          const rewards = REWARDS_COINS.includes(game.id)
          const wager = WAGER_GAMES.includes(game.id)
          return (
            <Card key={game.id} className="flex items-center gap-4 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-text">{game.name}</p>
                  <code className="rounded bg-raised px-1.5 py-0.5 text-xs text-accent">{game.command}</code>
                  {rewards && (
                    <span className="flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                      <Coins size={11} /> Ganha moedas
                    </span>
                  )}
                  {wager && (
                    <span className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                      <Coins size={11} /> Aposta moedas
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted">{game.description}</p>
              </div>
              <Toggle checked={settings?.enabled[game.id] ?? true} onChange={(v) => toggle(game.id, v)} />
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-faint">
        Os comandos ficam disponíveis no servidor assim que ativados (é instantâneo) — mas só respondem enquanto a
        LisDiscord estiver aberta e o bot ligado, tal como o resto da app. Os jogos marcados com{' '}
        <span className="inline-flex items-center gap-1 align-middle text-warning">
          <Coins size={11} /> Ganha moedas
        </span>{' '}
        só rendem moedas; os marcados com{' '}
        <span className="inline-flex items-center gap-1 align-middle text-accent">
          <Coins size={11} /> Aposta moedas
        </span>{' '}
        também podem fazer perder a aposta. Todos alimentam a mesma economia partilhada do servidor — os membros veem
        o saldo com <code className="text-accent">/saldo</code> e o ranking com <code className="text-accent">/ranking</code>.
      </p>
    </div>
  )
}
