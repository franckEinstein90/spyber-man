import { NextFunction, Request, Response } from 'express';
import { Socket } from 'socket.io';
import { Logger } from 'winston';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { processEvents } from './processEvents';
import { initServerStack } from './initServerStack';
import { initDatabase } from './database';
import { createRateLimiter } from './security';
import { CrawlRequestBody, crawlRequestSchema } from './models/crawlRequest';
import { SpyberManCrawlStatus } from './models/SpyberManCrawlStatus';
import { ComputeEnv } from '../compute/models';

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
const ROOT = process.cwd();

export interface SpyberManOptions {
  computeEnvironment?: ComputeEnv;
  logger?: Logger;
  port?: number;
}

export function startSpyberMan(options: SpyberManOptions = {}): void {
  const port = options.port ?? 3000;
  if (!options.logger) {
    throw new Error('Logger is required in SpyberManOptions');
  }
  const logger = options.logger;
  const { app, httpServer, io } = initServerStack(ROOT);

  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use. Stop the other process or set PORT to a different value.`);
      return;
    }

    logger.error('HTTP server failed to start:', error);
  });

  const scrapperStatus: SpyberManCrawlStatus = {
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
      if (scrapperStatus.running) {
        res.status(400).json({ error: 'A crawl is already in progress' });
        return;
      }
      scrapperStatus.running = true;

      processEvents({
        payload: data,
        scrapperStatus,
      })
        .then((_results) => {
          scrapperStatus.running = false;
        })
        .catch((err) => {
          logger.error('Error processing events:', err);
          scrapperStatus.running = false;
        });
      res.json({ message: 'Crawl initiated', options: data });
    }
  );

  // ─── Socket.io ──────────────────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    logger.info(`[socket] client connected  — ${socket.id}`);

    // Client can also kick off a crawl over the socket
    socket.on('crawl:request', (data: { url: string }) => {
      logger.info(`[socket] crawl requested for ${data.url}`);
      io.emit('crawl:start', { url: data.url });
      // TODO: invoke Crawler and stream results back
    });

    socket.on('disconnect', () => {
      logger.info(`[socket] client disconnected — ${socket.id}`);
    });
  });

  // ─── Start ───────────────────────────────────────────────────────────────────
  initDatabase()
    .then(() => {
      httpServer.listen(port, () => {
        logger.info(`SpyberMan listening on http://localhost:${port}`);
      });
    })
    .catch((error) => {
      logger.error('Unable to initialize local SQLite database:', error);
      process.exit(1);
    });
}
