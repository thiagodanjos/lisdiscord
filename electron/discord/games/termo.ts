import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { addCoins } from '../../store/economy'
import { updateFromModal } from './interactionUtils'

export const TERMO_WORDS = [
  'AMIGO', 'BANCO', 'CAMPO', 'CARRO', 'CHUVA', 'DENTE', 'FESTA', 'FOLHA', 'FORTE', 'FRUTA',
  'GRITO', 'HOTEL', 'JOGOS', 'LIVRO', 'MAGIA', 'MANGA', 'MARCO', 'MUNDO', 'NOITE', 'NUVEM',
  'PAPEL', 'PEDRA', 'PEIXE', 'PORTA', 'PRAIA', 'PRATO', 'PRETO', 'PRIMO', 'SONHO', 'SORTE',
  'TEMPO', 'TERRA', 'TIGRE', 'TORRE', 'TREVO', 'VENTO', 'VERDE', 'VIDRO', 'ZEBRA', 'BOLSA',
  'CAIXA', 'CANTO', 'CERTO', 'CINCO', 'CLUBE', 'COBRA', 'CORPO', 'FALSO', 'FILME', 'GARFO',
  'GOLPE', 'JUSTO', 'LAGOA', 'LETRA', 'LOUCO', 'MAIOR', 'MENOR', 'METRO', 'MOLHO', 'NOBRE',
  'OLHAR', 'OUVIR', 'PALCO', 'PLANO', 'PONTE', 'POUCO', 'QUEDA', 'RAIVA', 'RITMO', 'ROUPA',
  'SELVA', 'SENHA', 'SINAL', 'TARDE', 'TECLA', 'TELHA', 'TROCO', 'TURMA', 'VALOR', 'VELHO',
  'CALMA', 'DISCO', 'GENTE', 'HUMOR', 'LENTO', 'NINHO', 'PULGA', 'RISCO', 'SALTO', 'VIVER',
]

const MAX_TRIES = 6
const REWARDS = [200, 150, 120, 90, 70, 50]
const IDLE_MS = 5 * 60_000
const MODAL_TIMEOUT_MS = 2 * 60_000

type Mark = 'hit' | 'near' | 'miss'

export function termoCommandDef() {
  return new SlashCommandBuilder().setName('termo').setDescription('Adivinha a palavra de 5 letras em 6 tentativas (estilo Wordle)').toJSON()
}

export function normalizeGuess(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

/** Pontua como o Wordle: primeiro as letras certas no sítio, depois as que existem noutro sítio (sem contar letras a mais). */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(5).fill('miss')
  const remaining: Record<string, number> = {}
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) marks[i] = 'hit'
    else remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1
  }
  for (let i = 0; i < 5; i++) {
    if (marks[i] === 'hit') continue
    if ((remaining[guess[i]] ?? 0) > 0) {
      marks[i] = 'near'
      remaining[guess[i]] -= 1
    }
  }
  return marks
}

const SQUARE: Record<Mark, string> = { hit: '🟩', near: '🟨', miss: '⬛' }

export async function runTermo(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId ?? 'dm'
  const answer = TERMO_WORDS[Math.floor(Math.random() * TERMO_WORDS.length)]
  const guesses: { word: string; marks: Mark[] }[] = []
  let notice = ''

  const board = (): string => {
    const lines = guesses.map((g) => `${g.marks.map((m) => SQUARE[m]).join('')}  \`${g.word.split('').join(' ')}\``)
    for (let i = guesses.length; i < MAX_TRIES; i++) lines.push('⬜⬜⬜⬜⬜')
    return lines.join('\n')
  }

  const missing = (): string => {
    const out = new Set<string>()
    for (const g of guesses) g.word.split('').forEach((l, i) => g.marks[i] === 'miss' && !answer.includes(l) && out.add(l))
    return [...out].sort().join(' ') || '—'
  }

  const embed = (color = 0x22e584, footer?: string) =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🟩 Termo')
      .setDescription(`${board()}${notice ? `\n\n${notice}` : ''}`)
      .addFields({ name: 'Letras que não existem', value: missing() })
      .setFooter({ text: footer ?? `Tentativa ${guesses.length + 1}/${MAX_TRIES} · 🟩 lugar certo · 🟨 existe noutro sítio · ⬛ não existe` })

  const row = () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('termo:guess').setLabel('Tentar palavra').setEmoji('✍️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('termo:quit').setLabel('Desistir').setStyle(ButtonStyle.Secondary),
    )

  const reply = await interaction.reply({ embeds: [embed()], components: [row()], withResponse: true })
  const message = reply.resource?.message
  if (!message) return

  const collector = message.createMessageComponentCollector({ idle: IDLE_MS })
  collector.on('collect', async (click) => {
    try {
      if (click.user.id !== interaction.user.id) {
        await click.reply({ content: 'Este jogo não é teu — usa `/termo` para começares o teu.', ephemeral: true })
        return
      }
      if (click.customId === 'termo:quit') {
        collector.stop('quit')
        await click.update({ embeds: [embed(0x99aab5, `Desististe — a palavra era ${answer}.`)], components: [] })
        return
      }
      const modalId = `termo:modal:${Date.now()}`
      await click.showModal(
        new ModalBuilder()
          .setCustomId(modalId)
          .setTitle(`Tentativa ${guesses.length + 1} de ${MAX_TRIES}`)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId('palavra').setLabel('Palavra de 5 letras').setStyle(TextInputStyle.Short).setMinLength(5).setMaxLength(8).setRequired(true),
            ),
          ),
      )
      const submitted = await click.awaitModalSubmit({ time: MODAL_TIMEOUT_MS, filter: (m) => m.customId === modalId }).catch(() => null)
      if (!submitted) return

      const word = normalizeGuess(submitted.fields.getTextInputValue('palavra'))
      if (word.length !== 5) {
        notice = '⚠️ Escreve uma palavra com exatamente 5 letras.'
        await updateFromModal(submitted, interaction, { embeds: [embed()], components: [row()] })
        return
      }
      notice = ''
      guesses.push({ word, marks: scoreGuess(word, answer) })

      if (word === answer) {
        const reward = REWARDS[guesses.length - 1]
        addCoins(guildId, interaction.user.id, interaction.user.tag, reward)
        collector.stop('won')
        await updateFromModal(submitted, interaction, {
          embeds: [embed(0x22e584, `🎉 Acertaste em ${guesses.length}/${MAX_TRIES}! +${reward} moedas.`)],
          components: [],
        })
        return
      }
      if (guesses.length >= MAX_TRIES) {
        collector.stop('lost')
        await updateFromModal(submitted, interaction, { embeds: [embed(0xf43f5e, `Acabaram as tentativas — a palavra era ${answer}.`)], components: [] })
        return
      }
      await updateFromModal(submitted, interaction, { embeds: [embed()], components: [row()] })
    } catch (err) {
      console.error('[termo] Erro:', err)
    }
  })
  collector.on('end', async (_c, reason) => {
    if (reason === 'idle') {
      await interaction.editReply({ embeds: [embed(0x99aab5, `⏱️ Tempo esgotado — a palavra era ${answer}.`)], components: [] }).catch(() => undefined)
    }
  })
}
