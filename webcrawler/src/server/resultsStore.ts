import { CrawlResult } from '../crawler/models/CrawlResult';

export interface StoredCrawlResult {
  url: string;
  title: string;
  excerpt: string;
  screenshotFile: string | null;
  parsedMarkdown: string | null;
  error: string | null;
  timestamp: string;
}

const recent: StoredCrawlResult[] = [];
const MAX_RESULTS = 50;

function excerptFromHtml(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.slice(0, 500);
}

export function rememberCrawl(result: CrawlResult): StoredCrawlResult {
  const stored: StoredCrawlResult = {
    url: result.url,
    title: result.title,
    excerpt: excerptFromHtml(result.html),
    screenshotFile: result.screenshotFile ?? null,
    parsedMarkdown: result.parsedMarkdown ?? null,
    error: result.error ?? null,
    timestamp: result.timestamp instanceof Date ? result.timestamp.toISOString() : new Date(result.timestamp).toISOString(),
  };

  recent.unshift(stored);
  if (recent.length > MAX_RESULTS) {
    recent.length = MAX_RESULTS;
  }

  return stored;
}

export function listCrawlResults(): StoredCrawlResult[] {
  return recent;
}

/** Newest stored crawl that has a screenshot, optionally for one URL. */
export function findLatestCapture(url?: string): StoredCrawlResult | undefined {
  return recent.find(
    (item) => Boolean(item.screenshotFile) && !item.error && (!url || item.url === url),
  );
}

export function setParsedMarkdown(
  url: string,
  screenshotFile: string,
  markdown: string,
): StoredCrawlResult | undefined {
  const item = recent.find((entry) => entry.url === url && entry.screenshotFile === screenshotFile);
  if (!item) return undefined;
  item.parsedMarkdown = markdown;
  return item;
}
