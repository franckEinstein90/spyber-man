import { NextFunction, Request, Response } from 'express';
import { Socket } from 'socket.io';
import { Logger } from 'winston';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { processEvents } from './processEvents';
import { initServerStack } from './initServerStack';
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
  app.post('/api/process-events', 
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
        scrapperStatus
    })
    .then((results)=>{
        scrapperStatus.running = false;

    })
    .catch((err)=>{
        logger.error('Error processing events:', err);
        scrapperStatus.running = false;
    });
    res.json({ message: 'Crawl initiated', options: data });
  
  });

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
  httpServer.listen(port, () => {
    logger.info(`SpyberMan listening on http://localhost:${port}`);
  });
}
