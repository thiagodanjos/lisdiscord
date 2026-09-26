import { createRequire } from 'node:module'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import schema from './schema.sql?raw'
import { paths } from '../store/paths'

/**
 * Base de dados SQLite local (sql.js — SQLite compilado para WebAssembly, sem módulos nativos,
 * por isso o instalador de Windows/macOS/Linux não precisa de compilar nada). Vive toda em
 * memória e é gravada em disco depois de cada escrita, de forma atómica (ficheiro temporário +
 * rename), para nunca ficar meio escrita se a app fechar a meio.
 */
let db: Database | null = null
let opening: Promise<Database> | null = null

export function openDatabase(): Promise<Database> {
  if (db) return Promise.resolve(db)
  opening ??= (async () => {
    const require = createRequire(import.meta.url)
    const SQL = await initSqlJs({ locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`) })
    const instance = existsSync(paths.databaseFile) ? new SQL.Database(readFileSync(paths.databaseFile)) : new SQL.Database()
    instance.run('PRAGMA foreign_keys = ON')
    instance.exec(schema)
    db = instance
    persist()
    return instance
  })()
  return opening
}

function requireDb(): Database {
  if (!db) throw new Error('A base de dados ainda não abriu.')
  return db
}

function persist(): void {
  const data = requireDb().export()
  const tmp = `${paths.databaseFile}.tmp`
  writeFileSync(tmp, Buffer.from(data))
  renameSync(tmp, paths.databaseFile)
}

export function queryAll<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []): T[] {
  const stmt = requireDb().prepare(sql)
  try {
    stmt.bind(params)
    const rows: T[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as T)
    return rows
  } finally {
    stmt.free()
  }
}

export function queryOne<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []): T | null {
  return queryAll<T>(sql, params)[0] ?? null
}

/** Executa uma escrita e grava logo em disco. Devolve o id da última linha inserida. */
export function execute(sql: string, params: SqlValue[] = []): number {
  const instance = requireDb()
  instance.run(sql, params)
  const id = Number(instance.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0] ?? 0)
  persist()
  return id
}
