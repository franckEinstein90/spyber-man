import fs from 'fs';
import path from 'path';

import { parseScreenshot, type ImageCrop } from '../crawler/cohereParse';
import { latestVisitWithScreenshot, recordAppLog, saveParsedMarkdown, visitForScreenshotFile } from './database';
import { indexParsedContent } from './rag';
import {
  findLatestCapture,
  setParsedMarkdown,
  type StoredCrawlResult,
} from './resultsStore';
import { getScreenshotDirectory, isSafeScreenshotFilename } from './screenshotPaths';

export interface ParseRequestFailure {
  status: number;
  error: string;
}

export interface ParsedScreenshot extends StoredCrawlResult {
  ragChunks: number;
  ragError: string | null;
}

function filenameFromScreenshotUrl(screenshotUrl: string): string | null {
  try {
    const filename = path.basename(new URL(screenshotUrl).pathname);
    return isSafeScreenshotFilename(filename) ? filename : null;
  } catch {
    return null;
  }
}

/**
 * Parse an existing crawl screenshot with Cohere.
 * Uses the newest in-memory capture, then the newest database visit.
 */
export function readCrop(value: unknown): ImageCrop | undefined {
  if (value == null) return undefined;
  if (!value || typeof value !== 'object') {
    throw new Error('crop must be an object with x, y, width, and height');
  }
  const record = value as Record<string, unknown>;
  const numbers = [record.x, record.y, record.width, record.height];
  if (!numbers.every((item) => typeof item === 'number' && Number.isFinite(item))) {
    throw new Error('crop x, y, width, and height must be numbers');
  }
  const crop = {
    x: record.x as number,
    y: record.y as number,
    width: record.width as number,
    height: record.height as number,
  };
  if (crop.width < 1 || crop.height < 1) {
    throw new Error('crop width and height must be at least 1');
  }
  return crop;
}

export async function parseRequestedScreenshot(
  url?: string,
  crop?: ImageCrop,
  screenshotFile?: string,
): Promise<ParsedScreenshot | ParseRequestFailure> {
  if (screenshotFile && !isSafeScreenshotFilename(screenshotFile)) {
    return { status: 400, error: 'screenshotFile must be a png file name.' };
  }

  const stored = findLatestCapture(screenshotFile ? undefined : url);
  let targetUrl = url ?? stored?.url;
  let resolvedFile = screenshotFile ?? stored?.screenshotFile ?? null;

  if (screenshotFile) {
    const owner = await visitForScreenshotFile(screenshotFile).catch(() => null);
    targetUrl = owner?.url ?? url;
  } else if (!resolvedFile) {
    const visit = await latestVisitWithScreenshot(url);
    if (!visit) {
      return {
        status: 404,
        error: url
          ? `No screenshot is stored for ${url}. Crawl that page first.`
          : 'No screenshot is stored yet. Crawl a page first.',
      };
    }
    targetUrl = visit.url;
    resolvedFile = filenameFromScreenshotUrl(visit.screenshot_url);
  }

  screenshotFile = resolvedFile ?? undefined;

  if (!screenshotFile || !isSafeScreenshotFilename(screenshotFile)) {
    return { status: 404, error: 'The stored screenshot file name is not usable.' };
  }
  if (!targetUrl) {
    return { status: 404, error: 'That screenshot is not linked to a crawled page.' };
  }

  const imagePath = path.join(getScreenshotDirectory(), screenshotFile);
  if (!fs.existsSync(imagePath)) {
    return { status: 404, error: `Screenshot file ${screenshotFile} is no longer on disk.` };
  }

  const started = Date.now();
  await recordAppLog({
    level: 'info',
    source: 'crawler',
    event: 'parse.started',
    message: `Parsing screenshot ${screenshotFile}`,
    url: targetUrl,
    details: { screenshotFile, crop: crop ?? null },
  });

  let markdown: string;
  try {
    markdown = await parseScreenshot(
      imagePath,
      async (slice) => {
        await recordAppLog({
          level: 'info',
          source: 'crawler',
          event: 'parse.slice',
          message: `Sending slice ${slice.index + 1} of ${slice.total} to Cohere`,
          url: targetUrl,
          details: { screenshotFile, slice: slice.index + 1, slices: slice.total, crop: crop ?? null },
        });
      },
      crop,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAppLog({
      level: 'error',
      source: 'crawler',
      event: 'parse.failed',
      message,
      url: targetUrl,
      durationMs: Date.now() - started,
      details: { screenshotFile },
    });
    return { status: 502, error: message };
  }

  const visitId = await saveParsedMarkdown(targetUrl, markdown);
  let ragChunks = 0;
  let ragError: string | null = null;
  if (visitId == null) {
    ragError = 'The parsed page was not stored because that crawl is not in the database.';
    await recordAppLog({
      level: 'warn',
      source: 'crawler',
      event: 'parse.not_stored',
      message: ragError,
      url: targetUrl,
      durationMs: Date.now() - started,
    });
  } else {
    try {
      ragChunks = await indexParsedContent(visitId, targetUrl, markdown);
      await recordAppLog({
        level: 'info',
        source: 'crawler',
        event: 'parse.finished',
        message: `Stored ${ragChunks} embedded chunk${ragChunks === 1 ? '' : 's'}`,
        url: targetUrl,
        durationMs: Date.now() - started,
        details: { screenshotFile, visitId, ragChunks },
      });
    } catch (error) {
      ragError = error instanceof Error ? error.message : String(error);
      await recordAppLog({
        level: 'error',
        source: 'crawler',
        event: 'parse.embeddings_failed',
        message: ragError,
        url: targetUrl,
        durationMs: Date.now() - started,
        details: { screenshotFile, visitId },
      });
    }
  }

  const updated = setParsedMarkdown(targetUrl, screenshotFile, markdown);
  return {
    url: targetUrl,
    title: updated?.title ?? stored?.title ?? '',
    excerpt: updated?.excerpt ?? stored?.excerpt ?? '',
    screenshotFile,
    parsedMarkdown: markdown,
    error: null,
    timestamp: updated?.timestamp ?? new Date().toISOString(),
    ragChunks,
    ragError,
  };
}
