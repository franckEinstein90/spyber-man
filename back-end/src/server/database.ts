import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

export interface LinkVisitRecord {
  url: string;
  callbackUrl: string;
  visitedAt: string;
  callbackStatus: 'success' | 'failed';
  callbackError: string | null;
}

/** A `link_visits` row as stored in SQLite (snake_case columns). */
export interface StoredLinkVisit {
  id: number;
  url: string;
  callback_url: string;
  visited_at: string;
  callback_status: 'success' | 'failed';
  callback_error: string | null;
}

const DB_DIRECTORY = path.join(process.cwd(), 'data');
const DEFAULT_DB_PATH = path.join(DB_DIRECTORY, 'spyber.sqlite3');

let db: Database.Database | null = null;
/** Cached INSERT statement, prepared lazily on first write and reused. */
let insertStmt: Database.Statement | null = null;

function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database has not been initialized');
  }

  return db;
}

/**
 * Open (or reopen) the SQLite database and ensure the `link_visits` table
 * exists. Pass `':memory:'` for an ephemeral database in tests.
 *
 * `better-sqlite3` is synchronous; this stays `async` only so callers can
 * `await`/`.then()` it uniformly.
 */
export async function initDatabase(dbPath: string = DEFAULT_DB_PATH): Promise<void> {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  if (db) {
    db.close();
  }

  db = new Database(dbPath);
  insertStmt = null;

  db.exec(`
    CREATE TABLE IF NOT EXISTS link_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      callback_url TEXT NOT NULL,
      visited_at TEXT NOT NULL,
      callback_status TEXT NOT NULL,
      callback_error TEXT
    )
  `);
}

/** Insert one link-visit record, reusing a cached prepared statement. */
export async function recordLinkVisit(record: LinkVisitRecord): Promise<void> {
  if (!insertStmt) {
    insertStmt = getDb().prepare(`
      INSERT INTO link_visits (
        url,
        callback_url,
        visited_at,
        callback_status,
        callback_error
      ) VALUES (?, ?, ?, ?, ?)
    `);
  }

  insertStmt.run(
    record.url,
    record.callbackUrl,
    record.visitedAt,
    record.callbackStatus,
    record.callbackError,
  );
}

/** Return all stored link visits, oldest first. Useful for inspection/tests. */
export function getAllLinkVisits(): StoredLinkVisit[] {
  return getDb()
    .prepare('SELECT * FROM link_visits ORDER BY id')
    .all() as StoredLinkVisit[];
}

/** Close the database and clear cached state. Primarily for test teardown. */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
  insertStmt = null;
}
