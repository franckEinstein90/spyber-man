import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the database layer so tests never touch SQLite.
vi.mock('../src/server/database', () => ({
  recordLinkVisit: vi.fn().mockResolvedValue(undefined),
}));

import { recordLinkVisit } from '../src/server/database';
import { processEvents } from '../src/server/processEvents';
import type { CrawlRequestBody } from '../src/server/models/crawlRequest';
import {
  errorResult,
  fetchResolving,
  makeFakeCrawler,
  makeStatus,
  successResult,
} from './helpers';

const recordLinkVisitMock = vi.mocked(recordLinkVisit);

function payload(...urls: string[]): CrawlRequestBody {
  return {
    urls: urls.map((url) => ({ url, callbackUrl: `${url}/cb` })),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  recordLinkVisitMock.mockClear();
  recordLinkVisitMock.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchResolving(200));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('processEvents', () => {
  it('crawls every target, delivers callbacks, and records success', async () => {
    const status = makeStatus();
    const crawler = makeFakeCrawler();

    const results = await processEvents({
      payload: payload('https://a.com', 'https://b.com'),
      scrapperStatus: status,
      crawler,
      concurrency: 1,
    });

    // Results returned in input order.
    expect(results.map((r) => r.url)).toEqual(['https://a.com', 'https://b.com']);
    expect(crawler.crawl).toHaveBeenCalledTimes(2);

    // A callback was POSTed per target with a "completed" status.
    expect(fetch).toHaveBeenCalledTimes(2);
    const firstCall = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall[0]).toBe('https://a.com/cb');
    const sentBody = JSON.parse((firstCall[1] as RequestInit).body as string);
    expect(sentBody.status).toBe('completed');
    expect(sentBody.result.url).toBe('https://a.com');

    // Each visit persisted as a successful delivery.
    expect(recordLinkVisitMock).toHaveBeenCalledTimes(2);
    expect(recordLinkVisitMock.mock.calls[0][0]).toMatchObject({
      url: 'https://a.com',
      callbackStatus: 'success',
      callbackError: null,
    });

    // Cleanup: in-flight list emptied, browser closed.
    expect(status.current_urls).toEqual([]);
    expect(crawler.close).toHaveBeenCalledTimes(1);
  });

  it('records a failed delivery when the callback POST is rejected', async () => {
    vi.stubGlobal('fetch', fetchResolving(500, 'server error'));
    const status = makeStatus();
    const crawler = makeFakeCrawler();

    await processEvents({
      payload: payload('https://a.com'),
      scrapperStatus: status,
      crawler,
    });

    expect(recordLinkVisitMock).toHaveBeenCalledTimes(1);
    const record = recordLinkVisitMock.mock.calls[0][0];
    expect(record.callbackStatus).toBe('failed');
    expect(record.callbackError).toMatch(/Callback failed \(500\)/);
  });

  it('sends status "failed" when the crawl itself errored', async () => {
    const status = makeStatus();
    const crawler = makeFakeCrawler({ resultFor: (url) => errorResult(url) });

    await processEvents({
      payload: payload('https://a.com'),
      scrapperStatus: status,
      crawler,
    });

    const body = JSON.parse(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.status).toBe('failed');
    expect(body.result.status).toBe('error');
  });

  it('converts a thrown crawl into an error result without aborting the batch', async () => {
    const status = makeStatus();
    const crawler = makeFakeCrawler({
      throwFor: (url) => url === 'https://bad.com',
      resultFor: (url) => successResult(url),
    });

    const results = await processEvents({
      payload: payload('https://bad.com', 'https://good.com'),
      scrapperStatus: status,
      crawler,
      concurrency: 1,
    });

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('error');
    expect(results[0].error).toMatch(/crawl failed/);
    expect(results[1].status).toBe('success');
    // Both targets still recorded.
    expect(recordLinkVisitMock).toHaveBeenCalledTimes(2);
  });

  it('never exceeds the configured concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const crawler = makeFakeCrawler({
      onCrawlStart: () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
      },
      onCrawlEnd: async () => {
        // Yield so overlapping workers can pile up if concurrency is broken.
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      },
    });

    await processEvents({
      payload: payload('u1', 'u2', 'u3', 'u4', 'u5'),
      scrapperStatus: makeStatus(),
      crawler,
      concurrency: 2,
    });

    expect(crawler.crawl).toHaveBeenCalledTimes(5);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('emits lifecycle events in order for the monitor', async () => {
    const events: string[] = [];
    const crawler = makeFakeCrawler();

    await processEvents({
      payload: payload('https://a.com', 'https://b.com'),
      scrapperStatus: makeStatus(),
      crawler,
      concurrency: 1,
      onEvent: (event) => events.push(event.type),
    });

    expect(events[0]).toBe('batch:start');
    expect(events[events.length - 1]).toBe('batch:done');
    expect(events.filter((t) => t === 'url:start')).toHaveLength(2);
    expect(events.filter((t) => t === 'url:done')).toHaveLength(2);
    // With concurrency 1, each url:start is immediately followed by its url:done.
    expect(events).toEqual([
      'batch:start',
      'url:start',
      'url:done',
      'url:start',
      'url:done',
      'batch:done',
    ]);
  });

  it('reports the succeeded/failed tally in batch:done', async () => {
    const crawler = makeFakeCrawler({
      resultFor: (url) =>
        url === 'https://bad.com' ? errorResult(url) : successResult(url),
    });
    let done: { succeeded: number; failed: number } | undefined;

    await processEvents({
      payload: payload('https://ok.com', 'https://bad.com'),
      scrapperStatus: makeStatus(),
      crawler,
      onEvent: (event) => {
        if (event.type === 'batch:done') {
          done = { succeeded: event.succeeded, failed: event.failed };
        }
      },
    });

    expect(done).toEqual({ succeeded: 1, failed: 1 });
  });

  it('handles an empty target list gracefully', async () => {
    const status = makeStatus();
    const crawler = makeFakeCrawler();

    const results = await processEvents({
      payload: payload(),
      scrapperStatus: status,
      crawler,
    });

    expect(results).toEqual([]);
    expect(crawler.crawl).not.toHaveBeenCalled();
    expect(crawler.close).toHaveBeenCalledTimes(1);
  });
});
