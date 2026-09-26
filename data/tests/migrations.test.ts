import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { applyMigrations, pendingMigrations } from '../src/migrate.ts'

describe('migrations', () => {
  it('reports pending files before they are applied and none after', async () => {
    const db = new PGlite({ dataDir: 'memory://', extensions: { vector } })
    await db.waitReady
    try {
      const before = await pendingMigrations(db)
      expect(before.applied).toEqual([])
      expect(before.pending).toContain('001_link_visits.sql')

      const executed = await applyMigrations(db)
      expect(executed).toContain('001_link_visits.sql')

      const after = await pendingMigrations(db)
      expect(after.pending).toEqual([])
      expect(after.applied).toContain('001_link_visits.sql')
    } finally {
      await db.close()
    }
  })
})