import { afterEach, describe, expect, it } from 'vitest';

import {
  buildScreenshotUrl,
  isSafeScreenshotFilename,
} from '../src/server/screenshotPaths';

afterEach(() => {
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.PORT;
  delete process.env.BACKEND_PORT;
});

describe('screenshotPaths', () => {
  it('builds a public screenshot URL from the filename', () => {
    process.env.PORT = '3000';
    expect(buildScreenshotUrl('example.com-123.png')).toBe(
      'http://localhost:3000/screenGrabs/example.com-123.png',
    );
  });

  it('honors PUBLIC_BASE_URL and strips trailing slashes', () => {
    process.env.PUBLIC_BASE_URL = 'https://crawler.example.com/';
    expect(buildScreenshotUrl('host-1.png')).toBe(
      'https://crawler.example.com/screenGrabs/host-1.png',
    );
  });

  it('uses only the basename when given a path-like string', () => {
    process.env.PORT = '3000';
    expect(buildScreenshotUrl('nested/evil.png')).toBe(
      'http://localhost:3000/screenGrabs/evil.png',
    );
  });

  it('rejects unsafe screenshot filenames', () => {
    expect(isSafeScreenshotFilename('ok-host-1.png')).toBe(true);
    expect(isSafeScreenshotFilename('../secret.png')).toBe(false);
    expect(isSafeScreenshotFilename('a/b.png')).toBe(false);
    expect(isSafeScreenshotFilename('nope.jpg')).toBe(false);
  });
});
