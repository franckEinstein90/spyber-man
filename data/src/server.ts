import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { DATA_ROOT, loadRepoEnv, postgresSettings } from './env.ts'
import { applyMigrations } from './migrate.ts'

export interface EmbeddedPostgres {
  host: string
  port: number
  connectionString: string
  stop: () => Promise<void>
}

export interface StartOptions {
  /** `memory://` for an ephemeral database, or a directory path. */
  dataDir?: string
  /** `0` asks the OS for a free port. */
  port?: number
  host?: string
}

/**
 * Start embedded Postgres with pgvector and apply SQL migrations.
 * Listens on the Postgres wire protocol so ordinary clients can connect.
 */
export async function startEmbeddedPostgres(options: StartOptions = {}): Promise<EmbeddedPostgres> {
  loadRepoEnv()
  const settings = postgresSettings()
  const host = options.host ?? settings.host
  const port = options.port ?? settings.port
  const dataDir = options.dataDir ?? process.env.PGLITE_DATA_DIR ?? path.join(DATA_ROOT, 'pgdata')

  const db = new PGlite({
    dataDir,
    extensions: { vector },
  })
  await db.waitReady
  await applyMigrations(db)

  const server = new PGLiteSocketServer({
    db,
    host,
    port,
    maxConnections: 20,
  })
  await server.start()

  const bound = server.getServerConn()
  const boundPort = Number.parseInt(bound.slice(bound.lastIndexOf(':') + 1), 10)
  const user = encodeURIComponent(settings.user)
  const password = encodeURIComponent(settings.password)
  const connectionString = `postgresql://${user}:${password}@${host}:${boundPort}/${settings.database}`

  return {
    host,
    port: boundPort,
    connectionString,
    stop: async () => {
      await server.stop()
      await db.close()
    },
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)

if (isMain) {
  startEmbeddedPostgres()
    .then((database) => {
      console.log(`Embedded Postgres listening on ${database.host}:${database.port}`)
      const shutdown = () => {
        database.stop().finally(() => process.exit(0))
      }
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
    })
    .catch((error: unknown) => {
      console.error(error)
      process.exit(1)
    })
}
