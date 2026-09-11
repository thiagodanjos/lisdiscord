import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { bridge } from '../lib/bridge'
import { cn } from '../lib/utils'
import { Button, Modal, Toggle } from './ui'
import type { BackupData, GuildSummary, RestoreOptions, RestoreProgressEvent } from '../../shared/types'

const DEFAULT_OPTIONS: RestoreOptions = {
  wipeExistingChannels: false,
  restoreRoles: true,
  restoreChannels: true,
  restoreEmojis: true,
  restoreSettings: true,
  restoreBans: false,
}

export function RestoreModal({ open, onClose, backup }: { open: boolean; onClose: () => void; backup: BackupData }) {
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [targetGuildId, setTargetGuildId] = useState('')
  const [options, setOptions] = useState<RestoreOptions>(DEFAULT_OPTIONS)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<RestoreProgressEvent[]>([])
  const [confirmWipe, setConfirmWipe] = useState(false)

  useEffect(() => {
    if (!open) return
    bridge.listGuilds().then((g) => {
      setGuilds(g)
      setTargetGuildId((prev) => prev || g.find((x) => x.id === backup.guildId)?.id || g[0]?.id || '')
    })
    setLog([])
    setRunning(false)
    setConfirmWipe(false)
  }, [open, backup.guildId])

  useEffect(() => {
    if (!open) return
    return bridge.onRestoreProgress((event) => setLog((prev) => [...prev, event]))
  }, [open])

  async function start() {
    if (options.wipeExistingChannels && !confirmWipe) return
    setRunning(true)
    setLog([])
    await bridge.restoreBackup(backup.id, targetGuildId, options)
    setRunning(false)
  }

  const done = log.some((e) => e.step === 'done')

  return (
    <Modal open={open} onClose={onClose} title={`Restaurar "${backup.guildName}"`} width="lg">
      {!running && log.length === 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Restaurar para</label>
            <select
              value={targetGuildId}
              onChange={(e) => setTargetGuildId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted">
              Podes restaurar para o mesmo servidor (para recuperar algo apagado) ou para outro onde o bot também
              esteja com permissões de admin.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-raised p-3.5">
            <OptionRow label="Cargos" checked={options.restoreRoles} onChange={(v) => setOptions((o) => ({ ...o, restoreRoles: v }))} />
            <OptionRow label="Canais e categorias" checked={options.restoreChannels} onChange={(v) => setOptions((o) => ({ ...o, restoreChannels: v }))} />
            <OptionRow label="Emojis" checked={options.restoreEmojis} onChange={(v) => setOptions((o) => ({ ...o, restoreEmojis: v }))} />
            <OptionRow label="Definições do servidor" checked={options.restoreSettings} onChange={(v) => setOptions((o) => ({ ...o, restoreSettings: v }))} />
            <OptionRow label="Banimentos" checked={options.restoreBans} onChange={(v) => setOptions((o) => ({ ...o, restoreBans: v }))} />
          </div>

          <div className="rounded-lg border border-danger/30 bg-danger/5 p-3.5">
            <OptionRow
              label="Apagar canais existentes antes de restaurar"
              checked={options.wipeExistingChannels}
              onChange={(v) => {
                setOptions((o) => ({ ...o, wipeExistingChannels: v }))
                setConfirmWipe(false)
              }}
              danger
            />
            {options.wipeExistingChannels && (
              <label className="mt-3 flex items-start gap-2 text-xs text-danger">
                <input type="checkbox" checked={confirmWipe} onChange={(e) => setConfirmWipe(e.target.checked)} className="mt-0.5 accent-danger" />
                Sei que isto apaga TODOS os canais atuais do servidor de destino e não pode ser desfeito.
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="dark" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={start} disabled={!targetGuildId || (options.wipeExistingChannels && !confirmWipe)}>
              Iniciar restauro
            </Button>
          </div>
        </div>
      )}

      {(running || log.length > 0) && (
        <div className="flex flex-col gap-3">
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-raised p-3 font-mono text-xs">
            {log.map((event, i) => (
              <div key={i} className={cn('flex items-center gap-2 py-0.5', levelColor(event.level))}>
                <LevelIcon level={event.level} />
                <span>{event.message}</span>
              </div>
            ))}
            {running && (
              <div className="flex items-center gap-2 py-0.5 text-muted">
                <Loader2 size={12} className="animate-spin" />
                <span>a processar…</span>
              </div>
            )}
          </div>
          {done && (
            <div className="flex justify-end">
              <Button onClick={onClose}>Fechar</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function OptionRow({ label, checked, onChange, danger }: { label: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn('text-sm', danger ? 'text-danger' : 'text-text')}>{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

function levelColor(level: RestoreProgressEvent['level']): string {
  if (level === 'error') return 'text-danger'
  if (level === 'success') return 'text-success'
  return 'text-muted'
}

function LevelIcon({ level }: { level: RestoreProgressEvent['level'] }) {
  if (level === 'error') return <XCircle size={12} className="shrink-0" />
  if (level === 'success') return <CheckCircle2 size={12} className="shrink-0" />
  return <AlertTriangle size={12} className="shrink-0 opacity-0" />
}
