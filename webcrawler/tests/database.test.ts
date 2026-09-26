import { afterEach, describe, expect, it } from 'vitest';

import { startEmbeddedPostgres, type EmbeddedPostgres } from '../../data/src/server.ts';
import {
  closeDatabase,
  getAllLinkVisits,
  initDatabase,
  listAppLogs,
  listRagChunks,
  recordAppLog,
  recordLinkVisit,
  replaceRagChunks,
  saveParsedMarkdown,
  searchRagChunks,
} from '../src/server/database';

let embedded: EmbeddedPostgres | undefined;

async function useFreshDatabase(): Promise<void> {
  if (embedded) {
    await embedded.stop();
  }
  embedded = await startEmbeddedPostgres({ dataDir: 'memory://', port: 0 });
  await initDatabase({
    connectionString: embedded.connectionString,
    max: 2,
    ssl: false,
  });
}

afterEach(async () => {
  await closeDatabase();
  if (embedded) {
    await embedded.stop();
    embedded = undefined;
  }
});

describe('database', () => {
  it('persists and reads back link visits in insertion order', async () => {
    await useFreshDatabase();

    await recordLinkVisit({
      url: 'https://a.com',
      callbackUrl: 'https://a.com/cb',
      visitedAt: '2026-01-01T00:00:00.000Z',
      callbackStatus: 'success',
      callbackError: null,
      screenshotUrl: 'http://localhost:3000/screenGrabs/a.com-1.png',
      ocrText: 'Hello from OCR',
    });
    await recordLinkVisit({
      url: 'https://b.com',
      callbackUrl: 'https://b.com/cb',
      visitedAt: '2026-01-01T00:00:01.000Z',
      callbackStatus: 'failed',
      callbackError: 'Callback failed (500): boom',
      screenshotUrl: null,
      ocrText: null,
    });

    const rows = await getAllLinkVisits();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      url: 'https://a.com',
      callback_url: 'https://a.com/cb',
      callback_status: 'success',
      callback_error: null,
      screenshot_url: 'http://localhost:3000/screenGrabs/a.com-1.png',
      ocr_text: 'Hello from OCR',
    });
    expect(rows[1]).toMatchObject({
      url: 'https://b.com',
      callback_status: 'failed',
      callback_error: 'Callback failed (500): boom',
      screenshot_url: null,
      ocr_text: null,
      parsed_markdown: null,
    });

    const visitId = await saveParsedMarkdown('https://a.com', '# Parsed');
    const updated = await getAllLinkVisits();
    expect(visitId).toBe(updated[0].id);
    expect(updated[0].parsed_markdown).toBe('# Parsed');
    expect(updated[1].parsed_markdown).toBeNull();

    const embedding = Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0));
    await replaceRagChunks(visitId!, 'https://a.com', [
      { index: 0, content: 'First chunk', embedding },
      { index: 1, content: 'Second chunk', embedding },
    ]);
    await replaceRagChunks(visitId!, 'https://a.com', [
      { index: 0, content: 'Replaced chunk', embedding },
    ]);
    const chunks = await listRagChunks(visitId!);
    expect(chunks).toEqual([{ chunk_index: 0, content: 'Replaced chunk', dimensions: 1536 }]);

    const near = Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0));
    const far = Array.from({ length: 1536 }, (_, index) => (index === 1 ? 1 : 0));
    await replaceRagChunks(visitId!, 'https://a.com', [
      { index: 0, content: 'Near chunk', embedding: near },
      { index: 1, content: 'Far chunk', embedding: far },
    ]);
    const nearest = await searchRagChunks(near, 1);
    expect(nearest[0]).toMatchObject({ url: 'https://a.com', content: 'Near chunk', chunkIndex: 0 });
    expect(nearest[0].distance).toBeLessThan(0.01);

    await recordAppLog({
      level: 'error',
      source: 'crawler',
      event: 'parse.failed',
      message: 'timed out',
      url: 'https://a.com',
      durationMs: 60_000,
      details: { slices: 3 },
    });
    const logs = await listAppLogs(10, 'error');
    expect(logs[0]).toMatchObject({
      level: 'error',
      event: 'parse.failed',
      message: 'timed out',
      url: 'https://a.com',
      duration_ms: 60_000,
      details: { slices: 3 },
    });
  });

  it('keeps rows when the client reconnects', async () => {
    await useFreshDatabase();
    await recordLinkVisit({
      url: 'https://a.com',
      callbackUrl: 'https://a.com/cb',
      visitedAt: '2026-01-01T00:00:00.000Z',
      callbackStatus: 'success',
      callbackError: null,
      screenshotUrl: null,
      ocrText: null,
    });

    await initDatabase({ connectionString: embedded!.connectionString, max: 2, ssl: false });
    expect(await getAllLinkVisits()).toHaveLength(1);
  });

  it('throws when used before initialization', async () => {
    await closeDatabase();
    await expect(getAllLinkVisits()).rejects.toThrow(/not been initialized/);
  });
});
