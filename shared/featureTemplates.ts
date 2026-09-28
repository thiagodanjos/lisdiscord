import type { EmbedDraft, RoleGoal, VerifyLineFormat } from './types'
import { formatDuration } from './leaderboardFormat'

// Valores de fábrica dos embeds do /verificar, /avisomov e da verificação por foto — partilhados
// entre o bot (que os publica) e a app (modo demonstração e pré-visualização), para o editor
// mostrar exatamente o que o bot vai mandar.

function draft(partial: Partial<EmbedDraft>): EmbedDraft {
  return {
    title: '',
    description: '',
    color: '#5865F2',
    imageUrl: '',
    thumbnailUrl: '',
    footer: '',
    authorName: '',
    fields: [],
    timestamp: true,
    ...partial,
  }
}

export const DEFAULT_VERIFY_LINES: VerifyLineFormat = {
  met: '✅ {cargo} — {pontos}/{metaPontos} pontos · {horas}/{metaHoras}h',
  notMet: '❌ {cargo} — {pontos}/{metaPontos} pontos · {horas}/{metaHoras}h',
  empty: '_Este membro não tem nenhum cargo com meta configurada._',
}

export const FEATURE_TEMPLATE_DEFAULTS = {
  verificar: draft({
    title: '🔍 Verificação de cargo',
    description: '{membro} tem **{pontos} pontos** e **{horas}** de Mov. Call.\n\n{cargos}',
    color: '#5865F2',
    thumbnailUrl: '{avatar}',
    footer: 'Configura as metas de cada cargo na app, em "Metas".',
    verifyLines: DEFAULT_VERIFY_LINES,
  }),
  avisoMov: draft({
    title: '📢 Aviso MOV',
    description: '{mensagem}',
    color: '#F43F7E',
    footer: 'Aviso de {nomeAutor}',
    footerIconUrl: '{avatarAutor}',
  }),
  verificationRequest: draft({
    title: '📸 Comprovação de {nome}',
    description: '{membro} enviou os prints dos cargos na CDO.',
    color: '#EB459E',
    thumbnailUrl: '{avatar}',
    fields: [
      { name: 'Conta criada', value: '{criada}', inline: true },
      { name: 'Entrou no servidor', value: '{entrou}', inline: true },
      { name: 'Responsável', value: '{responsavel}', inline: true },
    ],
    footer: '{servidor} · ID {id}',
  }),
  verificationLog: draft({
    title: 'Verificação {estado}',
    description: '{membro} — ticket #{ticket}\n**Responsável:** {responsavel}\n**Fechada por:** {moderador}\n**Duração:** {duracao}',
    color: '#22E584',
    thumbnailUrl: '{avatar}',
    fields: [
      { name: 'Cargos dados', value: '{cargosDados}', inline: true },
      { name: 'Cargos tirados', value: '{cargosTirados}', inline: true },
      { name: 'Motivo', value: '{motivo}', inline: false },
    ],
    footer: 'ID: {id}',
  }),
  verificationPanel: draft({
    title: 'Verificação Mov Call',
    description:
      'Seja bem-vindo ao servidor interno de Mov Call!\n\n' +
      'Para retirar o cargo de novato e ter acesso ao resto dos canais, clica em **Verificar** abaixo. ' +
      'Vai ser criado um canal só teu, onde envias uma comprovação bem nítida dos teus cargos na CDO.',
    color: '#ED4245',
    timestamp: false,
    footer: '{servidor}',
  }),
  verificationTicket: draft({
    title: '🔎 Verificação em andamento',
    description: 'Olá {membro}! Envia **prints dos teus cargos** dentro da CDO e aguarda um **verificador**.\n\nSó imagens contam — texto é apagado.',
    color: '#EB459E',
    thumbnailUrl: '{avatar}',
    fields: [
      { name: 'Responsável', value: '{responsavel}', inline: true },
      { name: 'Estado', value: '{estado}', inline: true },
    ],
    footer: 'Ticket #{numero} · só tu e a gestão veem este canal',
  }),
  verificationTicketCreated: draft({
    title: '✅ Ticket criado',
    description: 'O teu ticket foi criado: {canal}\n{barra}\nEnvia lá o **print do teu perfil** com os cargos e aguarda um verificador.',
    color: '#22E584',
    timestamp: false,
  }),
  verificationTicketExisting: draft({
    title: '📋 Já tens um ticket aberto',
    description: 'Continua a tua verificação no teu ticket: {canal}',
    color: '#5865F2',
    timestamp: false,
  }),
  verificationTicketLimit: draft({
    title: '⏳ Limite de tickets',
    description: 'Só podes abrir **{max} ticket(s)** a cada {janela}.\n{barra}\nTenta outra vez {tempo}.',
    color: '#F0B232',
    timestamp: false,
  }),
  logMessageDelete: draft({
    title: '🗑️ Mensagem apagada',
    description: '**Autor:** {autor}\n**Canal:** {canal}\n**Apagada por:** {apagadaPor}\n**Enviada:** {enviadaEm}\n\n**Conteúdo:**\n{conteudo}',
    color: '#ED4245',
    thumbnailUrl: '{avatarAutor}',
    fields: [{ name: 'Anexos', value: '{anexos}', inline: false }],
    footer: 'Autor: {idAutor} · Mensagem: {idMensagem}',
  }),
  logMessageEdit: draft({
    title: '✏️ Mensagem editada',
    description: '**Autor:** {autor}\n**Canal:** {canal} · [ir para a mensagem]({link})',
    color: '#F0B232',
    thumbnailUrl: '{avatarAutor}',
    fields: [
      { name: 'Antes', value: '{antes}', inline: false },
      { name: 'Depois', value: '{depois}', inline: false },
    ],
    footer: 'Autor: {idAutor}',
  }),
  logPoints: draft({
    title: '🏅 Pontos de Mov. Call',
    description: '{autor} **{acao}** {quantidade} pontos a {membro}.\n**Total agora:** {total}',
    color: '#F0B232',
    fields: [{ name: 'Nota', value: '{nota}', inline: false }],
  }),
  logHours: draft({
    title: '⏱️ Horas de Mov. Call',
    description: '{autor} **{acao}** {quantidade} a {membro}.\n**Total agora:** {total}',
    color: '#22D3EE',
    fields: [{ name: 'Nota', value: '{nota}', inline: false }],
  }),
} satisfies Record<string, EmbedDraft>

