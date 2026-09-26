import { type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js'

export function shipCommandDef() {
  return new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Calcula a compatibilidade entre duas pessoas 💘')
    .addUserOption((o) => o.setName('pessoa1').setDescription('Primeira pessoa').setRequired(true))
    .addUserOption((o) => o.setName('pessoa2').setDescription('Segunda pessoa (por omissão, tu)'))
    .toJSON()
}

/** Sempre o mesmo resultado para o mesmo par, seja qual for a ordem — não dá para "rodar" até sair 100%. */
export function shipScore(idA: string, idB: string): number {
  const key = [idA, idB].sort().join(':')
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 101
}

export function shipName(a: string, b: string): string {
  const clean = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '') || s
  const x = clean(a)
  const y = clean(b)
  return x.slice(0, Math.ceil(x.length / 2)) + y.slice(Math.floor(y.length / 2))
}

function verdict(score: number): string {
  if (score >= 95) return '💍 Almas gémeas. Marquem já a data!'
  if (score >= 80) return '💞 Casal perfeito, sem dúvida.'
  if (score >= 60) return '💘 Há química aqui…'
  if (score >= 40) return '🙂 Podia dar certo, com esforço.'
  if (score >= 20) return '😬 Melhor ficar pela amizade.'
  return '💔 Nem com muita sorte.'
}

export async function runShip(interaction: ChatInputCommandInteraction): Promise<void> {
  const a = interaction.options.getUser('pessoa1', true)
  const b = interaction.options.getUser('pessoa2') ?? interaction.user
  const score = a.id === b.id ? 100 : shipScore(a.id, b.id)
  const filled = Math.round(score / 10)
  const bar = '❤️'.repeat(filled) + '🖤'.repeat(10 - filled)

  const embed = new EmbedBuilder()
    .setColor(score >= 60 ? 0xf43f7e : score >= 30 ? 0xf5b53d : 0x99aab5)
    .setTitle(`💘 ${shipName(a.displayName, b.displayName)}`)
    .setDescription(`<@${a.id}> + <@${b.id}>\n\n**${score}%** ${bar}\n\n${a.id === b.id ? '🪞 Amor próprio acima de tudo.' : verdict(score)}`)
  await interaction.reply({ embeds: [embed] })
}
