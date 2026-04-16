# Spyber Man Backend

TypeScript backend service responsible for crawl orchestration, screenshot capture, callback delivery, and crawl metadata persistence.

## What this service does

- Accepts crawl requests through `POST /api/process-events`.
- Crawls each URL using Puppeteer.
- Captures full-page screenshots under `screenGrabs/`.
- Sends crawl results to each target's `callbackUrl`.
- Records callback delivery status in SQLite (`data/spyber.sqlite3`).

## Run locally

```bash
npm install
npm run dev
```

Default service URL: `http://localhost:3000`

## Build and run

```bash
npm run build
npm start
```

## API Endpoint (Primary)

### `POST /api/process-events`

#### Request body

```json
{
  "urls": [
    {
      "url": "https://www.python.org",
      "callbackUrl": "http://localhost:8000/api/crawl-results"
    }
  ]
}
```

#### Validation rules

- `urls` is required.
- Every list item must include:
  - `url` (must be HTTP/HTTPS URI)
  - `callbackUrl` (must be HTTP/HTTPS URI)
- Additional unknown fields are rejected.

#### Immediate response (accepted)

```json
{
  "message": "Crawl initiated",
  "options": {
    "urls": [
      {
        "url": "https://www.python.org",
        "callbackUrl": "http://localhost:8000/api/crawl-results"
      }
    ]
  }
}
```

### Concurrency model

- Only one crawl batch can be active at a time.
- If another request arrives while running, service returns:

```json
{ "error": "A crawl is already in progress" }
```

### Rate limiting

- In-memory, per-IP budget: **5 requests / 60 seconds** for `POST /api/process-events`.
- On limit exceeded, service returns `429` and `Retry-After` header.

## Callback behavior

After crawling each URL, backend POSTs to that target's callback URL:

```json
{
  "status": "completed",
  "result": {
    "url": "https://www.python.org",
    "html": "<html>...</html>",
    "title": "Welcome to Python.org",
    "timestamp": "2026-04-16T00:00:00.000Z"
  },
  "callbackUrl": "http://localhost:8000/api/crawl-results",
  "receivedAt": "2026-04-16T00:00:00.000Z"
}
```

If callback fails, backend still continues processing next URL and stores failure details in DB.

## Storage

### SQLite database

- Path: `data/spyber.sqlite3`
- Table: `link_visits`
  - `url`
  - `callback_url`
  - `visited_at`
  - `callback_status`
  - `callback_error`

### Screenshots

- Directory: `screenGrabs/`
- Naming: `<hostname>-<timestamp>.png`

## Socket.IO notes

Current implementation logs connections and supports basic `crawl:request`/`crawl:start` event flow, but full socket-driven crawling is not yet wired.

## Planned crawler upgrades

Two future directions are already identified:

1. **Replace Puppeteer with `puppeteer-extra`**
   - to support plugin-driven crawling behavior.
2. **Add crawler customization controls**
   - per-domain interaction scripts/selectors,
   - configurable waiting/scrolling behavior,
   - and extraction profile customization.

Recommendation: keep existing API and callback contracts stable while these internal upgrades are introduced.

## Further docs

See repository-level docs for deeper architecture and operational guidance:

- `../documentation/backend-architecture.md`
- `../documentation/backend-api-reference.md`
- `../documentation/todos-and-technical-debt.md`
