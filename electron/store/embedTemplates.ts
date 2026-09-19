import type { EmbedDraft, EmbedTemplateKind } from '../../shared/types'
import { readJsonFile, writeJsonFile } from './fileStore'
import { paths } from './paths'

type Store = Record<string, Partial<Record<EmbedTemplateKind, EmbedDraft>>>

function emptyDraft(partial: Partial<EmbedDraft>): EmbedDraft {
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

/**
 * O que cada embed fixo mostrava antes de ser editável — usado sempre que um servidor ainda não
 * personalizou um destes, para o comportamento nunca mudar sozinho (só muda quando alguém
 * guarda um template novo pela app).
 */
export const DEFAULT_TEMPLATES: Record<EmbedTemplateKind, EmbedDraft> = {
  pontosBoard: emptyDraft({
    title: '🏅 PONTOS DE MOV. CALL',
    description: '{lista}',
    color: '#F0B232',
    footer: '{servidor} · atualizado em {atualizado}',
  }),
  inativos: emptyDraft({
    title: '⚠️ MEMBROS INATIVOS',
    description: '{lista}',
    color: '#ED4245',
    footer: '{servidor} · sem pontos ou menos de 5h de Mov. Call · não inclui bots',
  }),
  justificationFixed: emptyDraft({
    title: '👑 Usem este canal para fazer as justificativas fixas',
    description:
      '> **Quando utilizar a justificativa fixa?** 🤔\n\n' +
      'Quando vais ter um compromisso **toda a semana**, sempre no mesmo horário, e por isso não vais conseguir participar de algumas atividades.\n\n' +
      '**Exemplos:**\n' +
      '• Estudas de manhã → todas as atividades de manhã não vais conseguir participar;\n' +
      '• Trabalhas à tarde → todas as atividades de tarde não vais conseguir participar;\n\n' +
      'Clica em **Justificar** abaixo, confirma que és tu, indica os **dias da semana e o horário** (ex: *Segunda à sexta - 14:00 até 18:00*) e o motivo. No fim, revê e confirma o envio.',
    color: '#F0B232',
    footer: 'A tua justificativa fica registada com o teu nome — usa com responsabilidade.',
    timestamp: false,
  }),
  justificationDaily: emptyDraft({
    title: '👑 Usem este canal para fazer as justificativas diárias',
    description:
      '> **Quando utilizar a justificativa diária?** 🤑\n\n' +
      'Quando vais ter um compromisso de **última hora**, só por hoje, e por isso não vais conseguir participar de alguma atividade.\n\n' +
      '**Exemplos:**\n' +
      '• Precisas de sair da Mov porque vais ao mercado;\n' +
      '• Precisas de ir ao hospital;\n' +
      '• Vais sair de casa, etc;\n\n' +
      'Clica em **Justificar** abaixo, confirma que és tu, indica o **horário de hoje** (ex: *14:00 até 18:00*) e o motivo. No fim, revê e confirma o envio.',
    color: '#5865F2',
    footer: 'A tua justificativa fica registada com o teu nome — usa com responsabilidade.',
    timestamp: false,
  }),
}

function readAll(): Store {
  return readJsonFile<Store>(paths.embedTemplatesFile, {})
}

function writeAll(data: Store): void {
  writeJsonFile(paths.embedTemplatesFile, data)
}

/** Devolve o template guardado, ou o valor por omissão se este servidor ainda não personalizou este embed. */
export function getTemplate(guildId: string, kind: EmbedTemplateKind): EmbedDraft {
  return readAll()[guildId]?.[kind] ?? DEFAULT_TEMPLATES[kind]
}

/** Diz se o template é o que está guardado (personalizado) ou apenas o valor por omissão. */
export function isCustomized(guildId: string, kind: EmbedTemplateKind): boolean {
  return Boolean(readAll()[guildId]?.[kind])
}

export function setTemplate(guildId: string, kind: EmbedTemplateKind, draft: EmbedDraft): EmbedDraft {
  const data = readAll()
  data[guildId] = { ...data[guildId], [kind]: draft }
  writeAll(data)
  return draft
}

/** Volta ao valor por omissão — apaga a personalização guardada para este servidor e tipo. */
export function resetTemplate(guildId: string, kind: EmbedTemplateKind): EmbedDraft {
  const data = readAll()
  if (data[guildId]) {
    delete data[guildId][kind]
    writeAll(data)
  }
  return DEFAULT_TEMPLATES[kind]
}
