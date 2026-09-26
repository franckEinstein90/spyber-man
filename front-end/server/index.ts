import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const PORT = Number(process.env.CALLBACK_PORT ?? 8000);

interface CrawlTarget {
  url: string;
  callbackUrl: string;
}

interface CrawlCallbackPayload {
  status: string;
  result: Record<string, unknown>;
  callbackUrl: string;
  receivedAt: string;
}

const receivedCrawlResults: CrawlCallbackPayload[] = [];

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

app.post('/api/process-events', (req, res) => {
  try {
    const urls = (req.body?.urls ?? []) as CrawlTarget[];
    const urlList = urls.map((item) => String(item.url));
    const callbackUrls = urls.map((item) => String(item.callbackUrl));
    console.info(`Received process request for ${urlList.length} URL(s):`, urlList);

    res.json({
      status: 'received',
      count: urlList.length,
      urls: urlList,
      callbackUrls,
      message: 'Events received successfully. Processing logic to be implemented.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error processing request:', message);
    res.status(400).json({ detail: message });
  }
});

app.post('/api/crawl-results', (req, res) => {
  const event = req.body as CrawlCallbackPayload;
  receivedCrawlResults.push(event);
  console.info('Received crawl callback for', event?.result?.url);
  res.json({
    status: 'accepted',
    receivedAt: new Date().toISOString(),
    totalResults: receivedCrawlResults.length,
  });
});

app.get('/api/crawl-results', (_req, res) => {
  res.json({
    count: receivedCrawlResults.length,
    items: receivedCrawlResults,
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.info(`Callback receiver listening on http://localhost:${PORT}`);
});
