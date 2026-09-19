import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { SectionHeading } from '../components/ui'
import { EmbedTemplateEditor } from '../components/EmbedTemplateEditor'
import type { BotEmoji, ChannelPickerEntry, EmbedDraft, GuildSummary } from '../../shared/types'

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

export default function Messaging() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [guildId, setGuildId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [draft, setDraft] = useState<EmbedDraft>(EMPTY_DRAFT)
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    bridge.listGuilds().then((g) => {
      setGuilds(g)
      setGuildId(g[0]?.id ?? '')
    })
    bridge.listEmojis().then(setEmojis).catch(() => setEmojis([]))
  }, [])

  useEffect(() => {
    if (!guildId) return
    bridge.listChannels(guildId).then((c) => {
      setChannels(c)
      setChannelId(c[0]?.id ?? '')
    })
  }, [guildId])

  async function send() {
    if (!channelId) return
    setSending(true)
    try {
      await bridge.sendEmbed(guildId, channelId, draft)
      setSent(true)
      setTimeout(() => setSent(false), 3000)
      setDraft(EMPTY_DRAFT)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Mensagens" subtitle="Envia uma mensagem com embed, bonita e formatada, para um canal" />

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
      />
    </div>
  )
}
