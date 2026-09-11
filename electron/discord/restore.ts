import { ChannelType, type Guild, type OverwriteResolvable } from 'discord.js'
import type { BackupData, ChannelKind, RestoreOptions, RestoreProgressEvent } from '../../shared/types'

const CHANNEL_TYPE_BY_KIND: Record<ChannelKind, ChannelType> = {
  category: ChannelType.GuildCategory,
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  stage: ChannelType.GuildStageVoice,
}

type Progress = (partial: Omit<RestoreProgressEvent, 'backupId' | 'targetGuildId'>) => void

async function downloadImage(url: string | null): Promise<Buffer | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

export async function restoreBackup(
  guild: Guild,
  backup: BackupData,
  options: RestoreOptions,
  report: Progress,
): Promise<void> {
  if (options.wipeExistingChannels) {
    report({ step: 'wipe', message: 'A remover canais existentes…', done: 0, total: 1, level: 'info' })
    const existing = [...guild.channels.cache.values()]
    for (const ch of existing) {
      await ch.delete('LisDiscord: limpeza antes de restaurar backup').catch(() => undefined)
    }
    report({ step: 'wipe', message: `${existing.length} canais removidos.`, done: 1, total: 1, level: 'success' })
  }

  // 1) Cargos — mapeia id-no-backup → id-real-no-servidor, para os overwrites dos canais.
  const roleIdMap = new Map<string, string>()
  roleIdMap.set(
    backup.roles.find((r) => r.isEveryone)?.id ?? '',
    guild.roles.everyone.id,
  )

  if (options.restoreRoles) {
    const toCreate = backup.roles.filter((r) => !r.isEveryone).sort((a, b) => a.position - b.position)
    report({ step: 'roles', message: `A criar ${toCreate.length} cargos…`, done: 0, total: toCreate.length, level: 'info' })

    let done = 0
    for (const role of toCreate) {
      try {
        const created = await guild.roles.create({
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          mentionable: role.mentionable,
          permissions: role.permissions as never,
        })
        roleIdMap.set(role.id, created.id)
      } catch (err) {
        report({ step: 'roles', message: `Falhou o cargo "${role.name}": ${errMsg(err)}`, done, total: toCreate.length, level: 'error' })
      }
      done += 1
      report({ step: 'roles', message: `Cargo "${role.name}" criado.`, done, total: toCreate.length, level: 'success' })
    }

    const everyoneBackup = backup.roles.find((r) => r.isEveryone)
    if (everyoneBackup) {
      await guild.roles.everyone.setPermissions(everyoneBackup.permissions as never).catch(() => undefined)
    }
  }

  // 2) Canais — categorias primeiro, para os outros canais poderem apontar para o parent.
  const categoryIdMap = new Map<string, string>()

  if (options.restoreChannels) {
    const categories = backup.channels.filter((c) => c.kind === 'category').sort((a, b) => a.position - b.position)
    const others = backup.channels.filter((c) => c.kind !== 'category').sort((a, b) => a.position - b.position)
    const total = categories.length + others.length
    let done = 0

    report({ step: 'channels', message: `A criar ${total} canais…`, done, total, level: 'info' })

    for (const cat of categories) {
      try {
        const created = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: resolveOverwrites(cat.permissionOverwrites, roleIdMap),
        })
        categoryIdMap.set(cat.name, created.id)
      } catch (err) {
        report({ step: 'channels', message: `Falhou a categoria "${cat.name}": ${errMsg(err)}`, done, total, level: 'error' })
      }
      done += 1
      report({ step: 'channels', message: `Categoria "${cat.name}" criada.`, done, total, level: 'success' })
    }

    for (const ch of others) {
      try {
        await guild.channels.create({
          name: ch.name,
          type: CHANNEL_TYPE_BY_KIND[ch.kind] as never,
          parent: ch.parentName ? (categoryIdMap.get(ch.parentName) ?? null) : null,
          topic: ch.topic ?? undefined,
          nsfw: ch.nsfw,
          rateLimitPerUser: ch.rateLimitPerUser,
          bitrate: ch.bitrate,
          userLimit: ch.userLimit,
          permissionOverwrites: resolveOverwrites(ch.permissionOverwrites, roleIdMap),
        })
      } catch (err) {
        report({ step: 'channels', message: `Falhou o canal "${ch.name}": ${errMsg(err)}`, done, total, level: 'error' })
      }
      done += 1
      report({ step: 'channels', message: `Canal "${ch.name}" criado.`, done, total, level: 'success' })
    }
  }

  // 3) Emojis
  if (options.restoreEmojis && backup.emojis.length > 0) {
    report({ step: 'emojis', message: `A recriar ${backup.emojis.length} emojis…`, done: 0, total: backup.emojis.length, level: 'info' })
    let done = 0
    for (const emoji of backup.emojis) {
      try {
        const image = await downloadImage(emoji.url)
        if (!image) throw new Error('imagem indisponível')
        await guild.emojis.create({ attachment: image, name: emoji.name })
      } catch (err) {
        report({ step: 'emojis', message: `Falhou o emoji "${emoji.name}": ${errMsg(err)}`, done, total: backup.emojis.length, level: 'error' })
      }
      done += 1
      report({ step: 'emojis', message: `Emoji "${emoji.name}" recriado.`, done, total: backup.emojis.length, level: 'success' })
    }
  }

  // 4) Definições do servidor
  if (options.restoreSettings) {
    report({ step: 'settings', message: 'A aplicar definições do servidor…', done: 0, total: 1, level: 'info' })
    try {
      await guild.setName(backup.settings.name)
      await guild.setVerificationLevel(backup.settings.verificationLevel)
      await guild.setExplicitContentFilter(backup.settings.explicitContentFilter)
      await guild.setDefaultMessageNotifications(backup.settings.defaultMessageNotifications)

      const icon = await downloadImage(backup.settings.iconUrl)
      if (icon) await guild.setIcon(icon).catch(() => undefined)

      if (backup.settings.systemChannelName) {
        const sys = guild.channels.cache.find((c) => c.name === backup.settings.systemChannelName)
        if (sys) await guild.setSystemChannel(sys.id).catch(() => undefined)
      }
      if (backup.settings.afkChannelName) {
        const afk = guild.channels.cache.find((c) => c.name === backup.settings.afkChannelName)
        if (afk) await guild.setAFKChannel(afk.id).catch(() => undefined)
      }
      await guild.setAFKTimeout(backup.settings.afkTimeout as never).catch(() => undefined)

      report({ step: 'settings', message: 'Definições aplicadas.', done: 1, total: 1, level: 'success' })
    } catch (err) {
      report({ step: 'settings', message: `Falhou aplicar definições: ${errMsg(err)}`, done: 1, total: 1, level: 'error' })
    }
  }

  // 5) Banimentos
  if (options.restoreBans && backup.bans.length > 0) {
    report({ step: 'bans', message: `A reaplicar ${backup.bans.length} banimentos…`, done: 0, total: backup.bans.length, level: 'info' })
    let done = 0
    for (const ban of backup.bans) {
      try {
        await guild.members.ban(ban.userId, { reason: ban.reason ?? 'Restaurado via LisDiscord' })
      } catch (err) {
        report({ step: 'bans', message: `Falhou banir ${ban.userTag}: ${errMsg(err)}`, done, total: backup.bans.length, level: 'error' })
      }
      done += 1
      report({ step: 'bans', message: `${ban.userTag} banido.`, done, total: backup.bans.length, level: 'success' })
    }
  }

  report({ step: 'done', message: 'Restauro concluído.', done: 1, total: 1, level: 'success' })
}

function resolveOverwrites(
  overwrites: BackupData['channels'][number]['permissionOverwrites'],
  roleIdMap: Map<string, string>,
): OverwriteResolvable[] {
  const out: OverwriteResolvable[] = []
  for (const ow of overwrites) {
    if (ow.type !== 'role') continue // overwrites de membro específico não são restauradas (o membro pode nem existir no servidor de destino)
    const newId = roleIdMap.get(ow.id)
    if (!newId) continue
    out.push({ id: newId, allow: ow.allow as never, deny: ow.deny as never })
  }
  return out
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
