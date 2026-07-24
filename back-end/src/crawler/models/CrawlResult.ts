export interface CrawlResult {
  url: string;
  html: string;
  title: string;
  timestamp: Date;
  /** Whether the page was successfully fetched, or the crawl errored out. */
  status: 'success' | 'error';
  /** Populated with the failure reason when `status === 'error'`. */
  error?: string;
}
