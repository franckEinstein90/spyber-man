import { CrawlResult } from '../crawler/models/CrawlResult';

export interface StoredCrawlResult {
  url: string;
  title: string;
  excerpt: string;
  screenshotFile: string | null;
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
    screenshotFile: result.screenshotFile,
    error: result.error,
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
