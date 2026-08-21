import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { env } from '../env'
import * as schema from './schema'

mkdirSync(path.dirname(env.databasePath), { recursive: true })

const sqlite = new Database(env.databasePath)

sqlite.pragma('journal_mode = WAL')
sqlite.pragma('synchronous = NORMAL')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('busy_timeout = 5000')

export const db = drizzle(sqlite, { schema })

export function runMigrations(): void {
  const folder = process.env.MIGRATIONS_PATH ?? path.resolve(process.cwd(), 'drizzle')
  migrate(db, { migrationsFolder: folder })
}
