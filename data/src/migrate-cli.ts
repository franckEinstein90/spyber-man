import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { DATA_ROOT, loadRepoEnv } from './env.ts'
import { applyMigrations } from './migrate.ts'

loadRepoEnv()

const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(DATA_ROOT, 'pgdata')
const db = new PGlite({
  dataDir,
  extensions: { vector },
})

const ran = await applyMigrations(db)
await db.close()

if (ran.length === 0) {
  console.log('Migrations already applied.')
} else {
  console.log(`Applied ${ran.join(', ')}`)
}
