import express from 'express';
import bodyParser from 'body-parser';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { engine } from 'express-handlebars';
import path from 'path';
import { applyBasicSecurityHeaders } from './security';

export interface ServerStack {
  app: express.Express;
  httpServer: HttpServer;
  io: SocketIOServer;
}

export function initServerStack(root: string): ServerStack {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer);

  app.use(applyBasicSecurityHeaders);

  // Configure view engine.
  app.engine(
    'hbs',
    engine({
      extname: '.hbs',
      defaultLayout: 'main',
      layoutsDir: path.join(root, 'views', 'layouts'),
      partialsDir: path.join(root, 'views', 'partials'),
    })
  );
  app.set('view engine', 'hbs');
  app.set('views', path.join(root, 'views'));

  // Configure request parsing and static assets.
  app.use(bodyParser.json());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(root, 'public')));

  return { app, httpServer, io };
}
