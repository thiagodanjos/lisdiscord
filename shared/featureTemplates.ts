import type { EmbedDraft, RoleGoal, VerificationSettings, VerifyLineFormat } from './types'
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

/** Textos e botão de fábrica do painel staff da verificação (só o gestor vê). */
export const STAFF_PANEL_DEFAULTS = {
  warningSeconds: 10,
  ticketSlowmodeSeconds: 0,
  spamProtection: false,
  spamMaxMessages: 5,
  spamWindowSeconds: 10,
  spamTimeoutMinutes: 5,
  staffPanelFinishLabel: 'Finalizar',
  staffPanelFinishEmoji: '✅',
  staffPanelFinishStyle: 'success',
  staffPanelSelectPlaceholder: 'Escolhe os cargos do membro…',
  staffPanelNoRoles: '*nenhum ainda*',
  staffPanelNothingExtra: '—',
  staffPanelRolesUpdated: '✅ Cargos atualizados.',
  staffPanelRolesRefused: 'Não podes dar: {cargos} (acima do teu cargo ou do do bot).',
  staffPanelRolesFailed: 'Falhou: {cargos}.',
  staffPanelMemberLeft: '❌ O membro já não está no servidor.',
  staffPanelAlreadyDecided: 'ℹ️ Esta verificação já foi decidida.',
} satisfies Partial<VerificationSettings>

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
    title: '',
    description:
      'Olá, seja bem-vindo à verificação {membro} 👻\n\n' +
      '↪ Envia uma print dos teus cargos da CDO e aguarda um **verificador**.\n\n' +
      '**Assumido por:** {responsavel}\n' +
      '**Estado:** {estado}',
    color: '#ED4245',
    thumbnailUrl: '{avatar}',
    footer: '',
    timestamp: false,
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
  verificationClosedFinished: draft({
    description: '↪ Seu ticket foi finalizado por: {moderador}\n\n🔴 Ticket será encerrado em {segundos} segundos.',
    color: '#22E584',
    timestamp: false,
  }),
  verificationClosedCancelled: draft({
    description: '↪ Seu ticket foi cancelado por: {moderador}\n**Motivo:** {motivo}\n\n🔴 Ticket será encerrado em {segundos} segundos.',
    color: '#ED4245',
    timestamp: false,
  }),
  verificationStaffFinished: draft({
    description: '✅ Verificação de {membro} finalizada — log enviado e o ticket fecha em {segundos} segundos.',
    color: '#22E584',
    timestamp: false,
  }),
  verificationStaffCancelled: draft({
    description: '✖️ Verificação de {membro} cancelada — log enviado e o ticket fecha em {segundos} segundos.',
    color: '#ED4245',
    timestamp: false,
  }),
  verificationWarnText: draft({
    description: '📸 {membro}, aqui envia só o **print do teu perfil com os cargos** (como imagem).',
    color: '#F0B232',
    footer: 'Esta mensagem desaparece em {segundos} segundos.',
    timestamp: false,
  }),
  verificationWarnTooBig: draft({
    description: '❌ {membro}, a imagem é demasiado grande (máx. {tamanho}). Tira um print mais pequeno e envia outra vez.',
    color: '#ED4245',
    footer: 'Esta mensagem desaparece em {segundos} segundos.',
    timestamp: false,
  }),
  verificationSpamTimeout: draft({
    title: '🔇 Castigo por spam',
    description: '{membro} mandou **{mensagens} mensagens em {segundos} segundos** e ficou de castigo por **{minutos} minutos**.\n\nManda só o print do teu perfil com os cargos e aguarda um verificador.',
    color: '#ED4245',
    timestamp: false,
  }),
  voiceSessionLog: draft({
    description: '🎙️ {membro} ficou **{duracao}** em call em {canal}.\n**Total agora:** {total}',
    color: '#22D3EE',
    footer: '{inicio} → {fim}',
    timestamp: false,
  }),
  profileCard: draft({
    title: 'Perfil de {nome}',
    description: '{emCall}\n{barra}\n🏅 **{pontos}** pontos · ⏱️ **{horas}** de call\n🏆 **#{posicao}** de {totalMembros} no ranking\n📅 Esta semana: **{pontosSemana}** pontos · **{horasSemana}**\n{barra}\n**Metas ({metasCumpridas}/{metasTotal})**\n{metas}',
    color: '#F43F7E',
    thumbnailUrl: '{avatar}',
    footer: '{servidor} · entrou {entrou}',
    timestamp: false,
  }),
  profileRanking: draft({
    title: '🏆 Ranking de Mov Call',
    description: '{lista}\n{barra}\nA tua posição: **#{posicao}** de {total}',
    color: '#F0B232',
    timestamp: false,
  }),
  weeklyReport: draft({
    title: '📊 Relatório semanal — {periodo}',
    description:
      '🏅 **Top pontos**\n{topPontos}\n{barra}\n⏱️ **Top horas**\n{topHoras}\n{barra}\n' +
      '📈 **Resumo:** {pontosSemana} pontos · {horasSemana} · {membrosAtivos} membros ativos · {sessoesCall} sessões em call\n' +
      '✅ **Verificações:** {verificados} aprovadas · {cancelados} canceladas\n{barra}\n' +
      '⬆️ **Prontos para upar ({totalProntos})**\n{prontos}\n{barra}\n💤 **Inativos ({totalInativos})**\n{inativos}',
    color: '#5865F2',
    footer: '{servidor}',
    timestamp: true,
  }),
  activityCard: draft({
    title: '{emoji} {titulo}',
    description:
      '{descricao}\n{barra}\n🗓️ **{data}** · ⏰ **{hora} – {fim}** ({relativo})\n📍 **Local:** {local}\n👑 **Responsável:** {responsavel}\n🏷️ **Categoria:** {categoria} · **Estado:** {estado}\n{barra}\n' +
      '✅ **Participantes ({vagasParticipantes})**\n{participantes}\n\n🛠️ **Organizadores ({vagasOrganizadores})**\n{organizadores}\n\n❌ **Indisponíveis**\n{indisponiveis}',
    footer: 'Atividade #{numero}',
    timestamp: false,
  }),
  activityBoard: draft({
    title: '📆 Agenda — próximos {dias} dias',
    description: '{agenda}',
    color: '#5865F2',
    footer: '{total} atividades · atualizado {atualizado}',
    timestamp: false,
  }),
  activityReminder: draft({
    title: '⏰ {titulo} começa {relativo}',
    description: '{emoji} **{categoria}** · {inicio}\n📍 {local}\n👑 {responsavel}\n{barra}\n{participantes}\n\n[Ver a atividade]({link})',
    color: '#F0B232',
    timestamp: false,
  }),
  activityList: draft({
    title: '📋 Atividades',
    description: '{filtros}\n{barra}\n{lista}',
    color: '#5865F2',
    footer: '{total} atividades',
    timestamp: false,
  }),
  lisfilmsTitle: draft({
    title: '{titulo} ({ano})',
    description: '-# {tipo} · {genero}\n{sinopse}\n{barra}\n⭐ **LisFilms:** {estrelas} {notaLisFilms} · {avaliacoes} reviews\n🌍 **TMDB:** {notaTmdb}',
    color: '#1ED760',
    thumbnailUrl: '{poster}',
    footer: 'LisFilms · lisfilms.pt',
    footerIconUrl: 'https://lisfilms.pt/pwa-192.png',
    timestamp: false,
  }),
  lisfilmsGame: draft({
    title: '🎮 {nome} ({ano})',
    description: '-# {generos} · {plataformas}\n{sinopse}\n{barra}\n⭐ **LisGames:** {estrelas} {notaLisGames} · {avaliacoes} avaliações\n🏆 **Metacritic:** {metacritic} · ⏱️ {duracao}\n🏢 {estudio}',
    color: '#1ED760',
    imageUrl: '{capa}',
    footer: 'LisGames · lisfilms.pt',
    footerIconUrl: 'https://lisfilms.pt/pwa-192.png',
    timestamp: false,
  }),
  lisfilmsList: draft({
    title: '{titulo}',
    description: '{lista}',
    color: '#1ED760',
    footer: 'LisFilms · {total} resultados',
    footerIconUrl: 'https://lisfilms.pt/pwa-192.png',
    timestamp: false,
  }),
  lisfilmsSummary: draft({
    title: '📊 LisFilms em números',
    description:
      '🎬 **{filmes}** filmes · 📺 **{series}** séries\n📝 **{reviews}** reviews · 👥 **{utilizadores}** pessoas\n⭐ Média global: **{media}**\n{barra}\n🔥 **Em alta**\n{emAlta}\n{barra}\n🏆 **Quem mais avalia**\n{topUtilizadores}',
    color: '#1ED760',
    footer: 'LisFilms · lisfilms.pt',
    footerIconUrl: 'https://lisfilms.pt/pwa-192.png',
    timestamp: true,
  }),
  verificationStaffPanel: draft({
    title: '🛠️ Painel staff',
    description:
      'Verificação de {membro} — só tu vês esta mensagem.\n\n' +
      '**1.** Escolhe abaixo os cargos a dar ao membro (são dados na hora; tirar da lista remove-os).\n' +
      '**2.** Clica em **{finalizar}** para fechar e mandar o log.',
    color: '#5865F2',
    fields: [
      { name: 'Cargos escolhidos', value: '{cargosEscolhidos}', inline: false },
      { name: 'Ao finalizar, também', value: '{aoFinalizar}', inline: false },
    ],
    footer: '{nota}',
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
  movList: draft({
    title: '',
    description: '**Listagem:**\n\n{listagem}',
    color: '#F43F7E',
    footer: 'Total: {total} membros · página {pagina}/{paginas}',
    timestamp: false,
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
