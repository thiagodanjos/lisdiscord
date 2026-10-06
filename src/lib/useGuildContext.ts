import { useEffect, useState } from 'react'
import { bridge } from './bridge'
import { cleanIpcError } from './errors'
import type { BotEmoji, ChannelPickerEntry, GuildSummary, RemoteBotConfig, RolePickerEntry } from '../../shared/types'

/**
 * O que quase todas as páginas de configuração precisam: saber se há bot remoto, a lista de servidores,
 * o servidor escolhido e os canais/cargos/emojis desse servidor — vindos do bot certo (remoto ou local).
 */
export function useGuildContext(options: { channels?: boolean; roles?: boolean; emojis?: boolean } = {}) {
  const [remote, setRemote] = useState<RemoteBotConfig | null>(null)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [roles, setRoles] = useState<RolePickerEntry[]>([])
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [error, setError] = useState('')
  const isRemote = Boolean(remote?.url && remote.hasApiKey)
  const ready = remote !== null

  useEffect(() => {
    bridge
      .getRemoteBotConfig()
      .then(setRemote)
      .catch(() => setRemote({ url: null, hasApiKey: false }))
  }, [])

  const reloadGuilds = () => {
    if (!ready) return
    const list = isRemote ? bridge.listRemoteGuilds : bridge.listGuilds
    list()
      .then((g) => {
        setGuilds(g)
        setGuildId((prev) => (g.some((x) => x.id === prev) ? prev : (g[0]?.id ?? '')))
      })
      .catch((err) => setError(cleanIpcError(err)))
  }

  useEffect(() => {
    reloadGuilds()
    if (ready && options.emojis) (isRemote ? bridge.listRemoteEmojis : bridge.listEmojis)().then(setEmojis).catch(() => setEmojis([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isRemote])

  useEffect(() => {
    if (!guildId) return
    if (options.channels) {
      (isRemote ? bridge.listRemoteChannels : bridge.listChannels)(guildId)
        .then((c) => setChannels(c.filter((ch) => ch.kind === 'text' || ch.kind === 'announcement')))
        .catch(() => setChannels([]))
    }
    if (options.roles) (isRemote ? bridge.listRemoteRoles : bridge.listRoles)(guildId).then(setRoles).catch(() => setRoles([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, isRemote])

  return { ready, isRemote, guilds, guildId, setGuildId, channels, roles, emojis, error, setError, reloadGuilds }
}
