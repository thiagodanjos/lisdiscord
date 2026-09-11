import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Transcript, TranscriptSummary } from '../../shared/types'
import { paths } from './paths'

function filePath(id: string): string {
  return path.join(paths.transcriptsDir, `${id}.json`)
}

export function saveTranscript(id: string, transcript: Transcript): TranscriptSummary {
  writeFileSync(filePath(id), JSON.stringify(transcript, null, 2), 'utf-8')
  return toSummary(id, transcript)
}

export function listTranscripts(): TranscriptSummary[] {
  if (!existsSync(paths.transcriptsDir)) return []
  return readdirSync(paths.transcriptsDir)
    .filter((f) => f.endsWith('.json'))
    .map((file) => {
      const id = file.replace(/\.json$/, '')
      const transcript = JSON.parse(readFileSync(path.join(paths.transcriptsDir, file), 'utf-8')) as Transcript
      return toSummary(id, transcript)
    })
    .sort((a, b) => (a.exportedAt < b.exportedAt ? 1 : -1))
}

export function getTranscript(id: string): Transcript | null {
  const file = filePath(id)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf-8')) as Transcript
}

export function deleteTranscript(id: string): void {
  const file = filePath(id)
  if (existsSync(file)) unlinkSync(file)
}

function toSummary(id: string, transcript: Transcript): TranscriptSummary {
  return {
    id,
    channelId: transcript.channelId,
    channelName: transcript.channelName,
    guildName: transcript.guildName,
    exportedAt: transcript.exportedAt,
    messageCount: transcript.messages.length,
  }
}
