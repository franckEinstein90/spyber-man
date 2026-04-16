import winston from 'winston';
import { SpyberManOptions, startSpyberMan } from './src/server/SpyberMan';
import { getComputeEnv } from './src/compute/getComputeEnv';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'spyber-man' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        }),
    ],
});

const runSpyberMan = async () => {
    const computeEnvironment = await getComputeEnv();
    const options: SpyberManOptions = {
        computeEnvironment,
        logger,
        port: PORT,
    };

    logger.info('ComputeEnvironment:', computeEnvironment);
    logger.info(`Starting SpyberMan on port ${options.port}...`);
    await startSpyberMan(options);
};

runSpyberMan().catch((err) => {
    logger.error('Failed to start SpyberMan:', err);
    process.exit(1);
});
