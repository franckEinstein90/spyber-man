import { vi } from 'vitest';

import type { CrawlResult } from '../src/crawler/models/CrawlResult';
import type { CrawlerLike } from '../src/server/processEvents';
import type { SpyberManCrawlStatus } from '../src/server/models/SpyberManCrawlStatus';

/** A fresh, empty crawl-status object. */
export function makeStatus(): SpyberManCrawlStatus {
  return { running: false, current_urls: [] };
}

/** Build a successful crawl result for `url`. */
export function successResult(url: string): CrawlResult {
  return {
    url,
    html: `<html>${url}</html>`,
    title: `Title ${url}`,
    timestamp: new Date(),
    status: 'success',
  };
}

/** Build an error crawl result for `url`. */
export function errorResult(url: string, message = 'boom'): CrawlResult {
  return {
    url,
    html: '',
    title: '',
    timestamp: new Date(),
    status: 'error',
    error: message,
  };
}

export interface FakeCrawlerOptions {
  /** Map a URL to the result it should produce. */
  resultFor?: (url: string) => CrawlResult;
  /** URLs for which `crawl` should reject (throw) instead of resolving. */
  throwFor?: (url: string) => boolean;
  /** Optional async hook invoked at the start of each crawl (e.g. to gate timing). */
  onCrawlStart?: (url: string) => Promise<void> | void;
  /** Optional async hook invoked before each crawl resolves. */
  onCrawlEnd?: (url: string) => Promise<void> | void;
}

export interface FakeCrawler extends CrawlerLike {
  crawl: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

/** A configurable in-memory crawler that never launches a real browser. */
export function makeFakeCrawler(options: FakeCrawlerOptions = {}): FakeCrawler {
  const resultFor = options.resultFor ?? successResult;

  const crawl = vi.fn(async (url: string): Promise<CrawlResult> => {
    await options.onCrawlStart?.(url);
    if (options.throwFor?.(url)) {
      throw new Error(`crawl failed for ${url}`);
    }
    await options.onCrawlEnd?.(url);
    return resultFor(url);
  });

  const close = vi.fn(async (): Promise<void> => {});

  return { crawl, close };
}

/** A `fetch` mock that resolves with the given status. */
export function fetchResolving(status = 200, body = ''): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  })) as unknown as ReturnType<typeof vi.fn>;
}
