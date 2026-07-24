import { afterEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  getAllLinkVisits,
  initDatabase,
  recordLinkVisit,
} from '../src/server/database';

afterEach(() => {
  closeDatabase();
});

describe('database', () => {
  it('persists and reads back link visits in insertion order', async () => {
    await initDatabase(':memory:');

    await recordLinkVisit({
      url: 'https://a.com',
      callbackUrl: 'https://a.com/cb',
      visitedAt: '2026-01-01T00:00:00.000Z',
      callbackStatus: 'success',
      callbackError: null,
    });
    await recordLinkVisit({
      url: 'https://b.com',
      callbackUrl: 'https://b.com/cb',
      visitedAt: '2026-01-01T00:00:01.000Z',
      callbackStatus: 'failed',
      callbackError: 'Callback failed (500): boom',
    });

    const rows = getAllLinkVisits();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      url: 'https://a.com',
      callback_url: 'https://a.com/cb',
      callback_status: 'success',
      callback_error: null,
    });
    expect(rows[1]).toMatchObject({
      url: 'https://b.com',
      callback_status: 'failed',
      callback_error: 'Callback failed (500): boom',
    });
  });

  it('reuses the connection across re-initialization', async () => {
    await initDatabase(':memory:');
    await recordLinkVisit({
      url: 'https://a.com',
      callbackUrl: 'https://a.com/cb',
      visitedAt: '2026-01-01T00:00:00.000Z',
      callbackStatus: 'success',
      callbackError: null,
    });

    // Re-initializing opens a fresh in-memory DB (previous data gone).
    await initDatabase(':memory:');
    expect(getAllLinkVisits()).toHaveLength(0);
  });

  it('throws when used before initialization', () => {
    closeDatabase();
    expect(() => getAllLinkVisits()).toThrow(/not been initialized/);
  });
});
