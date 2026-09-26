import { useEffect, useState } from 'react'
import { bridge } from '../lib/bridge'
import { Modal } from './ui'
import { EmbedTemplateEditor } from './EmbedTemplateEditor'
import type { BotEmoji, EmbedDraft, EmbedTemplateKind, VerifyLineFormat } from '../../shared/types'

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

/**
 * Modal completo para personalizar um embed fixo do bot (carrega, guarda e repõe o template do
 * servidor — localmente ou no bot remoto). Usado pelas páginas que só precisam de "um botão
 * Personalizar" sem gerir o estado do editor à mão.
 */
export function TemplateEditorModal({
  open,
  onClose,
  kind,
  guildId,
  isRemote,
  title,
  hint,
  tokens,
  previewPlaceholders,
  previewContent,
  verifyLineDefaults,
  previewVerifyRoles,
  imageNote,
}: {
  open: boolean
  onClose: () => void
  kind: EmbedTemplateKind
  guildId: string
  isRemote: boolean
  title: string
  hint: string
  tokens: readonly string[]
  previewPlaceholders: Record<string, string>
  previewContent?: string
  verifyLineDefaults?: VerifyLineFormat
  previewVerifyRoles?: (lines: VerifyLineFormat) => string
  imageNote?: string
}) {
  const [draft, setDraft] = useState<EmbedDraft>(EMPTY_DRAFT)
  const [customized, setCustomized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [emojis, setEmojis] = useState<BotEmoji[]>([])

  useEffect(() => {
    if (!open || !guildId) return
    setError('')
    setSaved(false)
    const getTemplate = isRemote ? bridge.getRemoteEmbedTemplate : bridge.getEmbedTemplate
    getTemplate(guildId, kind)
      .then((r) => {
        setDraft(r.draft)
        setCustomized(r.customized)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não consegui carregar o template.'))
    const listEmojis = isRemote ? bridge.listRemoteEmojis : bridge.listEmojis
    listEmojis().then(setEmojis).catch(() => setEmojis([]))
  }, [open, guildId, kind, isRemote])

  async function save() {
    setSaving(true)
    setError('')
    try {
      const setTemplate = isRemote ? bridge.setRemoteEmbedTemplate : bridge.setEmbedTemplate
      const r = await setTemplate(guildId, kind, draft)
      setCustomized(r.customized)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.')
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    setResetting(true)
    try {
      const resetTemplate = isRemote ? bridge.resetRemoteEmbedTemplate : bridge.resetEmbedTemplate
      const r = await resetTemplate(guildId, kind)
      setDraft(r.draft)
      setCustomized(r.customized)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} width="xl">
      <EmbedTemplateEditor
        draft={draft}
        onChange={setDraft}
        emojis={emojis}
        botName="LisDiscord Bot"
        onSave={save}
        onReset={reset}
        saving={saving}
        resetting={resetting}
        customized={customized}
        errorMessage={error}
        placeholderHint={hint}
        placeholderTokens={tokens}
        previewPlaceholders={previewPlaceholders}
        previewContent={previewContent}
        verifyLineDefaults={verifyLineDefaults}
        previewVerifyRoles={previewVerifyRoles}
        imageNote={imageNote}
        saveLabel={saved ? 'Guardado ✓' : 'Guardar'}
      />
    </Modal>
  )
}
