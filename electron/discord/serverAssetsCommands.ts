import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Guild,
  GuildPremiumTier,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from 'discord.js'

const MAX_EMOJI_BYTES = 256 * 1024
const MAX_STICKER_BYTES = 512 * 1024
const MAX_EMOTES_PER_COMMAND = 5
const EMOJI_TAG = /<(a?):(\w{2,32}):(\d{15,21})>/g
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export function addEmoteServerCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('addemoteserver')
    .setDescription('Adiciona emojis a este servidor — copiados de outro servidor ou a partir de uma imagem/GIF')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption((o) => o.setName('emote').setDescription(`Emote(s) de outro servidor — até ${MAX_EMOTES_PER_COMMAND} de uma vez`))
    .addAttachmentOption((o) => o.setName('imagem').setDescription('Ou uma imagem/GIF (PNG, JPG, GIF, WEBP — até 256 KB)'))
    .addStringOption((o) => o.setName('nome').setDescription('Nome do emoji (opcional)').setMinLength(2).setMaxLength(32))
    .toJSON()
}

export function addStickerCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('addsticker')
    .setDescription('Cria uma figurinha (sticker) neste servidor a partir de uma imagem/GIF')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addAttachmentOption((o) => o.setName('imagem').setDescription('PNG, GIF ou APNG — até 512 KB (ideal 320×320)').setRequired(true))
    .addStringOption((o) => o.setName('nome').setDescription('Nome da figurinha (2–30 letras)').setRequired(true).setMinLength(2).setMaxLength(30))
    .addStringOption((o) => o.setName('emoji').setDescription('Emoji relacionado, usado nas sugestões (ex.: 😂)'))
    .toJSON()
}

/** Nome válido para um emoji da Discord: 2–32 caracteres, só letras, números e _. */
export function sanitizeEmojiName(raw: string): string {
  const cleaned = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32)
  return cleaned.length >= 2 ? cleaned : `emoji_${cleaned || 'novo'}`.slice(0, 32)
}

export function parseEmoteTags(raw: string): { animated: boolean; name: string; id: string }[] {
  const seen = new Set<string>()
  const out: { animated: boolean; name: string; id: string }[] = []
  for (const m of raw.matchAll(EMOJI_TAG)) {
    if (seen.has(m[3])) continue
    seen.add(m[3])
    out.push({ animated: m[1] === 'a', name: m[2], id: m[3] })
  }
  return out
}

/** Quantos emojis (estáticos e animados, contados à parte) o servidor aguenta pelo nível de boost. */
function emojiLimit(guild: Guild): number {
  return { [GuildPremiumTier.None]: 50, [GuildPremiumTier.Tier1]: 100, [GuildPremiumTier.Tier2]: 150, [GuildPremiumTier.Tier3]: 250 }[guild.premiumTier] ?? 50
}

export async function handleServerAssetsCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'addemoteserver' && interaction.commandName !== 'addsticker') return false
  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este comando só funciona dentro de um servidor.', ephemeral: true })
    return true
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
    await interaction.reply({ embeds: [errorEmbed('Precisas da permissão **Gerir expressões** para adicionar emojis e figurinhas.')], ephemeral: true })
    return true
  }
  const me = guild.members.me ?? (await guild.members.fetchMe())
  if (!me.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    await interaction.reply({ embeds: [errorEmbed('O bot precisa da permissão **Gerir expressões** neste servidor.')], ephemeral: true })
    return true
  }

  if (interaction.commandName === 'addsticker') await runAddSticker(interaction, guild)
  else await runAddEmote(interaction, guild)
  return true
}

