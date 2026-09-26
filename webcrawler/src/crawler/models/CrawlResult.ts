export interface CrawlResult {
  url: string;
  html: string;
  title: string;
  timestamp: Date;
  screenshotFile: string | null;
  error: string | null;
}