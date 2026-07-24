import type {
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

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export async function submitCrawl(
  request: CrawlRequest,
): Promise<ProcessEventsResponse> {
  const response = await fetch(`${BACKEND_BASE}/api/process-events`, {
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

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_BASE}/health`, {
      method: 'GET',
    });
    if (!response.ok) return false;
    const data = await parseJson<HealthResponse>(response);
    return data.status === 'ok';
  } catch {
    return false;
  }
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