async function runAddEmote(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const emoteRaw = interaction.options.getString('emote')?.trim() ?? ''
  const image = interaction.options.getAttachment('imagem')
  const customName = interaction.options.getString('nome')?.trim()

  const tags = emoteRaw ? parseEmoteTags(emoteRaw) : []
  if (!image && tags.length === 0) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          emoteRaw
            ? 'Não encontrei nenhum emote personalizado aí. Escreve `:` e o nome para a Discord sugerir o emote (tens de o conseguir usar), ou cola o código `<:nome:id>`.'
            : 'Manda um **emote** de outro servidor (opção `emote`) ou uma **imagem/GIF** (opção `imagem`).',
        ),
      ],
      ephemeral: true,
    })
    return
  }
  if (image && (!image.contentType || !IMAGE_TYPES.includes(image.contentType.split(';')[0]))) {
    await interaction.reply({ embeds: [errorEmbed('A imagem tem de ser PNG, JPG, GIF ou WEBP.')], ephemeral: true })
    return
  }
  if (image && image.size > MAX_EMOJI_BYTES) {
    await interaction.reply({ embeds: [errorEmbed(`A imagem tem ${Math.round(image.size / 1024)} KB — o máximo para emojis é 256 KB.`)], ephemeral: true })
    return
  }

  await interaction.deferReply()

  const sources = image
    ? [{ url: image.url, name: sanitizeEmojiName(customName || image.name || 'emoji'), animated: image.contentType?.includes('gif') ?? false }]
    : tags.slice(0, MAX_EMOTES_PER_COMMAND).map((t) => ({
        url: `https://cdn.discordapp.com/emojis/${t.id}.${t.animated ? 'gif' : 'png'}`,
        name: sanitizeEmojiName(tags.length === 1 && customName ? customName : t.name),
        animated: t.animated,
      }))

  const added: string[] = []
  const failed: string[] = []
  for (const src of sources) {
    try {
      const emoji = await guild.emojis.create({ attachment: src.url, name: src.name, reason: `Adicionado por ${interaction.user.tag} (/addemoteserver)` })
      added.push(`${emoji} \`:${emoji.name}:\``)
    } catch (err) {
      failed.push(`\`${src.name}\` — ${friendlyDiscordError(err)}`)
    }
  }

  const limit = emojiLimit(guild)
  const emojis = await guild.emojis.fetch().catch(() => guild.emojis.cache)
  const staticCount = emojis.filter((e) => !e.animated).size
  const animatedCount = emojis.filter((e) => e.animated).size

  const embed = new EmbedBuilder()
    .setColor(added.length > 0 ? 0x22e584 : 0xf43f5e)
    .setTitle(added.length > 0 ? `✅ ${added.length} emoji(s) adicionado(s)` : '❌ Nenhum emoji adicionado')
    .setDescription([...added, ...(failed.length ? ['', '**Falharam:**', ...failed] : [])].join('\n') || '—')
    .setFooter({ text: `Espaço: ${staticCount}/${limit} estáticos · ${animatedCount}/${limit} animados` })
  if (tags.length > MAX_EMOTES_PER_COMMAND) embed.addFields({ name: 'Nota', value: `Só copio ${MAX_EMOTES_PER_COMMAND} de cada vez — usa o comando outra vez para os restantes.` })
  await interaction.editReply({ embeds: [embed] })
}

async function runAddSticker(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const image = interaction.options.getAttachment('imagem', true)
  const name = interaction.options.getString('nome', true).trim()
  const tag = interaction.options.getString('emoji')?.trim() || '⭐'
  const type = image.contentType?.split(';')[0] ?? ''

  if (!['image/png', 'image/apng', 'image/gif'].includes(type)) {
    await interaction.reply({ embeds: [errorEmbed('A figurinha tem de ser PNG, APNG ou GIF.')], ephemeral: true })
    return
  }
  if (image.size > MAX_STICKER_BYTES) {
    await interaction.reply({ embeds: [errorEmbed(`A imagem tem ${Math.round(image.size / 1024)} KB — o máximo para figurinhas é 512 KB.`)], ephemeral: true })
    return
  }

  await interaction.deferReply()
  try {
    const sticker = await guild.stickers.create({ file: image.url, name, tags: tag, reason: `Adicionada por ${interaction.user.tag} (/addsticker)` })
    const embed = new EmbedBuilder()
      .setColor(0x22e584)
      .setTitle('✅ Figurinha criada')
      .setDescription(`**${sticker.name}** já está disponível no servidor.`)
      .setThumbnail(sticker.url)
    await interaction.editReply({ embeds: [embed] })
  } catch (err) {
    await interaction.editReply({ embeds: [errorEmbed(`Não consegui criar a figurinha: ${friendlyDiscordError(err)}`)] })
  }
}

function friendlyDiscordError(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? (err as { code: unknown }).code : null
  if (code === 30008) return 'o servidor já não tem espaço para mais emojis.'
  if (code === 30039) return 'o servidor já não tem espaço para mais figurinhas.'
  if (code === 50035) return 'imagem ou nome inválido (tamanho/formato).'
  if (code === 50013) return 'o bot não tem permissão.'
  return err instanceof Error ? err.message : String(err)
}

function errorEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xf43f5e).setTitle('❌ Não foi possível').setDescription(text)
}