export interface VerifyProfileInput {
  points: number
  totalSeconds: number
  roles: { id: string; name: string }[]
}

/**
 * Monta o `{cargos}` do /verificar: só entram os cargos do membro que têm meta configurada —
 * cargos sem meta ficam de fora. `mention` escreve `<@&id>` (bot) ou `@nome` (pré-visualização).
 */
export function formatVerifyRoles(
  profile: VerifyProfileInput,
  goals: RoleGoal[],
  lines: VerifyLineFormat,
  mention: 'discord' | 'preview',
): { text: string; met: number; total: number } {
  const withGoal = profile.roles
    .map((role) => ({ role, goal: goals.find((g) => g.roleId === role.id) }))
    .filter((r): r is { role: { id: string; name: string }; goal: RoleGoal } => Boolean(r.goal))

  let met = 0
  const out = withGoal.map(({ role, goal }) => {
    const ok = profile.points >= goal.pointsGoal && profile.totalSeconds >= goal.hoursGoal * 3600
    if (ok) met++
    const values: Record<string, string> = {
      cargo: mention === 'discord' ? `<@&${role.id}>` : `@${role.name}`,
      cargoNome: role.name,
      pontos: String(profile.points),
      metaPontos: String(goal.pointsGoal),
      horas: formatDuration(profile.totalSeconds),
      metaHoras: String(goal.hoursGoal),
      faltamPontos: String(Math.max(0, goal.pointsGoal - profile.points)),
      faltamHoras: formatDuration(Math.max(0, goal.hoursGoal * 3600 - profile.totalSeconds)),
    }
    const template = (ok ? lines.met : lines.notMet) || DEFAULT_VERIFY_LINES[ok ? 'met' : 'notMet']
    return Object.entries(values).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), template)
  })

  return { text: out.length > 0 ? out.join('\n') : lines.empty || DEFAULT_VERIFY_LINES.empty, met, total: withGoal.length }
}
