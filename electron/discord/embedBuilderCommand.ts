import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Guild,
  type MessageActionRowComponentBuilder,
  type MessageComponentInteraction,
  ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { emptyEmbedDraft, hexToInt, type MessageDraft, messageDraftFromJson, messageDraftToJson } from '../../shared/messageJson'
import type { EmbedDraft } from '../../shared/types'
import { buildEmbedFromDraft, embedHasContent } from './embedTemplate'
import { sendEmbedMessage } from './messaging'

const IDLE_MS = 14 * 60_000 // o token de cada clique vale 15 min — acaba antes para ainda conseguir fechar a sessão
const MODAL_TIMEOUT_MS = 10 * 60_000
const PANEL_COLOR = 0xa855f7
const PREVIEW_PLACEHOLDER = '**Embed prévia**, utilize os **botões** para alterar o que desejar.'

export function embedBuilderCommandDef(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Cria e envia um embed/webhook personalizado, passo a passo, com pré-visualização')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON()
}

type TextOption = {
  label: string
  description: string
  emoji: string
  /** Título da janela (máx. 45 caracteres). */
  modalTitle: string
  inputLabel: string
  style: TextInputStyle
  max: number
  placeholder: string
  get: (s: State) => string
  set: (s: State, value: string) => string | null // devolve uma mensagem de erro, ou null se ficou guardado
}

interface Payload {
  content: string
  embeds: EmbedBuilder[]
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[]
}

interface State extends MessageDraft {
  channelId: string | null
}

const url = (value: string): boolean => value === '' || /^https?:\/\/\S+$/i.test(value)

