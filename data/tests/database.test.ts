import { afterEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import { startEmbeddedPostgres } from '../src/server.ts'

const { Client } = pg

describe('embedded postgres', () => {
  let stop: (() => Promise<void>) | undefined

  afterEach(async () => {
    if (stop) {
      await stop()
      stop = undefined
    }
  })

  it('applies migrations, stores link visits, and can compare vectors', async () => {
    const database = await startEmbeddedPostgres({ dataDir: 'memory://', port: 0 })
    stop = database.stop

    const client = new Client({ connectionString: database.connectionString })
    await client.connect()
    try {
      const extension = await client.query("SELECT extname FROM pg_extension WHERE extname = 'vector'")
      expect(extension.rows).toEqual([{ extname: 'vector' }])

      await client.query(
        `INSERT INTO link_visits (url, callback_url, visited_at, callback_status, screenshot_url, ocr_text)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['https://example.com', 'http://localhost:3000/api/crawl-results', '2026-01-01T00:00:00.000Z', 'success', null, 'hello'],
      )

      const rows = await client.query('SELECT url, callback_status, ocr_text FROM link_visits ORDER BY id')
      expect(rows.rows).toEqual([
        { url: 'https://example.com', callback_status: 'success', ocr_text: 'hello' },
      ])

      const distance = await client.query("SELECT '[1,0,0]'::vector <-> '[0,1,0]'::vector AS distance")
      expect(Number(distance.rows[0].distance)).toBeCloseTo(Math.SQRT2, 5)

      const applied = await client.query('SELECT version FROM schema_migrations')
      expect(applied.rows.map((row) => row.version)).toContain('001_link_visits.sql')
    } finally {
      await client.end()
    }
  })
})
