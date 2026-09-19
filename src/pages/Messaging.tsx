import { useEffect, useState } from 'react'
import { Radio, Send } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Badge, SectionHeading } from '../components/ui'
import { EmbedTemplateEditor } from '../components/EmbedTemplateEditor'
import type { BotEmoji, ChannelPickerEntry, EmbedDraft, GuildSummary, RemoteBotConfig } from '../../shared/types'

const EMPTY_DRAFT: EmbedDraft = {
  title: '',
  description: '',
  color: '#5865F2',
  imageUrl: '',
  thumbnailUrl: '',
  footer: '',
  authorName: '',
  fields: [],
  timestamp: true,
}

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }

export default function Messaging() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [guildId, setGuildId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [draft, setDraft] = useState<EmbedDraft>(EMPTY_DRAFT)
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
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
    const listEmojis = isRemote ? bridge.listRemoteEmojis : bridge.listEmojis
    listEmojis().then(setEmojis).catch(() => setEmojis([]))
  }, [isRemote])

  useEffect(() => {
    if (!guildId) return
    setLoadError('')
    const listChannels = isRemote ? bridge.listRemoteChannels : bridge.listChannels
    listChannels(guildId)
      .then((c) => {
        setChannels(c)
        setChannelId(c[0]?.id ?? '')
      })
      .catch((err) => {
        setChannels([])
        setChannelId('')
        setLoadError(err instanceof Error ? err.message : 'Não consegui carregar os canais.')
      })
  }, [guildId, isRemote])

  async function send() {
    if (!channelId) return
    setSending(true)
    setError('')
    try {
      const sendEmbed = isRemote ? bridge.sendRemoteEmbed : bridge.sendEmbed
      await sendEmbed(guildId, channelId, draft)
      setSent(true)
      setTimeout(() => setSent(false), 3000)
      setDraft(EMPTY_DRAFT)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Mensagens"
        subtitle="Envia uma mensagem com embed, bonita e formatada, para um canal"
        action={
          isRemote ? (
            <Badge tone="success">
              <Radio size={11} className="mr-1 inline" /> A usar o bot remoto
            </Badge>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 max-w-xl">
        <div>
          <label className="text-xs font-semibold tracking-wide text-faint uppercase">Servidor</label>
          <select
            value={guildId}
            onChange={(e) => setGuildId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold tracking-wide text-faint uppercase">Canal</label>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {loadError && <p className="-mt-3 text-xs text-danger">❌ {loadError}</p>}

      <EmbedTemplateEditor
        draft={draft}
        onChange={setDraft}
        emojis={emojis}
        botName="LisDiscord Bot"
        onSave={send}
        saving={sending}
        customized={false}
        saveLabel={sent ? 'Enviado ✓' : 'Enviar mensagem'}
        saveIcon={Send}
        saveDisabled={!channelId}
        errorMessage={error}
      />
    </div>
  )
}
