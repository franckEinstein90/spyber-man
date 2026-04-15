import { startSpyberMan } from './src/server/SpyberMan';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

startSpyberMan(PORT);
