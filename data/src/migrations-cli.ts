import net from 'node:net'
import path from 'node:path'
import pg from 'pg'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { DATA_ROOT, loadRepoEnv, postgresSettings } from './env.ts'
import { applyMigrations, pendingMigrations, type MigrationDb } from './migrate.ts'

const { Client } = pg

function portOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end()
      resolve(true)
    })
    socket.setTimeout(1000)
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })
}

async function withDatabase<T>(fn: (db: MigrationDb, running: boolean) => Promise<T>): Promise<T> {
  loadRepoEnv()
  const settings = postgresSettings()
  if (await portOpen(settings.host, settings.port)) {
    const client = new Client({
      host: settings.host,
      port: settings.port,
      user: settings.user,
      password: settings.password,
      database: settings.database,
      ssl: false,
    })
    await client.connect()
    try {
      const db: MigrationDb = {
        exec: (sql) => client.query(sql),
        query: (sql, params) => client.query(sql, params),
      }
      return await fn(db, true)
    } finally {
      await client.end()
    }
  }

  const db = new PGlite({
    dataDir: process.env.PGLITE_DATA_DIR ?? path.join(DATA_ROOT, 'pgdata'),
    extensions: { vector },
  })
  await db.waitReady
  try {
    return await fn(db, false)
  } finally {
    await db.close()
  }
}

const command = process.argv[2]
if (command !== 'status' && command !== 'apply') {
  console.error('Usage: migrations-cli.ts <status|apply>')
  process.exit(2)
}

const result = await withDatabase(async (db, running) => {
  if (command === 'apply') {
    const executed = await applyMigrations(db)
    const after = await pendingMigrations(db)
    return { ok: true, running, executed, ...after }
  }
  const status = await pendingMigrations(db)
  return { ok: true, running, executed: [], ...status }
})

console.log(JSON.stringify(result))
