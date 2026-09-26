import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const DATA_ROOT = path.resolve(HERE, '..')
export const REPO_ROOT = path.resolve(DATA_ROOT, '..')

/** Load the repo-root `.env` without overriding variables already set in the process. */
export function loadRepoEnv(): void {
  const envPath = path.join(REPO_ROOT, '.env')
  if (!fs.existsSync(envPath)) {
    return
  }

  const content = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2')
    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

export function postgresSettings(): {
  host: string
  port: number
  user: string
  password: string
  database: string
} {
  loadRepoEnv()
  const port = Number.parseInt(process.env.POSTGRES_PORT ?? '5432', 10)
  return {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: Number.isInteger(port) && port >= 0 ? port : 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'postgres',
  }
}
