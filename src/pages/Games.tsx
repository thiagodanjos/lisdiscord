import { useEffect, useState } from 'react'
import { Gamepad2 } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Card, SectionHeading, Toggle } from '../components/ui'
import type { GameId, GameInfo, GameSettings, GuildSummary } from '../../shared/types'

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
        {games.map((game) => (
          <Card key={game.id} className="flex items-center gap-4 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Gamepad2 size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-text">{game.name}</p>
                <code className="rounded bg-raised px-1.5 py-0.5 text-xs text-accent">{game.command}</code>
              </div>
              <p className="mt-0.5 text-xs text-muted">{game.description}</p>
            </div>
            <Toggle checked={settings?.enabled[game.id] ?? true} onChange={(v) => toggle(game.id, v)} />
          </Card>
        ))}
      </div>

      <p className="text-xs text-faint">
        Os comandos ficam disponíveis no servidor assim que ativados (é instantâneo) — mas só respondem enquanto a
        LisDiscord estiver aberta e o bot ligado, tal como o resto da app.
      </p>
    </div>
  )
}
