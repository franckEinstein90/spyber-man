export interface SpyberManCrawlStatus {
  running: boolean;
  /** URLs currently being crawled in the active batch (supports concurrency). */
  current_urls: string[];
}