const TEXT_OPTIONS: Record<string, TextOption> = {
  conteudo: {
    label: 'Definir Conteúdo',
    description: 'Defina o conteúdo da mensagem',
    emoji: '📝',
    modalTitle: 'Conteúdo da mensagem',
    inputLabel: 'Texto (fora do embed)',
    style: TextInputStyle.Paragraph,
    max: 2000,
    placeholder: 'Texto normal que aparece por cima do embed — pode ter menções e emojis.',
    get: (s) => s.content,
    set: (s, v) => ((s.content = v), null),
  },
  titulo: {
    label: 'Definir Título',
    description: 'Defina o título do embed',
    emoji: '✏️',
    modalTitle: 'Título do embed',
    inputLabel: 'Título',
    style: TextInputStyle.Short,
    max: 256,
    placeholder: 'Ex.: 📢 Aviso importante',
    get: (s) => s.embed.title,
    set: (s, v) => ((s.embed.title = v), null),
  },
  descricao: {
    label: 'Definir Descrição',
    description: 'Defina a descrição do embed',
    emoji: '📜',
    modalTitle: 'Descrição do embed',
    inputLabel: 'Descrição',
    style: TextInputStyle.Paragraph,
    max: 4000,
    placeholder: 'Aceita **negrito**, *itálico*, __sublinhado__, [links](https://…) e emojis.',
    get: (s) => s.embed.description,
    set: (s, v) => ((s.embed.description = v), null),
  },
  cor: {
    label: 'Definir Cor',
    description: 'Defina a cor do embed',
    emoji: '🎨',
    modalTitle: 'Cor do embed',
    inputLabel: 'Cor em hexadecimal',
    style: TextInputStyle.Short,
    max: 7,
    placeholder: '#5865F2',
    get: (s) => s.embed.color,
    set: (s, v) => {
      const normalized = v.startsWith('#') ? v : `#${v}`
      if (v && hexToInt(normalized) === null) return 'Cor inválida — usa o formato hexadecimal, ex.: `#F0B232`.'
      s.embed.color = v ? normalized.toUpperCase() : '#5865F2'
      return null
    },
  },
  thumbnail: {
    label: 'Definir Thumbnail',
    description: 'Defina a thumbnail do embed',
    emoji: '🖼️',
    modalTitle: 'Thumbnail do embed',
    inputLabel: 'URL da imagem pequena (canto direito)',
    style: TextInputStyle.Short,
    max: 1000,
    placeholder: 'https://…',
    get: (s) => s.embed.thumbnailUrl,
    set: (s, v) => (url(v) ? ((s.embed.thumbnailUrl = v), null) : 'A thumbnail tem de ser um link que comece por http:// ou https://.'),
  },
  imagem: {
    label: 'Definir Imagem',
    description: 'Defina a imagem do embed',
    emoji: '🌄',
    modalTitle: 'Imagem do embed',
    inputLabel: 'URL da imagem grande',
    style: TextInputStyle.Short,
    max: 1000,
    placeholder: 'https://…',
    get: (s) => s.embed.imageUrl,
    set: (s, v) => (url(v) ? ((s.embed.imageUrl = v), null) : 'A imagem tem de ser um link que comece por http:// ou https://.'),
  },
  autor: {
    label: 'Definir Nome do Autor',
    description: 'Defina o nome do autor do embed',
    emoji: '👤',
    modalTitle: 'Nome do autor',
    inputLabel: 'Nome do autor',
    style: TextInputStyle.Short,
    max: 256,
    placeholder: 'Aparece no topo do embed, em pequeno',
    get: (s) => s.embed.authorName,
    set: (s, v) => ((s.embed.authorName = v), null),
  },
  autorIcone: {
    label: 'Definir Ícone do Autor',
    description: 'Defina o ícone do autor do embed',
    emoji: '😀',
    modalTitle: 'Ícone do autor',
    inputLabel: 'URL do ícone do autor',
    style: TextInputStyle.Short,
    max: 1000,
    placeholder: 'https://…',
    get: (s) => s.embed.authorIconUrl ?? '',
    set: (s, v) => (url(v) ? ((s.embed.authorIconUrl = v), null) : 'O ícone tem de ser um link que comece por http:// ou https://.'),
  },
  rodape: {
    label: 'Definir Rodapé',
    description: 'Defina o texto do rodapé do embed',
    emoji: 'ℹ️',
    modalTitle: 'Rodapé do embed',
    inputLabel: 'Texto do rodapé',
    style: TextInputStyle.Short,
    max: 2048,
    placeholder: 'Texto simples, sem formatação',
    get: (s) => s.embed.footer,
    set: (s, v) => ((s.embed.footer = v), null),
  },
  rodapeIcone: {
    label: 'Definir Ícone do Rodapé',
    description: 'Defina o ícone do rodapé do embed',
    emoji: '🔗',
    modalTitle: 'Ícone do rodapé',
    inputLabel: 'URL do ícone do rodapé',
    style: TextInputStyle.Short,
    max: 1000,
    placeholder: 'https://…',
    get: (s) => s.embed.footerIconUrl ?? '',
    set: (s, v) => (url(v) ? ((s.embed.footerIconUrl = v), null) : 'O ícone tem de ser um link que comece por http:// ou https://.'),
  },
  webhookNome: {
    label: 'Definir Nome do Webhook',
    description: 'Defina o nome da webhook',
    emoji: '🤖',
    modalTitle: 'Nome da webhook',
    inputLabel: 'Nome com que a mensagem aparece',
    style: TextInputStyle.Short,
    max: 80,
    placeholder: 'Ex.: Mov Call | CDO',
    get: (s) => s.webhookName,
    set: (s, v) => (/discord|clyde/i.test(v) ? 'A Discord não deixa usar "discord" nem "clyde" no nome da webhook.' : ((s.webhookName = v), null)),
  },
  webhookIcone: {
    label: 'Definir Ícone do Webhook',
    description: 'Defina o ícone da webhook',
    emoji: '🎭',
    modalTitle: 'Ícone da webhook',
    inputLabel: 'URL da foto da webhook',
    style: TextInputStyle.Short,
    max: 1000,
    placeholder: 'https://…',
    get: (s) => s.webhookAvatarUrl,
    set: (s, v) => (url(v) ? ((s.webhookAvatarUrl = v), null) : 'O ícone tem de ser um link que comece por http:// ou https://.'),
  },
}

