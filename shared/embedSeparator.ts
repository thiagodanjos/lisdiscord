// Barra divisória nos textos dos embeds: o utilizador escreve `{barra}` numa linha própria (há um
// botão para isso na barra de ferramentas dos editores de texto da app).
//  • Em mensagens no formato "caixa" (Components V2 — painel e tickets da verificação) vira a linha
//    divisória verdadeira da Discord.
//  • Em embeds normais (onde a Discord não tem divisória) vira uma linha fina em letra pequena.

export const SEPARATOR_TOKEN = '{barra}'

/** Linha que substitui a barra em embeds normais (`-#` = texto pequeno e cinzento na Discord). */
export const SEPARATOR_FALLBACK = '-# ────────────────────────────────'

/** Uma linha que só tem `{barra}` (com espaços à volta, opcionalmente). */
export const SEPARATOR_LINE = /^[ \t]*\{barra\}[ \t]*$/gm

/** Para partir um texto nos pontos de barra (consome as quebras de linha à volta). */
export const SEPARATOR_SPLIT = /\n?[ \t]*\{barra\}[ \t]*(?:\n|$)/

/** Troca as barras pela linha de fallback — usado em embeds normais. */
export function flattenSeparators(text: string): string {
  return text.replace(SEPARATOR_LINE, SEPARATOR_FALLBACK).split(SEPARATOR_TOKEN).join(SEPARATOR_FALLBACK)
}
