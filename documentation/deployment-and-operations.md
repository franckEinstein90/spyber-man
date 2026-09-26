# Deployment and Operations Guide

## Backend Runtime Requirements

- Node.js runtime compatible with TypeScript target/build output.
- Chromium runtime dependencies required by Puppeteer.
- Writable filesystem paths:
  - `data/pgdata` (embedded Postgres files)
  - `webcrawler/screenGrabs/` (screenshots)

## Backend Local Run

```bash
cd webcrawler
npm install
npm run dev
```

Production-style run:

```bash
npm run build
npm start
```

## Chat

```bash
cd frontend
npm install
npm run dev
```

Chat URL: `http://localhost:5173`

The dev server starts `mcp/server.py` and proxies `/api` and `/screengrabs` to port 3000. Ask the chat to start the crawler if port 3000 is down.

Set `PUPPETEER_CACHE_DIR` to `~/.cache/puppeteer` when Chrome is installed there and the crawler cannot find it.

## MCP server

The chat launches this. To run it for another client:

```bash
cd mcp
uv sync
uv run server.py
```

`start_crawler` and `stop_crawler` control the `webcrawler` process. See `documentation/mcp-server.md`.

## Networking Expectations

- The chat reaches the crawler at `http://localhost:3000`.
- Crawl callbacks default to `http://localhost:3000/api/crawl-results` on the crawler itself.
- A custom callback URL must be reachable from the crawler host.

## Logging and Observability

- Backend logs via Winston to the console.
- Parse steps and callback failures are also inserted into `app_logs` (level, source, event, message, url, duration). Read them with `GET /api/logs` or by asking the chat to show the logs.
- `psql` with `PGSSLMODE=disable`: `SELECT logged_at, level, event, message FROM app_logs ORDER BY id DESC LIMIT 20;`
- There is no metrics endpoint and no request-correlation id yet.

## Data Operations

### Postgres

The crawler starts embedded Postgres when `POSTGRES_PORT` is not already open. You can also start it yourself:

```bash
cd data
npm install
npm run dev
```

Useful checks, with `PGSSLMODE=disable`:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT:-5432}/postgres" -c '\dt'
psql "postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT:-5432}/postgres" -c '\dt rag.*'
psql "postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT:-5432}/postgres" -c 'SELECT COUNT(*) FROM link_visits;'
```

### Screenshot management

Screenshots are not automatically purged. Plan disk cleanup policy for long-running environments.

## Failure Modes and Troubleshooting

- **Port already in use**: backend logs `EADDRINUSE` guidance.
- **Callback failures**: inspect `link_visits.callback_status` and `callback_error`.
- **Crawler instability**: inspect runtime dependencies for Chromium/Puppeteer.
- **Rate limiting rejections**: inspect `429` responses and `Retry-After` values.
