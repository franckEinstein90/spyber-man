import type {
  CrawlCallbackPayload,
  CrawlRequest,
  CrawlResultsList,
  HealthResponse,
  ProcessEventsResponse,
} from './types';

/** Browser -> Vite proxy -> backend (avoids CORS). */
const BACKEND_BASE = import.meta.env.VITE_API_PROXY ?? '/backend';

/** Browser -> Vite proxy -> callback server. */
const CALLBACK_BASE = import.meta.env.VITE_CALLBACK_PROXY ?? '/callback';

/**
 * Absolute callback URL the Node backend will POST to.
 * Must be reachable from the backend process (not the browser).
 */
export const CALLBACK_URL =
  import.meta.env.VITE_CALLBACK_URL ?? 'http://localhost:8000/api/crawl-results';

export const BACKEND_DISPLAY_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const CRAWL_PATH = '/api/crawls';
const IDLE_POLL_MS = 500;
const RESULT_POLL_MS = 750;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const RESULT_TIMEOUT_MS = 5 * 60 * 1000;

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Shared POST helper used by batch and individual submit paths. */
async function postCrawl(
  request: CrawlRequest,
): Promise<ProcessEventsResponse> {
  const response = await fetch(`${BACKEND_BASE}${CRAWL_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const data = await parseJson<ProcessEventsResponse>(response);
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}

/** Submit all URLs in a single crawl request (batch mode). */
export async function submitCrawl(
  request: CrawlRequest,
): Promise<ProcessEventsResponse> {
  return postCrawl(request);
}

/**
 * Wait until the backend reports no crawl in progress.
 * Needed because the server only allows one crawl batch at a time.
 */
export async function waitForCrawlIdle(
  timeoutMs: number = IDLE_TIMEOUT_MS,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const health = await fetchBackendHealth();
    if (!health?.crawlRunning) {
      return;
    }
    await sleep(IDLE_POLL_MS);
  }
  throw new Error('Timed out waiting for the previous crawl to finish');
}

/**
 * Poll the callback receiver until a new result for `url` arrives
 * (item index past `seenCount`), or until timeout.
 */
export async function waitForCrawlResult(
  url: string,
  seenCount: number,
  timeoutMs: number = RESULT_TIMEOUT_MS,
): Promise<CrawlCallbackPayload> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const list = await listCrawlResults();
    const match = list.items
      .slice(seenCount)
      .find((item) => item.result?.url === url);
    if (match) {
      return match;
    }
    await sleep(RESULT_POLL_MS);
  }
  throw new Error(`Timed out waiting for crawl result for ${url}`);
}

export interface IndividualCrawlOptions {
  /** Absolute callback URL the backend should POST to. */
  callbackUrl: string;
  /** When true (default), wait for the crawl callback and return it. */
  waitForResult?: boolean;
}

export interface IndividualCrawlOutcome {
  acceptResponse: ProcessEventsResponse;
  crawlResult: CrawlCallbackPayload | null;
}

/**
 * Submit a single URL as its own crawl request, then optionally wait for the
 * callback payload so the UI can display the crawl result.
 */
export async function submitIndividualCrawl(
  url: string,
  options: IndividualCrawlOptions,
): Promise<IndividualCrawlOutcome> {
  const callbackUrl = options.callbackUrl;
  const waitForResult = options.waitForResult !== false;

  await waitForCrawlIdle();

  const before = waitForResult ? await listCrawlResults() : null;
  const acceptResponse = await postCrawl({
    urls: [{ url, callbackUrl }],
  });

  if (!waitForResult) {
    return { acceptResponse, crawlResult: null };
  }

  await waitForCrawlIdle();
  const crawlResult = await waitForCrawlResult(url, before?.count ?? 0);
  return { acceptResponse, crawlResult };
}

export async function fetchBackendHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${BACKEND_BASE}/health`, { method: 'GET' });
    if (!response.ok) return null;
    return parseJson<HealthResponse>(response);
  } catch {
    return null;
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  const data = await fetchBackendHealth();
  return data?.status === 'ok';
}

export async function checkCallbackHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${CALLBACK_BASE}/health`, {
      method: 'GET',
    });
    if (!response.ok) return false;
    const data = await parseJson<HealthResponse>(response);
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export async function listCrawlResults(): Promise<CrawlResultsList> {
  const response = await fetch(`${CALLBACK_BASE}/api/crawl-results`);
  if (!response.ok) {
    throw new Error(`Failed to load crawl results (${response.status})`);
  }
  return parseJson<CrawlResultsList>(response);
}
