import { ScrapperStatus } from "./SpyberMan";
import { Crawler } from "../crawler/Crawler";
import { CrawlResult } from "../crawler/models/CrawlResult";
import { CrawlRequestBody } from "./models/crawlRequest";
import http from "http";
import https from "https";

function postJson(url: string, payload: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const transport = parsedUrl.protocol === "https:" ? https : http;
        const body = JSON.stringify(payload);

        const req = transport.request(
            {
                method: "POST",
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
                path: `${parsedUrl.pathname}${parsedUrl.search}`,
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(body),
                },
            },
            (res) => {
                let responseBody = "";
                res.on("data", (chunk) => {
                    responseBody += chunk;
                });
                res.on("end", () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve();
                        return;
                    }

                    reject(
                        new Error(
                            `Callback failed (${res.statusCode ?? "unknown"}): ${responseBody}`
                        )
                    );
                });
            }
        );

        req.on("error", reject);
        req.write(body);
        req.end();
    });
}

export interface ProcessEventsOptions {
    payload: CrawlRequestBody;
    scrapperStatus: ScrapperStatus;
}

export const processEvents = async (options: ProcessEventsOptions): Promise<CrawlResult[]> => {
    const crawler = new Crawler();
    const results: CrawlResult[] = [];

    try {
        for (const target of options.payload.urls) {
            options.scrapperStatus.current_url = target.url;
            const crawlResult = await crawler.crawl(target.url);
            results.push(crawlResult);

            try {
                await postJson(target.callbackUrl, {
                    status: "completed",
                    result: crawlResult,
                    callbackUrl: target.callbackUrl,
                    receivedAt: new Date().toISOString(),
                });
            } catch (callbackError) {
                console.error(`Failed to deliver callback for ${target.url}:`, callbackError);
            }
        }

        options.scrapperStatus.current_url = null;
        return results;
    } finally {
        options.scrapperStatus.current_url = null;
        await crawler.close();
    }
} 
