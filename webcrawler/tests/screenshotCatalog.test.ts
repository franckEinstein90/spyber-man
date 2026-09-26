import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { deleteStoredScreenshot, mergeScreenshotRecords } from '../src/server/screenshotCatalog';

describe('screenshot catalog', () => {
  it('keeps files on disk and attaches the page url from the database', () => {
    const items = mergeScreenshotRecords(
      [
        {
          url: 'https://example.com/a',
          screenshotUrl: 'http://localhost:3000/screenGrabs/example.com-2.png',
          visitedAt: '2026-09-26T04:00:00.000Z',
        },
        {
          url: 'https://example.com/old',
          screenshotUrl: 'http://localhost:3000/screenGrabs/example.com-2.png',
          visitedAt: '2026-09-26T01:00:00.000Z',
        },
        {
          url: 'https://missing.example',
          screenshotUrl: 'http://localhost:3000/screenGrabs/gone.png',
          visitedAt: '2026-09-26T05:00:00.000Z',
        },
      ],
      [
        { filename: 'example.com-2.png', modifiedAt: '2026-09-26T04:00:00.000Z' },
        { filename: 'orphan.png', modifiedAt: '2026-09-26T03:00:00.000Z' },
      ],
    );

    expect(items).toEqual([
      {
        filename: 'example.com-2.png',
        url: 'https://example.com/a',
        visitedAt: '2026-09-26T04:00:00.000Z',
      },
      {
        filename: 'orphan.png',
        url: null,
        visitedAt: '2026-09-26T03:00:00.000Z',
      },
    ]);
  });

  it('deletes a screenshot file and refuses names outside that folder', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spyber-shots-'));
    const filename = 'example.com-1.png';
    fs.writeFileSync(path.join(dir, filename), 'png');

    const removed = await deleteStoredScreenshot(dir, filename);
    expect(removed.deleted).toBe(true);
    expect(fs.existsSync(path.join(dir, filename))).toBe(false);
    expect((await deleteStoredScreenshot(dir, '../secret.png')).deleted).toBe(false);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});