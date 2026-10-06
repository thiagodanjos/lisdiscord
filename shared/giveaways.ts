import type { GiveawaySettings, GiveawayWizardSettings } from './types'

// Valores de fábrica do sorteio — partilhados entre o bot e a app (modo demonstração e pré-visualização).

export function defaultGiveawaySettings(): GiveawaySettings {
  return {
    entryMode: 'button',
    reactionEmoji: '🎉',
    joinButton: { show: true, label: 'Participar ({participantes})', emoji: '🎉', style: 'primary' },
    participantsButton: { show: true, label: 'Participantes', emoji: '👥', style: 'secondary' },
    rerollButton: { show: true, label: 'Rerolar', emoji: '🔁', style: 'secondary' },
    requiredRoleIds: [],
    managerRoleIds: [],
    mentionRoleId: null,
    allowLeave: true,
    dmWinners: false,
    start: { embed: true, content: '' },
    ended: { embed: true, content: '' },
    winners: { embed: false, content: '🎉 Parabéns {ganhadores}! Ganharam **{premio}**!' },
    reroll: { embed: true, content: '🔁 {ganhadores}' },
    noEntrants: { embed: false, content: '😕 Ninguém participou no sorteio de **{premio}**.' },
    winnerDm: { embed: true, content: '' },
    participantLine: '`{posicao}.` {membro}',
    replyJoined: '🎉 Estás a participar em **{premio}**! Boa sorte.',
    replyLeft: '↩️ Saíste do sorteio de **{premio}**.',
    replyAlready: 'ℹ️ Já estás a participar em **{premio}**.',
    replyEnded: 'ℹ️ Este sorteio já terminou.',
    replyNoRole: '🔒 Precisas de um destes cargos para participar: {cargos}.',
    replyNoPermission: '🔒 Só quem gere o servidor (ou os cargos escolhidos na app) pode fazer isto.',
    replyRerollDone: '🔁 Reroll feito — o novo resultado foi anunciado no canal.',
    replyRerollEmpty: 'ℹ️ Não há mais participantes que ainda não tenham ganho.',
    replyNoParticipants: 'Ainda ninguém está a participar.',
    wizard: defaultGiveawayWizard(),
  }
}

export function defaultGiveawayWizard(): GiveawayWizardSettings {
  return {
    selectPlaceholder: 'Escolhe um canal',
    writeButton: { show: true, label: 'Escrever detalhes', emoji: '📝', style: 'primary' },
    backButton: { show: true, label: 'Voltar', emoji: '⬅️', style: 'secondary' },
    cancelButton: { show: true, label: 'Cancelar', emoji: '', style: 'danger' },
    modalTitle: 'Detalhes do sorteio',
    prizeLabel: 'Título / prémio',
    prizePlaceholder: 'Ex: Nitro de 1 mês',
    durationLabel: 'Duração exata (ex: 1h30m, 2d, 45m, 30s)',
    durationPlaceholder: '1h30m',
    descriptionLabel: 'Descrição (opcional)',
    descriptionPlaceholder: 'Regras, como receber o prémio…',
    winnersLabel: 'Número de vencedores (padrão: 1)',
    winnersPlaceholder: '1',
    errorPrize: 'Escreve um título/prémio para o sorteio.',
    errorDuration: 'Duração inválida. Usa um formato como `1h30m`, `2d`, `45m` ou `30s` — entre 30 segundos e 30 dias.',
    errorWinners: 'O número de vencedores tem de ser entre 1 e 50.',
    creatingText: '⏳ A criar sorteio…',
  }
}

export function fillGiveaway(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), template)
}
