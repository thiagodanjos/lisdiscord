import { useEffect, useState } from 'react'
import { Gift, Play, Plus, Trash2 } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatRelativeDate } from '../lib/format'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, SectionHeading } from '../components/ui'
import type { ChannelPickerEntry, Giveaway, GuildSummary } from '../../shared/types'

const DURATION_OPTIONS = [
  { label: '10 minutos', value: 600_000 },
  { label: '1 hora', value: 3_600_000 },
  { label: '6 horas', value: 21_600_000 },
  { label: '1 dia', value: 86_400_000 },
  { label: '3 dias', value: 259_200_000 },
  { label: '1 semana', value: 604_800_000 },
]

export default function Giveaways() {
  const [giveaways, setGiveaways] = useState<Giveaway[]>([])
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [toDelete, setToDelete] = useState<Giveaway | null>(null)

  const [guildId, setGuildId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [prize, setPrize] = useState('')
  const [duration, setDuration] = useState(3_600_000)
  const [winnerCount, setWinnerCount] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!guildId) return
    bridge.listChannels(guildId).then((c) => {
      setChannels(c)
      setChannelId(c[0]?.id ?? '')
    })
  }, [guildId])

  function load() {
    Promise.all([bridge.listGiveaways(), bridge.listGuilds()]).then(([g, guildList]) => {
      setGiveaways(g)
      setGuilds(guildList)
      setGuildId((prev) => prev || guildList[0]?.id || '')
      setLoading(false)
    })
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!channelId || !prize.trim()) return
    setSubmitting(true)
    try {
      await bridge.createGiveaway(guildId, channelId, prize.trim(), duration, winnerCount)
      setCreating(false)
      setPrize('')
      load()
    } finally {
      setSubmitting(false)
    }
  }

  async function endNow(id: string) {
    await bridge.endGiveaway(id)
    load()
  }

  async function confirmDelete() {
    if (!toDelete) return
    await bridge.deleteGiveaway(toDelete.id)
    load()
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Sorteios"
        subtitle="Publica um sorteio com reação 🎉 e escolhe vencedores automaticamente"
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus size={14} />
            Novo sorteio
          </Button>
        }
      />

      {!loading && giveaways.length === 0 && (
        <EmptyState title="Sem sorteios" description="Cria um sorteio e os membros participam reagindo à mensagem no Discord." />
      )}

      <div className="flex flex-col gap-2">
        {giveaways.map((g) => (
          <Card key={g.id} className="flex items-center gap-3 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Gift size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">{g.prize}</p>
              <p className="text-xs text-muted">
                #{g.channelName} · {g.guildName} · {g.winnerCount} {g.winnerCount === 1 ? 'vencedor' : 'vencedores'}
              </p>
              {g.ended && (
                <p className="mt-0.5 text-xs text-success">
                  {g.winners.length > 0 ? `Vencedores: ${g.winners.join(', ')}` : 'Sem participantes'}
                </p>
              )}
            </div>
            {g.ended ? <Badge tone="default">Encerrado</Badge> : <Badge tone="accent">Ativo · termina {formatRelativeDate(g.endsAt)}</Badge>}
            {!g.ended && (
              <button onClick={() => endNow(g.id)} title="Terminar agora" className="shrink-0 text-faint hover:text-accent">
                <Play size={15} />
              </button>
            )}
            <button onClick={() => setToDelete(g)} className="shrink-0 text-faint hover:text-danger">
              <Trash2 size={15} />
            </button>
          </Card>
        ))}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Novo sorteio">
        <form onSubmit={submitCreate} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold tracking-wide text-faint uppercase">Servidor</label>
              <select value={guildId} onChange={(e) => setGuildId(e.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none">
                {guilds.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wide text-faint uppercase">Canal</label>
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none">
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Prémio</label>
            <input value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Ex.: Nitro de 1 mês" className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none" />
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Duração</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => setDuration(o.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    duration === o.value ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-raised text-muted hover:text-text'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Número de vencedores</label>
            <input
              type="number"
              min={1}
              max={20}
              value={winnerCount}
              onChange={(e) => setWinnerCount(Number(e.target.value))}
              className="mt-1.5 w-24 rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <p className="text-xs text-faint">
            O sorteio termina sozinho enquanto a LisDiscord estiver aberta, ou podes terminá-lo manualmente a
            qualquer momento na lista.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="dark" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={submitting} disabled={!channelId || !prize.trim()}>
              Publicar sorteio
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Apagar sorteio"
        description={`Isto remove "${toDelete?.prize}" da lista. A mensagem já publicada no Discord não é apagada.`}
        confirmLabel="Apagar"
        danger
      />
    </div>
  )
}