/** Ordem do menu — igual à do pedido: canal, textos/imagens, webhook, exportar/importar, e extras no fim. */
const MENU: { value: string; label: string; description: string; emoji: string }[] = [
  { value: 'canal', label: 'Definir Chat/Canal', description: 'Defina o canal onde o embed/webhook será enviado', emoji: '#️⃣' },
  ...['conteudo', 'titulo', 'descricao', 'cor', 'thumbnail', 'imagem', 'autor', 'autorIcone', 'rodape', 'rodapeIcone', 'webhookNome', 'webhookIcone'].map(
    (key) => ({ value: key, label: TEXT_OPTIONS[key].label, description: TEXT_OPTIONS[key].description, emoji: TEXT_OPTIONS[key].emoji }),
  ),
  { value: 'exportar', label: 'Exportar Configuração', description: 'Exporte a configuração atual do embed em JSON', emoji: '📤' },
  { value: 'importar', label: 'Importar Configuração', description: 'Importe uma configuração de embed em JSON', emoji: '📥' },
  { value: 'campo', label: 'Adicionar Campo', description: 'Adicione um campo (nome + valor) ao embed', emoji: '➕' },
  { value: 'limparCampos', label: 'Remover Campos', description: 'Remova todos os campos do embed', emoji: '🧹' },
  { value: 'hora', label: 'Mostrar/Esconder Data e Hora', description: 'Mostra a hora de envio no rodapé do embed', emoji: '🕒' },
]

