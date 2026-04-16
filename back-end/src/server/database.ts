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

const DB_DIRECTORY = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIRECTORY, 'spyber.sqlite3');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database has not been initialized');
  }

  return db;
}

export async function initDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(DB_DIRECTORY, { recursive: true });

      if (!db) {
        db = new Database(DB_PATH);
      }

      getDb().exec(`
        CREATE TABLE IF NOT EXISTS link_visits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL,
          callback_url TEXT NOT NULL,
          visited_at TEXT NOT NULL,
          callback_status TEXT NOT NULL,
          callback_error TEXT
        )
      `);

      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

export async function recordLinkVisit(record: LinkVisitRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const stmt = getDb().prepare(`
        INSERT INTO link_visits (
          url,
          callback_url,
          visited_at,
          callback_status,
          callback_error
        ) VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        record.url,
        record.callbackUrl,
        record.visitedAt,
        record.callbackStatus,
        record.callbackError
      );

      resolve();
    } catch (err) {
      reject(err);
    }
  });
}
