import puppeteer, { Browser, Page } from 'puppeteer';
import { CrawlResult } from './models/CrawlResult';

export class Crawler {
  private browser: Browser | null = null;

  async launch(): Promise<void> {
    this.browser = await puppeteer.launch({ headless: true });
  }

  async crawl(url: string): Promise<CrawlResult> {
    if (!this.browser) {
      await this.launch();
    }

    const page: Page = await this.browser!.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
      const html = await page.content();
      const title = await page.title();

      return { url, html, title, timestamp: new Date() };
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
