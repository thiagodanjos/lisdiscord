import { useEffect, useRef, useState } from 'react'
import { Radio, Trash2, Upload } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { Badge, Button, Card, ConfirmDialog, EmptyState, SectionHeading } from '../components/ui'
import type { BotEmoji, RemoteBotConfig } from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const MAX_IMAGE_BYTES = 256 * 1024

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Não consegui ler o ficheiro.'))
    reader.readAsDataURL(file)
  })
}

export default function Emojis() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [toDelete, setToDelete] = useState<BotEmoji | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isRemote = Boolean(remoteConfig.url && remoteConfig.hasApiKey)

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemoteConfig)
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRemote])

  function load() {
    setLoading(true)
    const listEmojis = isRemote ? bridge.listRemoteEmojis : bridge.listEmojis
    listEmojis()
      .then(setEmojis)
      .catch((err) => setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.'))
      .finally(() => setLoading(false))
  }

  async function onPickFile(picked: File | null) {
    setError('')
    if (!picked) {
      setFile(null)
      setPreview('')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(picked.type)) {
      setError('Formato inválido — usa PNG, JPG, GIF ou WEBP.')
      return
    }
    if (picked.size > MAX_IMAGE_BYTES) {
      setError('A imagem tem de ter até 256 KB (limite da Discord para emojis).')
      return
    }
    setFile(picked)
    setPreview(await readFileAsDataUrl(picked))
    if (!name) setName(picked.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32))
  }

  async function upload() {
    if (!file || !preview) return
    setUploading(true)
    setError('')
    try {
      const addEmoji = isRemote ? bridge.addRemoteEmoji : bridge.addEmoji
      const created = await addEmoji(name, preview)
      setEmojis((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setFile(null)
      setPreview('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.')
    } finally {
      setUploading(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      const deleteEmoji = isRemote ? bridge.deleteRemoteEmoji : bridge.deleteEmoji
      await deleteEmoji(toDelete.id)
      setEmojis((prev) => prev.filter((e) => e.id !== toDelete.id))
      setToDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.')
    } finally {
      setDeleting(false)
    }
  }

  const nameValid = /^[a-zA-Z0-9_]{2,32}$/.test(name)

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        title="Emojis"
        subtitle="Biblioteca de emojis do bot — ficam disponíveis em qualquer embed ou mensagem, em qualquer servidor, usando o código que a Discord gera para cada um"
        action={
          isRemote ? (
            <Badge tone="success">
              <Radio size={11} className="mr-1 inline" /> A usar o bot remoto
            </Badge>
          ) : (
            <Badge tone="default">A usar a ligação local desta app</Badge>
          )
        }
      />

      <Card className="flex flex-col gap-4 p-4">
        <SectionHeading title="Adicionar emoji" subtitle="PNG, JPG, GIF ou WEBP, até 256 KB — o mesmo limite que a Discord aplica a emojis" />
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Imagem</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-card file:px-3 file:py-2 file:text-sm file:font-semibold file:text-text hover:file:bg-card-hover"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-semibold tracking-wide text-faint uppercase">Nome (letras, números, _ — 2 a 32 caracteres)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="meu_emoji"
              className="mt-1.5 w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
          {preview && <img src={preview} alt="Pré-visualização" className="size-12 rounded-lg border border-border object-contain" />}
          <Button onClick={upload} loading={uploading} disabled={!file || !nameValid}>
            <Upload size={14} />
            Adicionar
          </Button>
        </div>
        {error && <p className="text-xs text-danger">❌ {error}</p>}
      </Card>

      {loading ? (
        <p className="text-sm text-muted">A carregar…</p>
      ) : emojis.length === 0 ? (
        <EmptyState title="Ainda não há emojis" description="Adiciona o primeiro acima, ou usa o comando /addemojibot na Discord." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {emojis.map((emoji) => (
            <Card key={emoji.id} className="flex flex-col items-center gap-2 p-3">
              <img src={emoji.url} alt={emoji.name} className="size-12 object-contain" />
              <span className="max-w-full truncate text-xs font-semibold text-text" title={emoji.name}>
                :{emoji.name}:
              </span>
              <button onClick={() => setToDelete(emoji)} className="text-faint hover:text-danger" title="Remover emoji">
                <Trash2 size={14} />
              </button>
            </Card>
          ))}
        </div>
      )}

      <Card className="flex flex-col gap-1.5 p-4 text-xs text-faint">
        <p>
          Também podes adicionar emojis diretamente pela Discord com o comando <span className="font-semibold text-muted">/addemojibot</span>{' '}
          (precisa de permissão de "Gerir servidor").
        </p>
        <p>Depois de adicionado, usa o código do emoji (ex.: <span className="font-semibold text-muted">:nome_do_emoji:</span>) em qualquer texto editável nesta app.</p>
      </Card>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Remover emoji?"
        description={`O emoji ":${toDelete?.name}:" deixa de estar disponível em qualquer embed ou mensagem do bot.`}
        danger
        confirmLabel={deleting ? 'A remover…' : 'Remover'}
      />
    </div>
  )
}
