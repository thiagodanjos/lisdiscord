import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from 'discord.js'
import { addBotEmoji } from './botEmojis'

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
