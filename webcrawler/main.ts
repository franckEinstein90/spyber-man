import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { SpyberManOptions, startSpyberMan } from './src/server/SpyberMan';
import { getComputeEnv } from './src/compute/getComputeEnv';

function loadWorkspaceEnv(): void {
    const envCandidates = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '..', '.env'),
    ];

    const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
    if (!envPath) {
        return;
    }

    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        const rawValue = line.slice(separatorIndex + 1).trim();
        const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');

        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

function parsePort(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function extractPort(payload: unknown): number | undefined {
    if (typeof payload === 'number' && Number.isInteger(payload) && payload > 0) {
        return payload;
    }

    if (!payload || typeof payload !== 'object') {
        return undefined;
    }

    const portPayload = payload as Record<string, unknown>;
    const candidates = [
        portPayload.port,
        portPayload.freePort,
        typeof portPayload.data === 'object' && portPayload.data !== null
            ? (portPayload.data as Record<string, unknown>).port
            : undefined,
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) {
            return candidate;
        }

        if (typeof candidate === 'string') {
            const parsed = Number.parseInt(candidate, 10);
            if (Number.isInteger(parsed) && parsed > 0) {
                return parsed;
            }
        }
    }

    return undefined;
}

loadWorkspaceEnv();

const DEFAULT_PORT = parsePort(process.env.BACKEND_PORT, parsePort(process.env.PORT, 3000));

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

async function resolvePort(): Promise<number> {
    const portManagerApiUrl = process.env.PORT_MANAGER_API_URL?.trim();
    if (!portManagerApiUrl) {
        return DEFAULT_PORT;
    }

    const freePortUrl = new URL('/api/free-port', portManagerApiUrl).toString();

    try {
        const response = await fetch(freePortUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as unknown;
        const port = extractPort(payload);
        if (!port) {
            throw new Error('Response did not include a valid port');
        }

        logger.info(`Using port ${port} from port manager at ${freePortUrl}`);
        return port;
    } catch (error) {
        logger.warn(`Failed to get free port from ${freePortUrl}; falling back to port ${DEFAULT_PORT}`, {
            error: error instanceof Error ? error.message : String(error),
        });
        return DEFAULT_PORT;
    }
}

const runSpyberMan = async () => {
    const computeEnvironment = await getComputeEnv();
    const port = await resolvePort();
    const options: SpyberManOptions = {
        computeEnvironment,
        logger,
        port,
    };

    logger.info('ComputeEnvironment:', computeEnvironment);
    logger.info(`Starting SpyberMan on port ${options.port}...`);
    await startSpyberMan(options);
};

runSpyberMan().catch((err) => {
    logger.error('Failed to start SpyberMan:', err);
    process.exit(1);
});
