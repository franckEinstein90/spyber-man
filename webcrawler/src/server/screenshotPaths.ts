/**
 * Helpers for screenshot storage and the public URL clients use to fetch them.
 *
 * Files live under `screenGrabs/` and are served at `GET /screenGrabs/:filename`.
 */

import path from 'path';

export const SCREENSHOT_DIR_NAME = 'screenGrabs';
export const SCREENSHOT_ROUTE_PREFIX = '/screenGrabs';

/** Absolute path to the on-disk screenshot directory (cwd-relative). */
export function getScreenshotDirectory(root: string = process.cwd()): string {
  return path.join(root, SCREENSHOT_DIR_NAME);
}

/**
 * Public origin for absolute screenshot URLs in crawl results / callbacks.
 * Override with `PUBLIC_BASE_URL` (e.g. `https://crawler.example.com`).
 */
export function getPublicBaseUrl(): string {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  const port = process.env.PORT || process.env.BACKEND_PORT || '3000';
  return `http://localhost:${port}`;
}

/** Build a public URL for a screenshot filename stored under `screenGrabs/`. */
export function buildScreenshotUrl(filename: string): string {
  const safe = path.basename(filename);
  return `${getPublicBaseUrl()}${SCREENSHOT_ROUTE_PREFIX}/${safe}`;
}

/**
 * Reject path traversal / unexpected names. Only basename `.png` files are allowed.
 */
export function isSafeScreenshotFilename(filename: string): boolean {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return false;
  }
  return /^[a-zA-Z0-9._-]+\.png$/i.test(filename);
}
