import { useEffect, useState } from 'react'
import { Download, Radio, Send, Upload } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Badge, Button, Card, Modal, PageHeader, Toggle } from '../components/ui'
import { EmbedTemplateEditor } from '../components/EmbedTemplateEditor'
import { RichTextField } from '../components/RichTextField'
import { emptyEmbedDraft, messageDraftFromJson, messageDraftToJson, type MessageDraft } from '../../shared/messageJson'
import type { BotEmoji, ChannelPickerEntry, EmbedDraft, GuildSummary, RemoteBotConfig, SendMessageResult } from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const inputClass = 'w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

export default function Messaging() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [channels, setChannels] = useState<ChannelPickerEntry[]>([])
  const [guildId, setGuildId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [draft, setDraft] = useState<EmbedDraft>(emptyEmbedDraft({ timestamp: true }))
  const [content, setContent] = useState('')
  const [asWebhook, setAsWebhook] = useState(false)
  const [webhookName, setWebhookName] = useState('')
  const [webhookAvatarUrl, setWebhookAvatarUrl] = useState('')
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendMessageResult | null>(null)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  const isRemote = Boolean(remoteConfig.url && remoteConfig.hasApiKey)
  const guild = guilds.find((g) => g.id === guildId)

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

  // Como no /embed: a webhook começa com o nome e o ícone do servidor.
  useEffect(() => {
    if (!guild) return
    setWebhookName((n) => n || guild.name)
    setWebhookAvatarUrl((u) => u || guild.iconUrl || '')
  }, [guild])

  function currentMessage(): MessageDraft {
    return { content, embed: draft, webhookName: asWebhook ? webhookName : '', webhookAvatarUrl: asWebhook ? webhookAvatarUrl : '' }
  }

  async function send() {
    if (!channelId) return
    setSending(true)
    setError('')
    setResult(null)
    try {
      const sendEmbed = isRemote ? bridge.sendRemoteEmbed : bridge.sendEmbed
      const sent = await sendEmbed(guildId, channelId, draft, {
        content,
        webhook: asWebhook ? { name: webhookName, avatarUrl: webhookAvatarUrl } : null,
      })
      setResult(sent)
      setDraft(emptyEmbedDraft({ timestamp: true }))
      setContent('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.')
    } finally {
      setSending(false)
    }
  }

  function exportJson() {
    const json = messageDraftToJson(currentMessage())
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'embed.json'
    a.click()
    URL.revokeObjectURL(url)
    navigator.clipboard?.writeText(json).catch(() => undefined)
  }

  function applyImport(imported: MessageDraft) {
    setDraft(imported.embed)
    setContent(imported.content)
    if (imported.webhookName || imported.webhookAvatarUrl) {
      setAsWebhook(true)
      setWebhookName(imported.webhookName)
      setWebhookAvatarUrl(imported.webhookAvatarUrl)
    }
    setImportOpen(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mensagens"
        subtitle="Envia uma mensagem com embed (ou como webhook, com nome e foto próprios) — também dá pelo Discord, com /embed"
        action={
          isRemote ? (
            <Badge tone="success">
              <Radio size={11} className="mr-1 inline" /> A usar o bot remoto
            </Badge>
          ) : undefined
        }
      />

      <div className="grid max-w-xl grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold tracking-wide text-faint uppercase">Servidor</label>
          <select value={guildId} onChange={(e) => setGuildId(e.target.value)} className={`mt-1.5 ${inputClass}`}>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold tracking-wide text-faint uppercase">Canal</label>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={`mt-1.5 ${inputClass}`}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {loadError && <p className="-mt-3 text-xs text-danger">❌ {loadError}</p>}

      <Card className="flex flex-col gap-3">
        <RichTextField label="Texto da mensagem (fora do embed, opcional)" value={content} onChange={setContent} emojis={emojis} rows={2} maxLength={2000} />
        <Toggle checked={asWebhook} onChange={setAsWebhook} label="Enviar como webhook (nome e foto personalizados)" />
        {asWebhook && (
          <div className="grid max-w-2xl grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold tracking-wide text-faint uppercase">Nome da webhook</label>
              <input value={webhookName} onChange={(e) => setWebhookName(e.target.value)} maxLength={80} className={`mt-1.5 ${inputClass}`} />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wide text-faint uppercase">Foto da webhook (URL)</label>
              <input value={webhookAvatarUrl} onChange={(e) => setWebhookAvatarUrl(e.target.value)} placeholder="https://…" className={`mt-1.5 ${inputClass}`} />
            </div>
          </div>
        )}
      </Card>

      <EmbedTemplateEditor
        draft={draft}
        onChange={setDraft}
        emojis={emojis}
        botName={asWebhook && webhookName ? webhookName : 'LisDiscord Bot'}
        onSave={send}
        saving={sending}
        customized={false}
        saveLabel="Enviar mensagem"
        saveIcon={Send}
        saveDisabled={!channelId}
        errorMessage={error}
        previewContent={content}
        previewAvatarUrl={asWebhook ? webhookAvatarUrl : undefined}
        extraActions={
          <>
            <Button variant="dark" onClick={exportJson} title="Descarrega embed.json e copia o JSON">
              <Download size={14} />
              Exportar JSON
            </Button>
            <Button variant="dark" onClick={() => setImportOpen(true)}>
              <Upload size={14} />
              Importar JSON
            </Button>
          </>
        }
      />
      {result && (
        <p className="-mt-3 text-sm text-success">
          ✅ Enviada{result.viaWebhook ? ' como webhook' : ''}.{' '}
          {result.url && (
            <a href={result.url} target="_blank" rel="noreferrer" className="font-semibold underline">
              Ver na Discord
            </a>
          )}
          {result.warning && <span className="block text-xs text-warning">⚠️ {result.warning}</span>}
        </p>
      )}

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        fallback={currentMessage()}
        onImport={applyImport}
      />
    </div>
  )
}

function ImportModal({
  open,
  onClose,
  fallback,
  onImport,
}: {
  open: boolean
  onClose: () => void
  fallback: MessageDraft
  onImport: (draft: MessageDraft) => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setText('')
      setError('')
    }
  }, [open])

  function submit() {
    try {
      onImport(messageDraftFromJson(text, fallback))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JSON inválido.')
    }
  }

  async function loadFile(file: File | undefined) {
    if (!file) return
    setText(await file.text())
    setError('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Importar configuração (JSON)" width="lg">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Cola o JSON exportado pelo <span className="font-semibold text-text">/embed</span>, por esta página ou por ferramentas como o Discohook — ou
          escolhe o ficheiro.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder='{ "content": "...", "embeds": [ { "title": "..." } ] }'
          className={`${inputClass} font-mono text-xs`}
        />
        <input type="file" accept="application/json,.json" onChange={(e) => loadFile(e.target.files?.[0])} className="text-xs text-muted" />
        {error && <p className="text-xs text-danger">❌ {error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="dark" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!text.trim()}>
            <Upload size={14} />
            Importar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
