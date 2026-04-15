import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { engine } from 'express-handlebars';
import path from 'path';
import { processEvents } from './processEvents';

export interface ScrapperStatus {
  running: boolean;
  current_url: string | null;
}

const ROOT = process.cwd();

export function startSpyberMan(port: number = 3000): void {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer);

  // ─── View engine ────────────────────────────────────────────────────────────
  app.engine(
    'hbs',
    engine({
      extname: '.hbs',
      defaultLayout: 'main',
      layoutsDir: path.join(ROOT, 'views', 'layouts'),
      partialsDir: path.join(ROOT, 'views', 'partials'),
    })
  );
  app.set('view engine', 'hbs');
  app.set('views', path.join(ROOT, 'views'));

  // ─── Middleware ──────────────────────────────────────────────────────────────
  app.use(bodyParser.json());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(ROOT, 'public')));

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
  app.post('/api/process-events', 
    //validateProcessEventsRequest(crawlRequestSchema),
    async (req: Request, res: Response): Promise<void> => {

    const data = req.body;
    //const processOptions = validateProcessEventsRequest(crawlRequestSchema)(data);
    /*if (!processOptions) {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }*/
    //serverReporter.clearMessages();
    //serverReporter.report(`Processing load with options: ${JSON.stringify(processOptions)}`);
    if (scrapperStatus.running) {
      res.status(400).json({ error: 'A crawl is already in progress' });
      return;
    }
    scrapperStatus.running = true;

    processEvents({
//        processOptions, 
//        crawlOptions,
        scrapperStatus
    })
    .then((results)=>{
        scrapperStatus.running = false;

    })
    .catch((err)=>{
        console.error('Error processing events:', err);
        scrapperStatus.running = false;
    });
    res.json({ message: 'Crawl initiated', options: data });
  
  });

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

  // ─── Start ───────────────────────────────────────────────────────────────────
  httpServer.listen(port, () => {
    console.log(`SpyberMan listening on http://localhost:${port}`);
  });
}
