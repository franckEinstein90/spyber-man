import fs from 'fs';
import path from 'path';

import { clearScreenshotReference, listVisitScreenshots } from './database';
import { forgetScreenshotFile } from './resultsStore';
import { isSafeScreenshotFilename } from './screenshotPaths';

export interface ScreenshotRecord {
  filename: string;
  url: string | null;
  visitedAt: string | null;
}

export function filenameFromScreenshotUrl(screenshotUrl: string): string | null {
  try {
    const filename = path.basename(new URL(screenshotUrl).pathname);
    return isSafeScreenshotFilename(filename) ? filename : null;
  } catch {
    return null;
  }
}

/** Keep a screenshot when the file is on disk, and attach the page URL when the database has one. */
export function mergeScreenshotRecords(
  visits: Array<{ url: string; screenshotUrl: string; visitedAt: string }>,
  files: Array<{ filename: string; modifiedAt: string }>,
): ScreenshotRecord[] {
  const onDisk = new Set(files.filter((file) => isSafeScreenshotFilename(file.filename)).map((file) => file.filename));
  const byFile = new Map<string, ScreenshotRecord>();

  for (const visit of visits) {
    const filename = filenameFromScreenshotUrl(visit.screenshotUrl);
    if (!filename || !onDisk.has(filename)) continue;
    const current = byFile.get(filename);
    if (!current || (visit.visitedAt && (!current.visitedAt || visit.visitedAt > current.visitedAt))) {
      byFile.set(filename, { filename, url: visit.url, visitedAt: visit.visitedAt });
    }
  }

  for (const file of files) {
    if (!onDisk.has(file.filename) || byFile.has(file.filename)) continue;
    byFile.set(file.filename, { filename: file.filename, url: null, visitedAt: file.modifiedAt });
  }

  return [...byFile.values()].sort((a, b) => (b.visitedAt ?? '').localeCompare(a.visitedAt ?? ''));
}

export async function listScreenshotCatalog(directory: string): Promise<ScreenshotRecord[]> {
  let visits: Array<{ url: string; screenshotUrl: string; visitedAt: string }> = [];
  try {
    visits = await listVisitScreenshots();
  } catch {
    visits = [];
  }

  let files: Array<{ filename: string; modifiedAt: string }> = [];
  try {
    files = fs
      .readdirSync(directory)
      .filter((name) => isSafeScreenshotFilename(name))
      .map((filename) => ({
        filename,
        modifiedAt: fs.statSync(path.join(directory, filename)).mtime.toISOString(),
      }));
  } catch {
    files = [];
  }

  return mergeScreenshotRecords(visits, files);
}

/** Delete the PNG and clear the database pointer to it. The crawled page text stays. */
export async function deleteStoredScreenshot(
  directory: string,
  filename: string,
): Promise<{ deleted: boolean }> {
  if (!isSafeScreenshotFilename(filename)) return { deleted: false };

  const root = path.resolve(directory);
  const resolved = path.resolve(root, filename);
  if (resolved !== path.join(root, filename)) return { deleted: false };

  let removedFile = false;
  try {
    await fs.promises.unlink(resolved);
    removedFile = true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }

  let cleared = 0;
  try {
    cleared = await clearScreenshotReference(filename);
  } catch (error) {
    if (!removedFile) throw error;
  }

  forgetScreenshotFile(filename);
  return { deleted: removedFile || cleared > 0 };
}
