import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

export interface LinkVisitRecord {
  url: string;
  callbackUrl: string;
  visitedAt: string;
  callbackStatus: 'success' | 'failed';
  callbackError: string | null;
  /** Public screenshot URL when a grab was produced; otherwise null. */
  screenshotUrl: string | null;
  /** OCR text extracted from the screenshot; otherwise null. */
  ocrText: string | null;
  /** Markdown from Cohere Parse, when the screenshot was parsed. */
  parsedMarkdown?: string | null;
}

/** A `link_visits` row as stored in Postgres (snake_case columns). */
export interface StoredLinkVisit {
  id: number;
  url: string;
  callback_url: string;
  visited_at: string;
  callback_status: 'success' | 'failed';
  callback_error: string | null;
  screenshot_url: string | null;
  ocr_text: string | null;
  parsed_markdown: string | null;
}

const DATA_ROOT = path.resolve(process.cwd(), '..', 'data');

let pool: pg.Pool | null = null;

function postgresPort(): number {
  const parsed = Number.parseInt(process.env.POSTGRES_PORT ?? '5432', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 5432;
}

function poolConfig(): pg.PoolConfig {
  return {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: postgresPort(),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'postgres',
    max: 5,
    ssl: false,
  };
}

function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database has not been initialized');
  }
  return pool;
}

function portOpen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(1000);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

function launchDataServer(): void {
  const runtimeDir = path.join(DATA_ROOT, '.runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const log = fs.openSync(path.join(runtimeDir, 'postgres.log'), 'a');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: DATA_ROOT,
    env: process.env,
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
}

async function waitForPort(port: number, host: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port, host)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `Embedded Postgres did not open ${host}:${port}. See data/.runtime/postgres.log.`,
  );
}

/**
 * Connect to the embedded Postgres from `../data`.
 * Starts that server when the configured port is not already accepting connections.
 * Pass `connection` to attach to a database that is already running, such as a test instance.
 */
export async function initDatabase(connection?: pg.PoolConfig): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }

  const config = connection ?? poolConfig();
  const host = typeof config.host === 'string' ? config.host : '127.0.0.1';
  const port = typeof config.port === 'number' ? config.port : postgresPort();

  if (!connection && !(await portOpen(port, host))) {
    launchDataServer();
    await waitForPort(port, host, 30_000);
  }

  pool = new Pool(config);
  await pool.query('SELECT 1');
}

