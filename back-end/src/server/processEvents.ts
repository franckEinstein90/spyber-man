import { Crawler } from '../crawler/Crawler';
import { CrawlResult } from '../crawler/models/CrawlResult';
import {
  CRAWL_STAGE_LABELS,
  type CrawlStage,
} from '../crawler/crawlStages';
import { CrawlRequestBody } from './models/crawlRequest';
import { SpyberManCrawlStatus } from './models/SpyberManCrawlStatus';
import { recordLinkVisit } from './database';

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_CALLBACK_TIMEOUT_MS = 10_000;

/** Minimal logger surface so callers can pass Winston, `console`, or a stub. */
export interface ProcessEventsLogger {
  error(message: string, ...meta: unknown[]): void;
}

/** The subset of {@link Crawler} that `processEvents` needs; eases testing. */
export interface CrawlerLike {
  crawl(
    url: string,
    hooks?: { onStage?: (stage: CrawlStage) => void },
  ): Promise<CrawlResult>;
  close(): Promise<void>;
}

/**
 * Lifecycle events emitted while a batch runs, so callers (e.g. the Socket.IO
 * monitor dashboard) can report live activity. All timestamps are ISO strings.
 */
export type CrawlActivityEvent =
  | { type: 'batch:start'; total: number; timestamp: string }
  | { type: 'url:start'; url: string; index: number; total: number; timestamp: string }
  | {
      type: 'url:stage';
      url: string;
      stage: CrawlStage;
      label: string;
      timestamp: string;
    }
  | {
      type: 'url:done';
      url: string;
      title: string;
      status: 'success' | 'error';
      error?: string;
      callbackStatus: 'success' | 'failed';
      timestamp: string;
    }
  | { type: 'batch:done'; total: number; succeeded: number; failed: number; timestamp: string };

/**
 * POST `payload` as JSON to `url`.
 *
 * Rejects on network error, a non-2xx status, or if the request exceeds
 * `timeoutMs` (aborted via {@link AbortSignal.timeout}). Uses the global
 * `fetch`, replacing the previous hand-rolled `http`/`https` client.
 */
