import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations')

export interface MigrationDb {
  exec(sql: string): Promise<unknown>
  query<T extends Record<string, unknown> = { version: string }>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>
}

export function listMigrationFiles(migrationsDir: string = MIGRATIONS_DIR): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

/** Compare migration files with `schema_migrations` without applying anything. */
export async function pendingMigrations(
  db: MigrationDb,
  migrationsDir: string = MIGRATIONS_DIR,
): Promise<{ applied: string[]; pending: string[] }> {
  const files = listMigrationFiles(migrationsDir)
  const registered = await db.query<{ name: string | null }>(
    `SELECT to_regclass('public.schema_migrations') AS name`,
  )
  if (!registered.rows[0]?.name) {
    return { applied: [], pending: files }
  }

  const existing = await db.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  )
  const applied = existing.rows.map((row) => row.version)
  const appliedSet = new Set(applied)
  return {
    applied,
    pending: files.filter((file) => !appliedSet.has(file)),
  }
}

/** Apply `data/migrations/*.sql` in filename order, once each. */
export async function applyMigrations(db: MigrationDb, migrationsDir: string = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await db.exec('CREATE EXTENSION IF NOT EXISTS vector')

  const files = listMigrationFiles(migrationsDir)

  const existing = await db.query<{ version: string }>('SELECT version FROM schema_migrations')
  const applied = new Set(existing.rows.map((row) => row.version))
  const ran: string[] = []

  for (const file of files) {
    if (applied.has(file)) {
      continue
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    await db.exec(sql)
    await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])
    ran.push(file)
  }

  return ran
}
