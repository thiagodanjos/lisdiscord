import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Paperclip } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { formatDateTime } from '../lib/format'
import { initials } from '../lib/utils'
import { Card, SectionHeading } from '../components/ui'
import type { Transcript } from '../../shared/types'

export default function TranscriptDetail() {
  const { id = '' } = useParams()
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    bridge.getTranscript(id).then((t) => {
      setTranscript(t)
      setLoading(false)
    })
  }, [id])

  if (!loading && !transcript) return <Navigate to="/transcripts" replace />
  if (!transcript) return null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <SectionHeading title={`#${transcript.channelName}`} subtitle={`${transcript.guildName} · exportado em ${formatDateTime(transcript.exportedAt)}`} />

      <Card className="flex flex-col gap-4 bg-raised">
        {transcript.messages.map((m) => (
          <div key={m.id} className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
              {initials(m.authorTag)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-text">{m.authorTag}</span>
                <span className="text-[11px] text-faint">{formatDateTime(m.createdAt)}</span>
                {m.editedAt && <span className="text-[11px] text-faint">(editado)</span>}
              </div>
              {m.content && <p className="text-sm break-words text-muted">{m.content}</p>}
              {m.attachments.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  {m.attachments.map((a, i) => (
                    <a key={i} href={a} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover">
                      <Paperclip size={11} />
                      anexo {i + 1}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {transcript.messages.length === 0 && <p className="text-sm text-muted">Este canal não tinha mensagens para exportar.</p>}
      </Card>
    </div>
  )
}
