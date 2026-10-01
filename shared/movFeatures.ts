import type { ProfileSettings, RoleGoal, VoiceHoursSettings, VoiceStatusReason, WeeklyReportSettings } from './types'
import { formatDuration } from './leaderboardFormat'

// Horas automáticas, /perfil e relatório semanal — valores de fábrica e formatação partilhados entre
// o bot e a app (a pré-visualização na app usa exatamente as mesmas funções).

export function defaultVoiceHoursSettings(): VoiceHoursSettings {
  return {
    enabled: false,
    channelMode: 'all',
    channelIds: [],
    roleIds: [],
    ignoredUserIds: [],
    minMembers: 2,
    ignoreSelfMuted: false,
    ignoreSelfDeafened: true,
    ignoreServerMuted: false,
    ignoreAfkChannel: true,
    minSessionMinutes: 5,
    dailyCapHours: 0,
    logChannelId: null,
    logChannelName: null,
    logMinMinutes: 5,
    statusCounting: '🟢 a contar',
    statusPaused: '⏸️ em pausa',
  }
}

export const VOICE_REASON_LABEL: Record<VoiceStatusReason, string> = {
  counting: 'A contar',
  alone: 'Sozinho na call',
  selfMuted: 'Mutado',
  selfDeafened: 'Ensurdecido',
  serverMuted: 'Mutado pela staff',
  afk: 'Canal AFK',
  channel: 'Canal não conta',
  role: 'Sem cargo que conta',
  ignored: 'Ignorado',
  cap: 'Limite diário atingido',
}

export function defaultProfileSettings(): ProfileSettings {
  return {
    ephemeral: false,
    allowOthers: true,
    goalLineFormat: '{estado} **{cargo}** — {percent}%\n{progresso}\n-# {pontos}/{metaPontos} pontos · {horas}/{metaHoras}h',
    goalMet: '✅',
    goalNotMet: '⏳',
    goalsEmpty: '_Sem metas para os teus cargos._',
    barFilled: '🟩',
    barEmpty: '⬛',
    barLength: 10,
    inCallText: '🎙️ Em call em {canal} há **{duracao}** ({estadoCall})',
    notInCallText: '',
    rankingLineFormat: '**{posicao}.** {membro} — {pontos} pts · {horas}',
    rankingSize: 10,
    refreshButton: { show: true, label: 'Atualizar', emoji: '🔄', style: 'secondary' },
    rankingButton: { show: true, label: 'Ranking', emoji: '🏆', style: 'primary' },
    linkButton: { show: false, label: 'Regras', emoji: '📜', url: '' },
  }
}

export function defaultWeeklyReportSettings(): WeeklyReportSettings {
  return {
    enabled: false,
    channelId: null,
    channelName: null,
    dayOfWeek: 0,
    hour: 20,
    minute: 0,
    timezone: 'America/Sao_Paulo',
    mentionRoleId: null,
    roleIds: [],
    topCount: 5,
    topLineFormat: '**{posicao}.** {membro} — {valor}',
    inactiveMaxHours: 1,
    inactiveMaxPoints: 0,
    inactiveLineFormat: '{membro}',
    inactiveLimit: 20,
    readyLineFormat: '{membro} → {cargo}',
    emptyText: '_ninguém_',
    copyButton: { show: true, label: 'Copiar relatório', emoji: '📋', style: 'secondary' },
    rankingButton: { show: true, label: 'Ranking completo', emoji: '🏆', style: 'primary' },
    linkButton: { show: false, label: 'Painel', emoji: '🔗', url: '' },
  }
}

export const REPORT_TIMEZONES = [
  ['America/Sao_Paulo', 'Brasília (BRT)'],
  ['America/Manaus', 'Manaus (AMT)'],
  ['America/Noronha', 'Fernando de Noronha'],
  ['Europe/Lisbon', 'Lisboa'],
  ['UTC', 'UTC'],
] as const

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const

export function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), template)
}

/** Barra de progresso com os caracteres/emojis escolhidos. `ratio` entre 0 e 1. */
export function progressBar(settings: Pick<ProfileSettings, 'barFilled' | 'barEmpty' | 'barLength'>, ratio: number): string {
  const len = Math.min(20, Math.max(3, Math.round(settings.barLength || 10)))
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * len)
  return (settings.barFilled || '█').repeat(filled) + (settings.barEmpty || '░').repeat(len - filled)
}

export interface ProfileGoalInput {
  points: number
  totalSeconds: number
  roles: { id: string; name: string }[]
}

/** As linhas de `{metas}` do /perfil — uma por cargo do membro que tenha meta. */
export function formatProfileGoals(
  settings: ProfileSettings,
  profile: ProfileGoalInput,
  goals: RoleGoal[],
  mention: 'discord' | 'preview',
): { text: string; met: number; total: number } {
  const lines: string[] = []
  let met = 0
  for (const role of profile.roles) {
    const goal = goals.find((g) => g.roleId === role.id)
    if (!goal) continue
    const pr = goal.pointsGoal > 0 ? Math.min(1, profile.points / goal.pointsGoal) : 1
    const hr = goal.hoursGoal > 0 ? Math.min(1, profile.totalSeconds / (goal.hoursGoal * 3600)) : 1
    const ok = pr >= 1 && hr >= 1
    if (ok) met++
    const overall = (pr + hr) / 2
    lines.push(
      fill(settings.goalLineFormat || defaultProfileSettings().goalLineFormat, {
        cargo: mention === 'discord' ? `<@&${role.id}>` : `@${role.name}`,
        cargoNome: role.name,
        progresso: progressBar(settings, overall),
        percent: String(Math.round(overall * 100)),
        progressoPontos: progressBar(settings, pr),
        percentPontos: String(Math.round(pr * 100)),
        progressoHoras: progressBar(settings, hr),
        percentHoras: String(Math.round(hr * 100)),
        pontos: String(profile.points),
        metaPontos: String(goal.pointsGoal),
        horas: formatDuration(profile.totalSeconds),
        metaHoras: String(goal.hoursGoal),
        estado: ok ? settings.goalMet : settings.goalNotMet,
      }),
    )
  }
  return { text: lines.length ? lines.join('\n\n') : settings.goalsEmpty, met, total: lines.length }
}

export function formatRankingLines(
  format: string,
  entries: { userId: string; tag: string; points: number; totalSeconds: number }[],
  mention: 'discord' | 'preview',
  offset = 0,
): string {
  return entries
    .map((e, i) =>
      fill(format || defaultProfileSettings().rankingLineFormat, {
        posicao: String(offset + i + 1),
        membro: mention === 'discord' ? `<@${e.userId}>` : `@${e.tag}`,
        nome: e.tag,
        pontos: String(e.points),
        horas: formatDuration(e.totalSeconds),
      }),
    )
    .join('\n')
}
