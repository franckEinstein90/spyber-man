import { NextFunction, Request, Response } from 'express';
import { Socket } from 'socket.io';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { processEvents } from './processEvents';
import { initServerStack } from './initServerStack';
import { initDatabase } from './database';
import { createRateLimiter } from './security';
import { CrawlRequestBody, crawlRequestSchema } from './models/crawlRequest';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateCrawlRequest = ajv.compile(crawlRequestSchema);

function validateProcessEventsRequest(req: Request, res: Response, next: NextFunction): void {
  const isValid = validateCrawlRequest(req.body);

  if (!isValid) {
    res.status(400).json({
      error: 'Invalid request body',
      details: validateCrawlRequest.errors,
    });
    return;
  }

  next();
}

const processEventsRateLimiter = createRateLimiter(5, 60 * 1000);

export interface ScrapperStatus {
  running: boolean;
  current_url: string | null;
}

const ROOT = process.cwd();

export function startSpyberMan(port: number = 3000): void {
  const { app, httpServer, io } = initServerStack(ROOT);

  const scrapperStatus: ScrapperStatus = {
    running: false,
    current_url: null as string | null,
  };
  // ─── Routes ─────────────────────────────────────────────────────────────────

  // Monitoring dashboard
  app.get('/', (_req: Request, res: Response) => {
    res.render('index', { title: 'Cyber Crawler — Monitor' });
  });

  // Initiate a crawl via REST
  app.post(
    '/api/process-events',
    processEventsRateLimiter,
    validateProcessEventsRequest,
    async (req: Request, res: Response): Promise<void> => {
      const data = req.body as CrawlRequestBody;
      //serverReporter.clearMessages();
      //serverReporter.report(`Processing load with options: ${JSON.stringify(processOptions)}`);
      if (scrapperStatus.running) {
        res.status(400).json({ error: 'A crawl is already in progress' });
        return;
      }
      scrapperStatus.running = true;

      processEvents({
        payload: data,
        //        processOptions,
        //        crawlOptions,
        scrapperStatus,
      })
        .then((_results) => {
          scrapperStatus.running = false;
        })
        .catch((err) => {
          console.error('Error processing events:', err);
          scrapperStatus.running = false;
        });
      res.json({ message: 'Crawl initiated', options: data });
    }
  );

  // ─── Socket.io ──────────────────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] client connected  — ${socket.id}`);

    // Client can also kick off a crawl over the socket
    socket.on('crawl:request', (data: { url: string }) => {
      console.log(`[socket] crawl requested for ${data.url}`);
      io.emit('crawl:start', { url: data.url });
      // TODO: invoke Crawler and stream results back
    });

    socket.on('disconnect', () => {
      console.log(`[socket] client disconnected — ${socket.id}`);
    });
  });

  initDatabase()
    .then(() => {
      httpServer.listen(port, () => {
        console.log(`SpyberMan listening on http://localhost:${port}`);
      });
    })
    .catch((error) => {
      console.error('Unable to initialize local SQLite database:', error);
      process.exit(1);
    });
}