export async function postJson(
  url: string,
  payload: unknown,
  timeoutMs: number = DEFAULT_CALLBACK_TIMEOUT_MS,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Callback failed (${response.status}): ${body}`);
  }
}

export interface ProcessEventsOptions {
  /** Validated crawl request: the list of `{ url, callbackUrl }` targets. */
  payload: CrawlRequestBody;
  /** Shared, mutable status object used to expose in-flight crawl URLs. */
  scrapperStatus: SpyberManCrawlStatus;
  /** Logger for callback-delivery failures. Defaults to `console`. */
  logger?: ProcessEventsLogger;
  /** Max number of targets crawled at once. Defaults to {@link DEFAULT_CONCURRENCY}. */
  concurrency?: number;
  /** Per-callback delivery timeout in ms. Defaults to {@link DEFAULT_CALLBACK_TIMEOUT_MS}. */
  callbackTimeoutMs?: number;
  /** Crawler instance to use. Defaults to a fresh {@link Crawler}; injectable for tests. */
  crawler?: CrawlerLike;
  /** Called for each lifecycle event so callers can broadcast live activity. */
  onEvent?: (event: CrawlActivityEvent) => void;
}

/**
 * Runs a batch crawl for every target in `options.payload.urls`.
 *
 * Targets are processed with bounded concurrency (see `concurrency`) using a
 * single shared {@link Crawler} (one browser reused across all targets). For
 * each target this function:
 *  1. Adds the URL to `scrapperStatus.current_urls` while it is in flight.
 *  2. Crawls the URL. A crawl that throws is converted into an `error`
 *     {@link CrawlResult} so it never aborts the rest of the batch.
 *  3. POSTs the result to the target's `callbackUrl` as
 *     `{ status, result, callbackUrl, receivedAt }`, where `status` is
 *     `'completed'` for a successful crawl or `'failed'` otherwise. Delivery is
 *     bounded by `callbackTimeoutMs`.
 *  4. Persists a `link_visits` row via {@link recordLinkVisit}, recording
 *     whether callback delivery succeeded or failed.
 *
 * Delivery/persistence are best-effort: a failed callback is logged and stored
 * as `callbackStatus: 'failed'` but does not abort the remaining targets. The
 * browser is always closed and `current_urls` cleared in the `finally` block.
 *
 * This runs asynchronously after the HTTP response in `SpyberMan.ts`, so the
 * returned promise is used for lifecycle/logging rather than the HTTP reply.
 *
 * @param options - Crawl payload, shared status, and optional overrides.
 * @returns The collected {@link CrawlResult}s in target order (length always
 *          matches the input; failed crawls yield an `error` result).
 */
export const processEvents = async (
  options: ProcessEventsOptions,
): Promise<CrawlResult[]> => {
  const {
    payload,
    scrapperStatus,
    logger = console,
    concurrency = DEFAULT_CONCURRENCY,
    callbackTimeoutMs = DEFAULT_CALLBACK_TIMEOUT_MS,
    crawler = new Crawler(),
    onEvent = () => {},
  } = options;

  const targets = payload.urls;
  const results: CrawlResult[] = new Array(targets.length);
  let nextIndex = 0;

  const now = (): string => new Date().toISOString();

  const markInFlight = (url: string): void => {
    scrapperStatus.current_urls.push(url);
  };
  const clearInFlight = (url: string): void => {
    const at = scrapperStatus.current_urls.indexOf(url);
    if (at !== -1) {
      scrapperStatus.current_urls.splice(at, 1);
    }
  };

  const processTarget = async (index: number): Promise<void> => {
    const target = targets[index];
    markInFlight(target.url);
    onEvent({
      type: 'url:start',
      url: target.url,
      index,
      total: targets.length,
      timestamp: now(),
    });

    try {
      let crawlResult: CrawlResult;
      try {
        crawlResult = await crawler.crawl(target.url, {
          onStage: (stage) => {
            onEvent({
              type: 'url:stage',
              url: target.url,
              stage,
              label: CRAWL_STAGE_LABELS[stage],
              timestamp: now(),
            });
          },
        });
      } catch (error) {
        crawlResult = {
          url: target.url,
          html: '',
          title: '',
          timestamp: new Date(),
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          screenshotUrl: null,
          ocrText: null,
        };
      }
      results[index] = crawlResult;

      const visitedAt = new Date().toISOString();
      const crawlSucceeded = crawlResult.status === 'success';
      let callbackStatus: 'success' | 'failed' = 'success';
      let callbackError: string | null = null;

      try {
        await postJson(
          target.callbackUrl,
          {
            status: crawlSucceeded ? 'completed' : 'failed',
            result: crawlResult,
            callbackUrl: target.callbackUrl,
            receivedAt: visitedAt,
          },
          callbackTimeoutMs,
        );
      } catch (error) {
        callbackStatus = 'failed';
        callbackError = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to deliver callback for ${target.url}:`, error);
      }

      await recordLinkVisit({
        url: target.url,
        callbackUrl: target.callbackUrl,
        visitedAt,
        callbackStatus,
        callbackError,
        screenshotUrl: crawlResult.screenshotUrl ?? null,
        ocrText: crawlResult.ocrText ?? null,
      });

      onEvent({
        type: 'url:done',
        url: target.url,
        title: crawlResult.title,
        status: crawlResult.status,
        error: crawlResult.error,
        callbackStatus,
        timestamp: now(),
      });
    } finally {
      clearInFlight(target.url);
    }
  };

  const worker = async (): Promise<void> => {
    for (let index = nextIndex++; index < targets.length; index = nextIndex++) {
      await processTarget(index);
    }
  };

  const poolSize = Math.max(1, Math.min(concurrency, targets.length || 1));

  onEvent({ type: 'batch:start', total: targets.length, timestamp: now() });

  try {
    await Promise.all(Array.from({ length: poolSize }, () => worker()));

    const succeeded = results.filter((r) => r?.status === 'success').length;
    onEvent({
      type: 'batch:done',
      total: targets.length,
      succeeded,
      failed: targets.length - succeeded,
      timestamp: now(),
    });

    return results;
  } finally {
    scrapperStatus.current_urls = [];
    await crawler.close();
  }
};
