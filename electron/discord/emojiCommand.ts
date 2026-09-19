import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from 'discord.js'
import { addBotEmoji, validateEmojiName } from './botEmojis'

const CUSTOM_EMOJI_PATTERN = /^<(a?):(\w{2,32}):(\d{15,21})>$/

export function addEmojiBotCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('addemojibot')
    .setDescription('Adiciona uma imagem à biblioteca de emojis do bot, para usar nos embeds')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName('nome').setDescription('Nome do emoji (letras, números, _ — 2 a 32 caracteres)').setRequired(true))
    .addAttachmentOption((o) => o.setName('imagem').setDescription('Imagem do emoji (PNG, JPG ou GIF, até 256 KB)').setRequired(true))
    .toJSON()
}

export async function handleAddEmojiBotCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'addemojibot') return false

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ Precisas de permissão de "Gerir servidor" para usar este comando.', ephemeral: true })
    return true
  }

  const name = interaction.options.getString('nome', true)
  const attachment = interaction.options.getAttachment('imagem', true)
  await interaction.deferReply({ ephemeral: true })

  try {
    const emoji = await addBotEmoji(interaction.client, name, attachment.url)
    const tag = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`
    await interaction.editReply({ content: `✅ Emoji adicionado à biblioteca do bot: ${tag}` })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[addemojibot] Falha a adicionar emoji:', err)
    await interaction.editReply({ content: `❌ Não foi possível adicionar o emoji: ${message}` })
  }
  return true
}

export function copyEmojiCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('copiaremoji')
    .setDescription('Copia um emoji de qualquer servidor (mesmo onde o bot não está) para a biblioteca do bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o
        .setName('emoji')
        .setDescription('Escreve : e o nome do emoji para aparecer sugerido, e escolhe-o (ou cola o código completo)')
        .setRequired(true),
    )
    .addStringOption((o) => o.setName('nome').setDescription('Nome novo (opcional) — por omissão usa o nome original do emoji').setRequired(false))
    .toJSON()
}

export async function handleCopyEmojiCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'copiaremoji') return false

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ Precisas de permissão de "Gerir servidor" para usar este comando.', ephemeral: true })
    return true
  }

  const raw = interaction.options.getString('emoji', true).trim()
  const customName = interaction.options.getString('nome')
  await interaction.deferReply({ ephemeral: true })

  const match = CUSTOM_EMOJI_PATTERN.exec(raw)
  if (!match) {
    await interaction.editReply({
      content:
        '❌ Isso não parece um emoji personalizado. Escreve `:` seguido do nome do emoji na caixa de opções — a Discord sugere-o, escolhe-o na lista — ou cola o código completo, tipo `<:nome:123456789012345678>`.',
    })
    return true
  }

  const [, animatedFlag, parsedName, id] = match
  const name = customName?.trim() || parsedName

  try {
    validateEmojiName(name)
    const cdnUrl = `https://cdn.discordapp.com/emojis/${id}.${animatedFlag === 'a' ? 'gif' : 'png'}`
    const emoji = await addBotEmoji(interaction.client, name, cdnUrl)
    const tag = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`
    await interaction.editReply({ content: `✅ Emoji copiado para a biblioteca do bot: ${tag}` })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[copiaremoji] Falha a copiar emoji:', err)
    await interaction.editReply({ content: `❌ Não foi possível copiar o emoji: ${message}` })
  }
  return true
}
