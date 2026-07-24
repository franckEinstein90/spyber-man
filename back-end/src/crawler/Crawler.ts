import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { CrawlResult } from './models/CrawlResult';
import {
  buildScreenshotUrl,
  getScreenshotDirectory,
} from '../server/screenshotPaths';
import { closeOcrWorker, extractTextFromImage } from './ocr';
import type { CrawlStageReporter } from './crawlStages';

export interface CrawlHooks {
  /** Fired as the crawler enters each stage of processing this URL. */
  onStage?: CrawlStageReporter;
}

export class Crawler {
  private browserArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
  private userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  private browser: Browser | null = null;
  private readonly screenshotDir = getScreenshotDirectory();
  private readonly navigationTimeoutMs = 60000;

  async launch(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: this.browserArgs,
    });
  }

  async crawl(url: string, hooks: CrawlHooks = {}): Promise<CrawlResult> {
    const report = hooks.onStage ?? (() => {});

    if (!this.browser) {
      await this.launch();
    }

    const page: Page = await this.browser!.newPage();
    await page.setViewport({ width: 1280, height: 3000 });
    await page.setDefaultNavigationTimeout(this.navigationTimeoutMs);
    await page.setDefaultTimeout(5000);
    await page.setUserAgent(this.userAgent);

    try {
      report('accessing_page');
      // networkidle2 can hang on sites with long-lived requests (ads, websockets, analytics)
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.navigationTimeoutMs,
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await page.click('button[aria-label="Accept cookies"]', { delay: 100 }).catch(() => {});
      await page.click('button[aria-label="Close"]', { delay: 100 }).catch(() => {});

      report('scrolling');
      // Scroll through the page to trigger lazy-loaded content
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 500;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= document.body.scrollHeight) {
              clearInterval(timer);
              window.scrollTo(0, 0); // scroll back to top before screenshot
              resolve();
            }
          }, 100);
        });
      });

      report('taking_screenshot');
      fs.mkdirSync(this.screenshotDir, { recursive: true });
      const safeHost = new URL(url).hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${safeHost}-${Date.now()}.png`;
      const screenshotPath = path.join(this.screenshotDir, filename);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      report('running_ocr');
      let ocrText: string | null = null;
      try {
        const text = await extractTextFromImage(screenshotPath);
        ocrText = text.length > 0 ? text : null;
      } catch (ocrError) {
        // OCR is best-effort; crawl success should not depend on it.
        console.error(`OCR failed for ${url}:`, ocrError);
        ocrText = null;
      }

      report('extracting_content');
      const html = await page.content();
      const title = await page.title();

      return {
        url,
        html,
        title,
        timestamp: new Date(),
        status: 'success',
        screenshotUrl: buildScreenshotUrl(filename),
        ocrText,
      };
    } catch (error) {
      return {
        url,
        html: '',
        title: '',
        timestamp: new Date(),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        screenshotUrl: null,
        ocrText: null,
      };
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    await closeOcrWorker();
  }
}
