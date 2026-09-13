import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

/**
 * Lê um ficheiro JSON de forma segura: se não existir, devolve o valor por omissão. Mas se existir e
 * estiver ilegível ou com JSON inválido (por exemplo, corrompido a meio de uma escrita anterior),
 * LANÇA um erro em vez de devolver silenciosamente o valor por omissão — sem isto, a próxima escrita
 * (baseada nesse valor por omissão vazio) apagaria para sempre os dados reais que lá estavam.
 */
export function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  const raw = readFileSync(path, 'utf-8')
  if (raw.trim() === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    throw new Error(
      `Ficheiro de dados corrompido em "${path}" — não vou apagar o que lá está. ` +
        `Verifica/repara o ficheiro manualmente antes de tentar outra vez. (${err instanceof Error ? err.message : String(err)})`,
    )
  }
}

/**
 * Escreve um ficheiro JSON de forma atómica: grava para um ficheiro temporário ao lado e só depois
 * troca o nome — se o processo for interrompido a meio (crash, `docker kill`, falta de espaço em
 * disco), o ficheiro original fica intacto em vez de ficar corrompido a meio da escrita.
 */
export function writeJsonFile(path: string, data: unknown): void {
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmpPath, path)
}
