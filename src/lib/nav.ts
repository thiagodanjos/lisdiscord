import {
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  CircleUser,
  ClipboardList,
  FileSpreadsheet,
  Clapperboard,
  Clock3,
  Eraser,
  FileClock,
  Gamepad2,
  Gift,
  History,
  LayoutDashboard,
  LayoutGrid,
  ListOrdered,
  Medal,
  Megaphone,
  MessageSquarePlus,
  MessageSquareWarning,
  Mic,
  ScrollText,
  Server,
  Settings as SettingsIcon,
  ShieldAlert,
  Smile,
  Target,
  Timer,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

// Navegação da app num só sítio: barra lateral, pesquisa rápida (Ctrl+K) e barra de título.

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Palavras extra para a pesquisa rápida encontrar a página. */
  keywords?: string
}

export interface NavSection {
  id: string
  label: string
  items: NavItem[]
}

/** Atalhos fixos no topo da barra lateral (e no modo compacto). */
export const PINNED: NavItem[] = [
  { to: '/', label: 'Visão Geral', icon: LayoutDashboard, end: true, keywords: 'inicio dashboard home' },
  { to: '/lisfilms', label: 'LisFilms', icon: Clapperboard, keywords: 'filmes series animes jogos reviews site' },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays, keywords: 'calendario atividades eventos supervisor dono mov' },
]

export const NAV: NavSection[] = [
  {
    id: 'comunicacao',
    label: 'Comunicação',
    items: [
      { to: '/mensagens', label: 'Mensagens & Embeds', icon: MessageSquarePlus, keywords: 'embed enviar' },
      { to: '/avisos-mov', label: 'Avisos MOV', icon: Megaphone, keywords: 'agendar aviso' },
      { to: '/emojis', label: 'Emojis do bot', icon: Smile },
      { to: '/sorteios', label: 'Sorteios', icon: Gift, keywords: 'giveaway' },
      { to: '/jogos', label: 'Jogos', icon: Gamepad2, keywords: 'minijogos economia' },
    ],
  },
  {
    id: 'movcall',
    label: 'Mov. Call',
    items: [
      { to: '/pontos-mov', label: 'Pontos MOV', icon: Medal, keywords: 'ranking placar' },
      { to: '/logs-pontos', label: 'Logs de pontos', icon: ScrollText },
      { to: '/horas-mov', label: 'Horas MOV', icon: Timer },
      { to: '/logs-horas', label: 'Logs de horas', icon: History },
      { to: '/horas-automaticas', label: 'Horas automáticas', icon: Mic, keywords: 'voz call tempo' },
      { to: '/listagem-mov', label: 'Listagem Mov Call', icon: ListOrdered, keywords: 'lista membros' },
    ],
  },
  {
    id: 'equipa',
    label: 'Equipa',
    items: [
      { to: '/funcoes', label: 'Funções da gestão', icon: ClipboardList, keywords: 'responsaveis tarefas quem cuida painel' },
      { to: '/verificacao', label: 'Verificação', icon: BadgeCheck, keywords: 'ticket print' },
      { to: '/planilha', label: 'Registo & Planilha', icon: FileSpreadsheet, keywords: 'google sheets banco dados backup cargos verificados' },
      { to: '/justificativas', label: 'Justificativas', icon: MessageSquareWarning },
      { to: '/metas', label: 'Metas', icon: Target },
      { to: '/upamentos', label: 'Upamentos', icon: TrendingUp, keywords: 'promocoes subir cargo' },
      { to: '/perfil', label: '/perfil', icon: CircleUser, keywords: 'cartao perfil' },
      { to: '/relatorio-semanal', label: 'Relatório semanal', icon: CalendarClock, keywords: 'resumo semana' },
    ],
  },
  {
    id: 'moderacao',
    label: 'Moderação',
    items: [
      { to: '/moderacao', label: 'Moderação', icon: ShieldAlert, keywords: 'ban kick castigo cargos dar tirar apelido desbanir' },
      { to: '/logs-limpeza', label: 'Logs de limpeza', icon: Eraser },
      { to: '/canais-log', label: 'Canais de log', icon: ScrollText, keywords: 'mensagens apagadas editadas' },
    ],
  },
  {
    id: 'servidor',
    label: 'Servidor',
    items: [
      { to: '/servidores', label: 'Servidores', icon: Server, keywords: 'sair remover bot' },
      { to: '/backups', label: 'Backups', icon: LayoutGrid },
      { to: '/agendamentos', label: 'Agendamentos', icon: Clock3 },
      { to: '/transcripts', label: 'Transcripts', icon: FileClock },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { to: '/definicoes', label: 'Definições', icon: SettingsIcon, keywords: 'token conta bot remoto' }

export const ALL_ITEMS: NavItem[] = [...PINNED, ...NAV.flatMap((s) => s.items), SETTINGS_ITEM]

export function findNavItem(pathname: string): NavItem | undefined {
  const exact = ALL_ITEMS.find((i) => i.to === pathname)
  if (exact) return exact
  return ALL_ITEMS.filter((i) => i.to !== '/' && pathname.startsWith(i.to)).sort((a, b) => b.to.length - a.to.length)[0]
}

/** Pesquisa sem acentos nem maiúsculas. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
