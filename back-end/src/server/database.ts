import fs from 'fs';
import path from 'path';

const { DatabaseSync } = require('node:sqlite');

type SQLiteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => { run: (...params: unknown[]) => void };
};

export interface LinkVisitRecord {
  url: string;
  callbackUrl: string;
  visitedAt: string;
  callbackStatus: 'success' | 'failed';
  callbackError: string | null;
}

const DB_DIRECTORY = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIRECTORY, 'spyber.sqlite3');

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) {
    throw new Error('Database has not been initialized');
  }

  return db;
}

export async function initDatabase(): Promise<void> {
  fs.mkdirSync(DB_DIRECTORY, { recursive: true });

  if (!db) {
    db = new DatabaseSync(DB_PATH) as SQLiteDatabase;
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
}

export async function recordLinkVisit(record: LinkVisitRecord): Promise<void> {
  getDb()
    .prepare(
      `
      INSERT INTO link_visits (
        url,
        callback_url,
        visited_at,
        callback_status,
        callback_error
      ) VALUES (?, ?, ?, ?, ?)
    `
    )
    .run(
      record.url,
      record.callbackUrl,
      record.visitedAt,
      record.callbackStatus,
      record.callbackError
    );
}
