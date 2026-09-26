/**
 * Discrete stages of a single-URL crawl, surfaced on the live monitor.
 */
export type CrawlStage =
  | 'accessing_page'
  | 'scrolling'
  | 'taking_screenshot'
  | 'running_ocr'
  | 'extracting_content';

export const CRAWL_STAGE_LABELS: Record<CrawlStage, string> = {
  accessing_page: 'Accessing page',
  scrolling: 'Scrolling page',
  taking_screenshot: 'Taking screenshot',
  running_ocr: 'Running OCR',
  extracting_content: 'Extracting page content',
};

export type CrawlStageReporter = (stage: CrawlStage) => void;
