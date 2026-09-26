import type { GameInfo } from '../../../shared/types'

/** Jogos que podem ser ativados/desativados por servidor, na página Jogos da app. */
export const GAMES: GameInfo[] = [
  { id: 'dado', name: 'Dado', command: '/dado', description: 'Lança um ou vários dados (até 10), com o total.' },
  { id: 'moeda', name: 'Cara ou Coroa', command: '/moeda', description: 'Atira uma moeda ao ar — aposta opcional: acerta o lado e dobra.' },
  { id: 'ppt', name: 'Pedra, Papel ou Tesoura', command: '/ppt', description: 'Joga contra o bot.' },
  { id: 'oitobola', name: 'Bola 8 Mágica', command: '/oitobola', description: 'Faz uma pergunta e recebe uma resposta misteriosa.' },
  { id: 'trivia', name: 'Trivia', command: '/trivia', description: 'Responde a uma pergunta de escolha múltipla contra o relógio e ganha moedas.' },
  { id: 'forca', name: 'Forca', command: '/forca', description: 'Adivinha a palavra letra a letra antes que a forca se complete.' },
  { id: 'blackjack', name: 'Blackjack', command: '/blackjack', description: 'Joga 21 contra a casa, apostando moedas.' },
  { id: 'jogodavelha', name: 'Jogo do Galo', command: '/jogodavelha', description: 'Desafia outro membro para um jogo do galo por turnos.' },
  { id: 'duelo', name: 'Duelo', command: '/duelo', description: 'Combate por turnos contra outro membro, apostando moedas, com ataques e defesas.' },
  { id: 'roleta', name: 'Roleta', command: '/roleta', description: 'Aposta na cor da roleta — vermelho e preto pagam 2x, verde paga 14x.' },
  { id: 'cacaniqueis', name: 'Caça-níqueis', command: '/caca-niqueis', description: 'Gira os três rolos — três 7️⃣ é o jackpot (20x).' },
  { id: 'corrida', name: 'Corrida', command: '/corrida', description: 'Aposta em qual bicho vence a corrida animada (paga 3.5x).' },
  { id: 'numero', name: 'Adivinha o Número', command: '/numero', description: 'Adivinha um número secreto entre 1 e 50 — quantas menos tentativas, mais moedas.' },
  { id: 'desembaralhar', name: 'Desembaralhar', command: '/desembaralhar', description: 'Desembaralha as letras e escreve a palavra certa antes dos outros.' },
  { id: 'termo', name: 'Termo', command: '/termo', description: 'Adivinha a palavra de 5 letras em 6 tentativas, estilo Wordle — menos tentativas, mais moedas.' },
  { id: 'minas', name: 'Campo Minado', command: '/minas', description: 'Aposta e abre casas: cada 💎 aumenta o multiplicador, um 💣 perde tudo. Retira quando quiseres.' },
  { id: 'crash', name: 'Crash', command: '/crash', description: 'O foguete sobe e o multiplicador cresce — retira antes de ele rebentar (retirada automática opcional).' },
  { id: 'memoria', name: 'Jogo da Memória', command: '/memoria', description: 'Encontra os 8 pares de emojis com o menor número de jogadas e ganha moedas.' },
  { id: 'ship', name: 'Ship', command: '/ship', description: 'Calcula a compatibilidade entre duas pessoas, com nome de casal e tudo 💘.' },
  { id: 'economia', name: 'Economia', command: '/saldo · /diario · /ranking', description: 'Vê o teu saldo, reclama moedas diárias e consulta o ranking do servidor.' },
]
