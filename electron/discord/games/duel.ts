import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Message,
  SlashCommandBuilder,
} from 'discord.js'
import { addCoins, tryCharge } from '../../store/economy'

const MAX_HP = 100
const TURN_SECONDS = 30
const SPECIAL_COOLDOWN_TURNS = 2
const SPECIAL_HIT_CHANCE = 0.8

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

export function duelCommandDef() {
  return new SlashCommandBuilder()
    .setName('duelo')
    .setDescription('Desafia outro jogador para um duelo por turnos, apostando moedas')
    .addUserOption((o) => o.setName('adversario').setDescription('Quem vais desafiar').setRequired(true))
    .addIntegerOption((o) => o.setName('aposta').setDescription('Quantidade a apostar (padrão 30)').setMinValue(0).setMaxValue(2000))
    .toJSON()
}

export async function runDuel(interaction: ChatInputCommandInteraction): Promise<void> {
  const opponentUser = interaction.options.getUser('adversario', true)
  const wager = interaction.options.getInteger('aposta') ?? 30
  const guildId = interaction.guildId ?? 'dm'

  if (opponentUser.bot) {
    await interaction.reply({ content: '❌ Não podes desafiar um bot.', ephemeral: true })
    return
  }
  if (opponentUser.id === interaction.user.id) {
    await interaction.reply({ content: '❌ Não podes desafiar-te a ti mesmo.', ephemeral: true })
    return
  }

  if (wager > 0) {
    const challengerPaid = tryCharge(guildId, interaction.user.id, interaction.user.tag, wager)
    if (!challengerPaid) {
      await interaction.reply({ content: `❌ Não tens ${wager} moedas suficientes para apostar.`, ephemeral: true })
      return
    }
    const opponentPaid = tryCharge(guildId, opponentUser.id, opponentUser.tag, wager)
    if (!opponentPaid) {
      addCoins(guildId, interaction.user.id, interaction.user.tag, wager)
      await interaction.reply({ content: `❌ ${opponentUser.username} não tem moedas suficientes para aceitar esta aposta.`, ephemeral: true })
      return
    }
  }

  const players = [interaction.user, opponentUser]
  const hp = [MAX_HP, MAX_HP]
  const defending = [false, false]
  const specialCooldown = [0, 0]
  let turn = 0

  function hpBar(value: number): string {
    const filled = Math.round((value / MAX_HP) * 10)
    return '🟩'.repeat(Math.max(0, filled)) + '⬛'.repeat(Math.max(0, 10 - filled)) + ` ${Math.max(0, value)}/${MAX_HP}`
  }

  function buildEmbed(status: string, color: number): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle('⚔️ Duelo')
      .setDescription(`**${players[0].username}**\n${hpBar(hp[0])}\n\n**${players[1].username}**\n${hpBar(hp[1])}`)
      .setFooter({ text: `${wager > 0 ? `Aposta: ${wager * 2} moedas no total · ` : ''}${status}` })
  }

  function buildRow(idx: number): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('duel:attack').setLabel('Atacar').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
      new ButtonBuilder().setCustomId('duel:defend').setLabel('Defender').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
      new ButtonBuilder()
        .setCustomId('duel:special')
        .setLabel('Ataque Especial')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✨')
        .setDisabled(specialCooldown[idx] > 0),
    )
  }

  const reply = await interaction.reply({
    embeds: [buildEmbed(`Vez de ${players[0].username}`, 0x5865f2)],
    components: [buildRow(0)],
    withResponse: true,
  })
  const message = reply.resource?.message
  if (!message) return

  async function settle(winnerIdx: number | null): Promise<void> {
    if (winnerIdx !== null && wager > 0) {
      addCoins(guildId, players[winnerIdx].id, players[winnerIdx].tag, wager * 2)
    }
  }

  await new Promise<void>((resolve) => {
    async function refundAndCancel(reason: string): Promise<void> {
      if (wager > 0) {
        addCoins(guildId, players[0].id, players[0].tag, wager)
        addCoins(guildId, players[1].id, players[1].tag, wager)
      }
      await interaction.editReply({ embeds: [buildEmbed(reason, 0xed4245)], components: [] }).catch(() => undefined)
      resolve()
    }

    async function nextTurn(msg: Message): Promise<void> {
      let click
      try {
        click = await msg.awaitMessageComponent({
          time: TURN_SECONDS * 1000,
          filter: (i) => i.user.id === players[turn].id,
        })
      } catch {
        await refundAndCancel('⏱️ Tempo esgotado — duelo cancelado, apostas devolvidas.')
        return
      }

      try {
        const target = turn === 0 ? 1 : 0
        let status = ''

        if (click.customId === 'duel:attack') {
          let damage = randomInt(12, 22)
          if (defending[target]) {
            damage = Math.round(damage / 2)
            defending[target] = false
            status = `${players[turn].username} atacou! ${players[target].username} defendeu-se e sofreu apenas ${damage} de dano.`
          } else {
            status = `${players[turn].username} atacou e causou ${damage} de dano!`
          }
          hp[target] = Math.max(0, hp[target] - damage)
        } else if (click.customId === 'duel:defend') {
          defending[turn] = true
          hp[turn] = Math.min(MAX_HP, hp[turn] + 5)
          status = `${players[turn].username} defendeu-se e recuperou 5 de vida.`
        } else {
          if (SPECIAL_HIT_CHANCE > Math.random()) {
            let damage = randomInt(20, 32)
            if (defending[target]) {
              damage = Math.round(damage / 2)
              defending[target] = false
            }
            hp[target] = Math.max(0, hp[target] - damage)
            status = `✨ ${players[turn].username} acertou um Ataque Especial e causou ${damage} de dano!`
          } else {
            status = `✨ ${players[turn].username} tentou um Ataque Especial... e falhou!`
          }
          specialCooldown[turn] = SPECIAL_COOLDOWN_TURNS
        }

        if (hp[target] <= 0) {
          await settle(turn)
          await click.update({ embeds: [buildEmbed(`🏆 ${players[turn].username} venceu o duelo!`, 0x3ba55c)], components: [] })
          resolve()
          return
        }

        turn = target
        if (specialCooldown[turn] > 0) specialCooldown[turn] -= 1

        await click.update({ embeds: [buildEmbed(`${status} Vez de ${players[turn].username}.`, 0x5865f2)], components: [buildRow(turn)] })
        await nextTurn(msg)
      } catch (err) {
        console.error('Erro no duelo:', err)
        await refundAndCancel('⚠️ Ocorreu um erro inesperado — duelo cancelado, apostas devolvidas.')
      }
    }

    void nextTurn(message)
  })
}
