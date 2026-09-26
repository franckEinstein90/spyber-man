import fs from 'fs';
import path from 'path';

import { parseScreenshot } from '../crawler/cohereParse';
import { latestVisitWithScreenshot, recordAppLog, saveParsedMarkdown } from './database';
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
export async function parseRequestedScreenshot(
  url?: string,
): Promise<ParsedScreenshot | ParseRequestFailure> {
  const stored = findLatestCapture(url);
  let targetUrl = stored?.url;
  let screenshotFile = stored?.screenshotFile ?? null;

  if (!screenshotFile) {
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
    screenshotFile = filenameFromScreenshotUrl(visit.screenshot_url);
  }

  if (!targetUrl || !screenshotFile || !isSafeScreenshotFilename(screenshotFile)) {
    return { status: 404, error: 'The stored screenshot file name is not usable.' };
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
    details: { screenshotFile },
  });

  let markdown: string;
  try {
    markdown = await parseScreenshot(imagePath, async (slice) => {
      await recordAppLog({
        level: 'info',
        source: 'crawler',
        event: 'parse.slice',
        message: `Sending slice ${slice.index + 1} of ${slice.total} to Cohere`,
        url: targetUrl,
        details: { screenshotFile, slice: slice.index + 1, slices: slice.total },
      });
    });
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