export async function handleEmbedBuilderCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== 'embed') return false

  const guild = interaction.guild
  if (!guild) {
    await interaction.reply({ content: '❌ Este comando só funciona dentro de um servidor.', ephemeral: true })
    return true
  }

  const state: State = {
    channelId: null,
    content: '',
    embed: emptyEmbedDraft({ description: PREVIEW_PLACEHOLDER }),
    webhookName: guild.name.replace(/discord|clyde/gi, '').slice(0, 80),
    webhookAvatarUrl: guild.iconURL({ size: 256 }) ?? interaction.client.user.displayAvatarURL({ size: 256 }),
  }
  let notice = ''
  let pickingChannel = false

  const render = (): Payload => ({
    content: state.content.slice(0, 2000),
    embeds: [panelEmbed(guild, interaction, state, notice), previewEmbed(state.embed)],
    components: pickingChannel ? channelRows() : mainRows(),
  })

  const reply = await interaction.reply({ ...render(), ephemeral: true, withResponse: true })
  const message = reply.resource?.message
  if (!message) return true

  let last: MessageComponentInteraction | ModalSubmitInteraction | null = null
  const collector = message.createMessageComponentCollector({ idle: IDLE_MS, filter: (i) => i.user.id === interaction.user.id })

  collector.on('collect', async (i) => {
    last = i
    try {
      notice = ''

      if (i.isButton() && i.customId === 'embedb:exit') {
        collector.stop('exit')
        await i.update({ content: '', embeds: [new EmbedBuilder().setColor(0x99aab5).setDescription('🚪 Criação de embed cancelada.')], components: [] })
        setTimeout(() => interaction.deleteReply().catch(() => undefined), 3000)
        return
      }

      if (i.isButton() && i.customId === 'embedb:back') {
        pickingChannel = false
        await i.update(render())
        return
      }

      if (i.isChannelSelectMenu() && i.customId === 'embedb:channel') {
        state.channelId = i.values[0] ?? null
        pickingChannel = false
        await i.update(render())
        return
      }

      if (i.isButton() && i.customId === 'embedb:send') {
        if (!state.channelId) {
          notice = '⚠️ Define primeiro o canal em **Definir Chat/Canal**.'
          await i.update(render())
          return
        }
        await i.update({ ...render(), components: [] })
        try {
          const result = await sendEmbedMessage(guild, state.channelId, isPlaceholderOnly(state.embed) ? emptyEmbedDraft() : state.embed, {
            content: state.content,
            webhook: { name: state.webhookName, avatarUrl: state.webhookAvatarUrl },
          })
          collector.stop('sent')
          const done = new EmbedBuilder()
            .setColor(0x3ba55c)
            .setTitle('✅ Mensagem enviada')
            .setDescription(
              `Enviada em <#${state.channelId}>${result.viaWebhook ? ` como **${state.webhookName || 'webhook'}**` : ''}.\n[Ver a mensagem](${result.url})` +
                (result.warning ? `\n\n⚠️ ${result.warning}` : ''),
            )
          await i.editReply({ content: '', embeds: [done], components: [] })
        } catch (err) {
          notice = `❌ Não consegui enviar: ${err instanceof Error ? err.message : String(err)}`
          await i.editReply(render())
        }
        return
      }

      if (!i.isStringSelectMenu() || i.customId !== 'embedb:menu') return
      const choice = i.values[0]

      if (choice === 'canal') {
        pickingChannel = true
        await i.update(render())
        return
      }

      if (choice === 'exportar') {
        const json = messageDraftToJson(stateForExport(state))
        await i.reply({
          ephemeral: true,
          content: json.length <= 1900 ? `📤 Configuração atual — guarda o ficheiro ou copia o JSON:\n\`\`\`json\n${json}\n\`\`\`` : '📤 Configuração atual em anexo.',
          files: [new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: 'embed.json' })],
        })
        // O menu continua com "Exportar" selecionado sem isto — volta a mostrar o painel limpo.
        await interaction.editReply(render()).catch(() => undefined)
        return
      }

      if (choice === 'campo') {
        if (state.embed.fields.length >= 25) {
          notice = '⚠️ Um embed só pode ter 25 campos.'
          await i.update(render())
          return
        }
        const submitted = await askModal(i, 'Novo campo', [
          { id: 'nome', label: 'Nome do campo', style: TextInputStyle.Short, max: 256, value: '', required: true },
          { id: 'valor', label: 'Valor do campo', style: TextInputStyle.Paragraph, max: 1024, value: '', required: true },
          { id: 'inline', label: 'Lado a lado? (sim/não)', style: TextInputStyle.Short, max: 3, value: 'sim', required: false },
        ])
        if (!submitted) return
        last = submitted
        clearPlaceholder(state)
        state.embed.fields.push({
          name: submitted.fields.getTextInputValue('nome').trim(),
          value: submitted.fields.getTextInputValue('valor').trim(),
          inline: !/^n/i.test(submitted.fields.getTextInputValue('inline').trim()),
        })
        await updateModal(submitted, interaction, render())
        return
      }

      if (choice === 'limparCampos') {
        state.embed.fields = []
        notice = '🧹 Campos removidos.'
        await i.update(render())
        return
      }

      if (choice === 'hora') {
        state.embed.timestamp = !state.embed.timestamp
        await i.update(render())
        return
      }

      if (choice === 'importar') {
        const submitted = await askModal(i, 'Importar configuração', [
          { id: 'json', label: 'Cola aqui o JSON exportado', style: TextInputStyle.Paragraph, max: 4000, value: '', required: true },
        ])
        if (!submitted) return
        last = submitted
        try {
          const imported = messageDraftFromJson(submitted.fields.getTextInputValue('json'), state)
          Object.assign(state, imported)
          notice = '📥 Configuração importada.'
        } catch (err) {
          notice = `❌ ${err instanceof Error ? err.message : String(err)}`
        }
        await updateModal(submitted, interaction, render())
        return
      }

      const option = TEXT_OPTIONS[choice]
      if (!option) return
      const current = choice === 'descricao' && isPlaceholderOnly(state.embed) ? '' : option.get(state)
      const submitted = await askModal(i, option.modalTitle, [
        { id: 'valor', label: option.inputLabel, style: option.style, max: option.max, value: current, required: false, placeholder: option.placeholder },
      ])
      if (!submitted) return
      last = submitted
      if (choice !== 'descricao') clearPlaceholder(state)
      const error = option.set(state, submitted.fields.getTextInputValue('valor').trim())
      if (error) notice = `❌ ${error}`
      await updateModal(submitted, interaction, render())
    } catch (err) {
      console.error('[embed] Erro no construtor de embeds:', err)
      notice = `❌ Ocorreu um erro: ${err instanceof Error ? err.message : String(err)}`
      await interaction.editReply(render()).catch(() => undefined)
    }
  })

  collector.on('end', async (_c, reason) => {
    if (reason !== 'idle') return
    const target = last ?? interaction
    await target
      .editReply({ content: '', embeds: [new EmbedBuilder().setColor(0x99aab5).setDescription('⏱️ Sessão expirada — usa /embed outra vez.')], components: [] })
      .catch(() => undefined)
  })

  return true
}

// ==========================================================================
// Visual
// ==========================================================================

