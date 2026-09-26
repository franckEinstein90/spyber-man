import { NextFunction, Request, Response } from 'express';
import { Socket } from 'socket.io';
import { Logger } from 'winston';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import path from 'path';
import fs from 'fs';
import { processEvents } from './processEvents';
import { initServerStack } from './initServerStack';
import { initDatabase, listAppLogs, type AppLogLevel } from './database';
import { createRateLimiter } from './security';
import { CrawlRequestBody, crawlRequestSchema } from './models/crawlRequest';
import { SpyberManCrawlStatus } from './models/SpyberManCrawlStatus';
import { ComputeEnv } from '../compute/models';
import { answerFromKnowledge, type ConversationTurn } from './ask';
import { parseRequestedScreenshot } from './parseRequest';
import { listCrawlResults } from './resultsStore';
import {
  getScreenshotDirectory,
  isSafeScreenshotFilename,
  SCREENSHOT_ROUTE_PREFIX,
} from './screenshotPaths';

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
    current_urls: [],
  };
  // ─── Routes ─────────────────────────────────────────────────────────────────

  // Monitoring dashboard
  app.get('/', (_req: Request, res: Response) => {
    res.render('index', { title: 'Cyber Crawler — Monitor' });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      crawlRunning: scrapperStatus.running,
      currentUrls: scrapperStatus.current_urls,
    });
  });

  // Serve crawl screenshots written under screenGrabs/.
  // Example: GET /screenGrabs/example.com-1710000000000.png
  app.get(`${SCREENSHOT_ROUTE_PREFIX}/:filename`, (req: Request, res: Response) => {
    const filename = req.params.filename;
    if (!isSafeScreenshotFilename(filename)) {
      res.status(400).json({ error: 'Invalid screenshot filename' });
      return;
    }

    const filePath = path.join(getScreenshotDirectory(ROOT), filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Screenshot not found' });
      return;
    }

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.type('png');
    res.sendFile(filePath);
  });

  // Broadcast a snapshot of the current crawl status to all connected clients.
  const buildStatus = () => ({
    running: scrapperStatus.running,
    currentUrls: [...scrapperStatus.current_urls],
  });
  const broadcastStatus = (): void => {
    io.emit('crawl:status', buildStatus());
  };

  // Initiate a crawl via REST.
  const initiateCrawl = async (req: Request, res: Response): Promise<void> => {
    const data = req.body as CrawlRequestBody;
    if (scrapperStatus.running) {
      res.status(400).json({ error: 'A crawl is already in progress' });
      return;
    }
    scrapperStatus.running = true;
    broadcastStatus();

    processEvents({
      payload: data,
      scrapperStatus,
      logger,
      onEvent: (event) => {
        io.emit('crawl:activity', event);
        broadcastStatus();
      },
    })
      .then((_results) => {
        scrapperStatus.running = false;
        broadcastStatus();
      })
      .catch((err) => {
        logger.error('Error processing events:', err);
        scrapperStatus.running = false;
        broadcastStatus();
      });
    res.json({ message: 'Crawl initiated', options: data });
  };

  // Preferred, descriptive route. `/api/process-events` is kept as a
  // backward-compatible alias for existing clients and documentation.
  const crawlRoutePaths = ['/api/crawls', '/api/process-events'];
  app.post(
    crawlRoutePaths,
    processEventsRateLimiter,
    validateProcessEventsRequest,
    initiateCrawl,
  );

  app.post('/api/ask', (req: Request, res: Response) => {
    const body = req.body as { question?: unknown; history?: unknown; attachmentText?: unknown } | undefined;
    if (!body || typeof body.question !== 'string' || !body.question.trim()) {
      res.status(400).json({ error: 'question is required' });
      return;
    }
    const history = Array.isArray(body.history)
      ? body.history.flatMap((turn): ConversationTurn[] => {
          if (!turn || typeof turn !== 'object') return [];
          const record = turn as { role?: unknown; text?: unknown };
          if ((record.role !== 'user' && record.role !== 'assistant') || typeof record.text !== 'string') {
            return [];
          }
          return [{ role: record.role, text: record.text }];
        })
      : [];

    const attachmentText = typeof body.attachmentText === 'string' ? body.attachmentText : '';
    answerFromKnowledge(body.question, history, attachmentText)
      .then((result) => {
        res.json(result);
      })
      .catch((error: unknown) => {
        res.status(502).json({
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  app.get('/api/logs', (req: Request, res: Response) => {
    const rawLimit = Number.parseInt(String(req.query.limit ?? '50'), 10);
    const limit = Number.isInteger(rawLimit) ? rawLimit : 50;
    const rawLevel = typeof req.query.level === 'string' ? req.query.level : undefined;
    const levels: AppLogLevel[] = ['debug', 'info', 'warn', 'error'];
    if (rawLevel && !levels.includes(rawLevel as AppLogLevel)) {
      res.status(400).json({ error: 'level must be debug, info, warn, or error' });
      return;
    }
    if (limit < 1 || limit > 200) {
      res.status(400).json({ error: 'limit must be between 1 and 200' });
      return;
    }

    listAppLogs(limit, rawLevel as AppLogLevel | undefined)
      .then((items) => {
        res.json({ items });
      })
      .catch((error: unknown) => {
        res.status(500).json({
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  app.get('/api/crawl-results', (_req: Request, res: Response) => {
    res.json({ items: listCrawlResults() });
  });

  app.post('/api/parse', (req: Request, res: Response) => {
    const rawUrl = (req.body as { url?: unknown } | undefined)?.url;
    if (rawUrl != null && typeof rawUrl !== 'string') {
      res.status(400).json({ error: 'url must be a string' });
      return;
    }

    const url = typeof rawUrl === 'string' ? rawUrl : undefined;
    parseRequestedScreenshot(url)
      .then((result) => {
        if ('status' in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.json(result);
      })
      .catch((error: unknown) => {
        res.status(500).json({
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  app.post('/api/crawl-results', (_req: Request, res: Response) => {
    res.json({ status: 'accepted' });
  });

  // ─── Socket.io ──────────────────────────────────────────────────────────────
  // The monitor dashboard is read-only: it observes activity and accepts no
  // input. Clients receive a status snapshot on connect and live `crawl:status`
  // / `crawl:activity` events thereafter.
  io.on('connection', (socket: Socket) => {
    logger.info(`[socket] client connected  — ${socket.id}`);

    socket.emit('crawl:status', buildStatus());

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
      logger.error('Unable to initialize the embedded Postgres database:', error);
      process.exit(1);
    });
}
