import { ScrapperStatus } from "./SpyberMan";
import { CrawlResult, Crawler } from "../crawler/Crawler";

export interface CrawlRequestBody {
    urls: string[];
}

export interface ProcessEventsOptions {
    urls: string[];
    scrapperStatus: ScrapperStatus;
}

export const processEvents = async (options: ProcessEventsOptions): Promise<CrawlResult[]> => {
    const crawler = new Crawler();
    const results: CrawlResult[] = [];

    try {
        for (const url of options.urls) {
            options.scrapperStatus.current_url = url;
            const crawlResult = await crawler.crawl(url);
            results.push(crawlResult);
        }

        options.scrapperStatus.current_url = null;
        return results;
    } finally {
        options.scrapperStatus.current_url = null;
        await crawler.close();
    }
} 