function panelEmbed(guild: Guild, interaction: ChatInputCommandInteraction, state: State, notice: string): EmbedBuilder {
  const bot = interaction.client.user
  const contentPreview = state.content.trim() ? `\`${state.content.trim().replace(/`/g, "'").slice(0, 40)}${state.content.trim().length > 40 ? '…' : ''}\`` : '`Nenhum`'
  const description = [
    `- 🎨 **Bem-vindo(a) ao sistema de criação de embed/webhook do ${bot.username}!**`,
    '  - Neste sistema, você pode configurar seu embed do zero e enviar no canal definido. Utilize o **menu abaixo** para configurar.',
    '',
    '- 🔧 **Informações sobre o sistema**:',
    `  - **Canal onde será enviado**: ${state.channelId ? `<#${state.channelId}>` : '`Não definido`'}`,
    `  - **Conteúdo da mensagem**: ${contentPreview}`,
    `  - **Nome da webhook**: \`${state.webhookName || bot.username}\``,
    `  - **Ícone da webhook**: ${state.webhookAvatarUrl ? `[Link](${state.webhookAvatarUrl})` : '`Nenhum`'}`,
    '',
    '👉 Quando estiver pronto, clica em 📨 para enviar ou em 🚪 para sair.',
  ]
  if (notice) description.push('', notice)

  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setAuthor({ name: `Embed/Webhook | ${bot.username}`, iconURL: bot.displayAvatarURL() })
    .setThumbnail(bot.displayAvatarURL({ size: 256 }))
    .setDescription(description.join('\n'))
    .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setTimestamp(new Date())
  return embed
}

function previewEmbed(draft: EmbedDraft): EmbedBuilder {
  const embed = buildEmbedFromDraft(draft)
  return embedHasContent(embed) ? embed : new EmbedBuilder().setColor(0x2b2d31).setDescription(PREVIEW_PLACEHOLDER)
}

function mainRows(): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('embedb:menu')
        .setPlaceholder('Selecione uma opção para personalizar')
        .addOptions(MENU.map((o) => ({ value: o.value, label: o.label, description: o.description, emoji: o.emoji }))),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('embedb:send').setEmoji('📨').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embedb:exit').setEmoji('🚪').setStyle(ButtonStyle.Danger),
    ),
  ]
}

function channelRows(): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('embedb:channel')
        .setPlaceholder('Escolha o canal onde enviar')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('embedb:back').setLabel('Voltar').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    ),
  ]
}

// ==========================================================================
// Auxiliares
// ==========================================================================

interface ModalInput {
  id: string
  label: string
  style: TextInputStyle
  max: number
  value: string
  required: boolean
  placeholder?: string
}

/** Abre uma janela e espera pela resposta — devolve null se a pessoa a fechar sem submeter. */
async function askModal(i: MessageComponentInteraction, title: string, inputs: ModalInput[]): Promise<ModalSubmitInteraction | null> {
  const customId = `embedb:modal:${Date.now()}`
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45))
  for (const input of inputs) {
    const field = new TextInputBuilder()
      .setCustomId(input.id)
      .setLabel(input.label.slice(0, 45))
      .setStyle(input.style)
      .setRequired(input.required)
      .setMaxLength(input.max)
    if (input.placeholder) field.setPlaceholder(input.placeholder.slice(0, 100))
    if (input.value) field.setValue(input.value.slice(0, input.max))
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field))
  }
  await i.showModal(modal)
  return i.awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (m) => m.customId === customId && m.user.id === i.user.id }).catch(() => null)
}

async function updateModal(submitted: ModalSubmitInteraction, parent: ChatInputCommandInteraction, payload: Payload): Promise<void> {
  if (submitted.isFromMessage()) await submitted.update(payload)
  else {
    await submitted.deferUpdate().catch(() => undefined)
    await parent.editReply(payload)
  }
}

/** A descrição inicial é só um aviso — sai assim que alguém mexe noutra parte do embed. */
function isPlaceholderOnly(draft: EmbedDraft): boolean {
  return draft.description === PREVIEW_PLACEHOLDER
}

function clearPlaceholder(state: State): void {
  if (isPlaceholderOnly(state.embed)) state.embed.description = ''
}

function stateForExport(state: State): MessageDraft {
  return { ...state, embed: isPlaceholderOnly(state.embed) ? { ...state.embed, description: '' } : state.embed }
}