/** Insert one link-visit record. */
export async function recordLinkVisit(record: LinkVisitRecord): Promise<void> {
  await getPool().query(
    `INSERT INTO link_visits (
      url,
      callback_url,
      visited_at,
      callback_status,
      callback_error,
      screenshot_url,
      ocr_text,
      parsed_markdown
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      record.url,
      record.callbackUrl,
      record.visitedAt,
      record.callbackStatus,
      record.callbackError,
      record.screenshotUrl,
      record.ocrText,
      record.parsedMarkdown ?? null,
    ],
  );
}

/** Return all stored link visits, oldest first. Useful for inspection and tests. */
export async function getAllLinkVisits(): Promise<StoredLinkVisit[]> {
  const result = await getPool().query<{
    id: number;
    url: string;
    callback_url: string;
    visited_at: Date | string;
    callback_status: 'success' | 'failed';
    callback_error: string | null;
    screenshot_url: string | null;
    ocr_text: string | null;
    parsed_markdown: string | null;
  }>('SELECT id, url, callback_url, visited_at, callback_status, callback_error, screenshot_url, ocr_text, parsed_markdown FROM link_visits ORDER BY id');

  return result.rows.map((row) => ({
    ...row,
    visited_at: row.visited_at instanceof Date ? row.visited_at.toISOString() : new Date(row.visited_at).toISOString(),
  }));
}

/** Write Cohere markdown onto the newest visit of `url` that has a screenshot. */
export async function saveParsedMarkdown(url: string, markdown: string): Promise<number | null> {
  const result = await getPool().query<{ id: number }>(
    `UPDATE link_visits
     SET parsed_markdown = $1
     WHERE id = (
       SELECT id FROM link_visits
       WHERE url = $2 AND screenshot_url IS NOT NULL
       ORDER BY id DESC
       LIMIT 1
     )
     RETURNING id`,
    [markdown, url],
  );
  return result.rows[0]?.id ?? null;
}

export interface RagChunkInput {
  index: number;
  content: string;
  embedding: number[];
}

/** Replace every rag chunk for a visit with the parsed page's embedded chunks. */
export async function replaceRagChunks(
  linkVisitId: number,
  url: string,
  chunks: RagChunkInput[],
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM rag.chunks WHERE link_visit_id = $1', [linkVisitId]);
    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO rag.chunks (link_visit_id, url, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [linkVisitId, url, chunk.index, chunk.content, `[${chunk.embedding.join(',')}]`],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listRagChunks(
  linkVisitId: number,
): Promise<Array<{ chunk_index: number; content: string; dimensions: number }>> {
  const result = await getPool().query<{ chunk_index: number; content: string; dimensions: number }>(
    `SELECT chunk_index, content, vector_dims(embedding) AS dimensions
     FROM rag.chunks
     WHERE link_visit_id = $1
     ORDER BY chunk_index`,
    [linkVisitId],
  );
  return result.rows;
}

/** Newest visit that stored a screenshot, optionally limited to one URL. */
export async function latestVisitWithScreenshot(
  url?: string,
): Promise<{ url: string; screenshot_url: string } | null> {
  const result = await getPool().query<{ url: string; screenshot_url: string }>(
    `SELECT url, screenshot_url FROM link_visits
     WHERE screenshot_url IS NOT NULL
       AND ($1::text IS NULL OR url = $1)
     ORDER BY id DESC
     LIMIT 1`,
    [url ?? null],
  );
  return result.rows[0] ?? null;
}

export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppLogInput {
  level: AppLogLevel;
  source: string;
  event: string;
  message: string;
  url?: string | null;
  durationMs?: number | null;
  details?: Record<string, unknown>;
}

export interface StoredAppLog {
  id: number;
  logged_at: string;
  level: AppLogLevel;
  source: string;
  event: string;
  message: string;
  url: string | null;
  duration_ms: number | null;
  details: Record<string, unknown>;
}

/** Persist one observability event. Failures here are logged and swallowed. */
export async function recordAppLog(entry: AppLogInput): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO app_logs (level, source, event, message, url, duration_ms, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        entry.level,
        entry.source,
        entry.event,
        entry.message.slice(0, 2000),
        entry.url ?? null,
        entry.durationMs ?? null,
        JSON.stringify(entry.details ?? {}),
      ],
    );
  } catch (error) {
    console.error('Failed to write app log:', error);
  }
}

export async function listAppLogs(limit = 50, level?: AppLogLevel): Promise<StoredAppLog[]> {
  const capped = Math.min(Math.max(limit, 1), 200);
  const result = await getPool().query<{
    id: number;
    logged_at: Date | string;
    level: AppLogLevel;
    source: string;
    event: string;
    message: string;
    url: string | null;
    duration_ms: number | null;
    details: Record<string, unknown> | null;
  }>(
    `SELECT id, logged_at, level, source, event, message, url, duration_ms, details
     FROM app_logs
     WHERE ($2::text IS NULL OR level = $2)
     ORDER BY id DESC
     LIMIT $1`,
    [capped, level ?? null],
  );
  return result.rows.map((row) => ({
    ...row,
    logged_at: row.logged_at instanceof Date ? row.logged_at.toISOString() : new Date(row.logged_at).toISOString(),
    details: row.details ?? {},
  }));
}

/** Close the client pool. Does not stop the embedded Postgres process. */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
