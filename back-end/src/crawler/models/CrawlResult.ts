export interface CrawlResult {
  url: string;
  html: string;
  title: string;
  timestamp: Date;
  /** Whether the page was successfully fetched, or the crawl errored out. */
  status: 'success' | 'error';
  /** Populated with the failure reason when `status === 'error'`. */
  error?: string;
  /**
   * Public URL where the full-page screenshot can be fetched from this server
   * (e.g. `http://localhost:3000/screenGrabs/example.com-123.png`).
   * Absent when the crawl failed before a screenshot was taken.
   */
  screenshotUrl?: string | null;
  /**
   * Text extracted from the screenshot via OCR (Tesseract).
   * `null` when OCR was skipped/failed or no screenshot exists.
   */
  ocrText?: string | null;
}
