import type { JustificationChannelKind, JustificationSettings } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

interface GuildJustificationSettings extends JustificationSettings {
  fixedPostMessageId: string | null
  dailyPostMessageId: string | null
}

type JustificationData = Record<string, GuildJustificationSettings>

const EMPTY: GuildJustificationSettings = {
  fixedPostChannelId: null,
  fixedPostChannelName: null,
  fixedPostMessageId: null,
  dailyPostChannelId: null,
  dailyPostChannelName: null,
  dailyPostMessageId: null,
  fixedLogChannelId: null,
  fixedLogChannelName: null,
  dailyLogChannelId: null,
  dailyLogChannelName: null,
}

function readAll(): JustificationData {
  return readJsonFile<JustificationData>(paths.justificationSettingsFile, {})
}

function writeAll(data: JustificationData): void {
  writeJsonFile(paths.justificationSettingsFile, data)
}

export function getSettings(guildId: string): GuildJustificationSettings {
  return readAll()[guildId] ?? EMPTY
}

/** Muda um dos 4 canais configuráveis — mudar um canal de publicação limpa o id da mensagem guardada, para uma nova mensagem ser publicada de raiz nesse canal. */
export function setChannel(
  guildId: string,
  kind: JustificationChannelKind,
  channelId: string | null,
  channelName: string | null,
): GuildJustificationSettings {
  const data = readAll()
  const guild: GuildJustificationSettings = { ...(data[guildId] ?? EMPTY) }

  if (kind === 'fixedPost') {
    guild.fixedPostChannelId = channelId
    guild.fixedPostChannelName = channelName
    guild.fixedPostMessageId = null
  } else if (kind === 'dailyPost') {
    guild.dailyPostChannelId = channelId
    guild.dailyPostChannelName = channelName
    guild.dailyPostMessageId = null
  } else if (kind === 'fixedLog') {
    guild.fixedLogChannelId = channelId
    guild.fixedLogChannelName = channelName
  } else {
    guild.dailyLogChannelId = channelId
    guild.dailyLogChannelName = channelName
  }

  data[guildId] = guild
  writeAll(data)
  return guild
}

export function getPostMessageId(guildId: string, type: 'fixed' | 'daily'): string | null {
  const guild = readAll()[guildId]
  if (!guild) return null
  return type === 'fixed' ? guild.fixedPostMessageId : guild.dailyPostMessageId
}

export function setPostMessageId(guildId: string, type: 'fixed' | 'daily', messageId: string | null): void {
  const data = readAll()
  const guild: GuildJustificationSettings = { ...(data[guildId] ?? EMPTY) }
  if (type === 'fixed') guild.fixedPostMessageId = messageId
  else guild.dailyPostMessageId = messageId
  data[guildId] = guild
  writeAll(data)
}
