# Backend Architecture (`back-end/`)

## Mission

The backend service accepts crawl requests, executes website crawl/snapshot jobs via Puppeteer, delivers asynchronous callback events per target URL, and records link-level delivery status in SQLite.

## Entry Point and Boot Sequence

- **Entry file**: `main.ts`
- Boot flow:
  1. Build Winston logger.
  2. Detect compute environment (OS/CPU/memory/GPU).
  3. Construct `SpyberManOptions` (`logger`, `port`, `computeEnvironment`).
  4. Start server stack via `startSpyberMan`.

## Server Composition

Implemented in `src/server/initServerStack.ts`:

- `express()` app instance.
- HTTP server wrapping Express.
- Socket.IO server attached to HTTP server.
- Handlebars template engine (`.hbs`) for dashboard rendering.
- JSON and URL-encoded body parsing middleware.
- Static asset hosting from `public/`.
- Basic security headers middleware.

## Request Validation and Security

### Payload Validation

`src/server/SpyberMan.ts` compiles AJV schema from `src/server/models/crawlRequest.ts`:

- Body must be object with property `urls`.
- `urls` must be array of objects `{ url, callbackUrl }`.
- Both fields must be URI strings and match `^https?://`.
- Additional properties are rejected.

### Rate Limiting

`src/server/security.ts` provides an in-memory per-IP limiter:

- Current backend route policy on `/api/process-events`: **5 requests per 60 seconds per client key**.
- Exceeding limit returns `429` + `Retry-After` header.

### Security Headers

`applyBasicSecurityHeaders` sets:

- `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS, etc.
- `Cross-Origin-Resource-Policy` varies by `/public/` path.

## Core Endpoint and Processing Pipeline

### Crawl Initiation Endpoint

`POST /api/process-events` in `src/server/SpyberMan.ts`:

1. Enforce rate limit.
2. Validate request body.
3. Reject if another crawl is already running (`scrapperStatus.running`).
4. Fire async `processEvents(...)` without blocking request lifecycle.
5. Return immediate success response (`{"message":"Crawl initiated", ...}`).

### Event Processing Engine

`src/server/processEvents.ts`:

For each target in payload:

1. Update `scrapperStatus.current_url`.
2. Run crawler (`crawler.crawl(target.url)`).
3. POST callback payload to `target.callbackUrl`.
4. Persist link visit record with callback delivery outcome.

Callback payload shape currently sent by backend:

```json
{
  "status": "completed",
  "result": {
    "url": "https://example.com",
    "html": "<html>...</html>",
    "title": "Example",
    "timestamp": "2026-04-16T00:00:00.000Z"
  },
  "callbackUrl": "http://localhost:8000/api/crawl-results",
  "receivedAt": "2026-04-16T00:00:00.000Z"
}
```

## Crawler Internals

`src/crawler/Crawler.ts`:

- Lazily launches one Puppeteer browser instance.
- For each URL:
  - Opens a new page.
  - Sets viewport/user-agent/timeouts.
  - Navigates with `waitUntil: 'domcontentloaded'`.
  - Waits 3 seconds and attempts cookie/close button clicks (best effort).
  - Scrolls through page to trigger lazy loading.
  - Saves full-page screenshot to `screenGrabs/`.
  - Returns HTML + page title + timestamp.
- Ensures page close in `finally`.
- Browser close is called by `processEvents` when done.

## Planned Crawler Evolution

The current crawler is based on core Puppeteer, but a planned near-term direction is to migrate to
`puppeteer-extra` and introduce explicit customization hooks.

Target improvements:

- Plugin-based behavior (for example stealth/anti-bot support where legally and ethically appropriate).
- Per-domain crawl recipes (cookie banner strategies, custom selectors/actions, wait strategies).
- Configurable extraction profiles (title-only, metadata-focused, full HTML, selective DOM extraction).
- Runtime flags/env-driven toggles so operators can tune crawl behavior without code changes.

Migration note:
- Keep `POST /api/process-events` and callback payload contracts backward compatible while evolving internals.

## Persistence Model

`src/server/database.ts` uses `better-sqlite3`:

- DB file: `data/spyber.sqlite3`
- Table: `link_visits`
  - `id`
  - `url`
  - `callback_url`
  - `visited_at`
  - `callback_status` (`success | failed` logical enum)
  - `callback_error` (nullable)

Persistence purpose:
- Audit callback delivery success/failure per target URL.
- Local troubleshooting and forensic trace.

## Socket.IO Surface

Current socket behavior in `src/server/SpyberMan.ts`:

- Logs connections/disconnections.
- Accepts `crawl:request` event and emits `crawl:start`.
- Contains TODO marker for actual crawler integration over sockets.

## Operational Notes

- Startup fails hard when logger missing or DB init fails.
- Port conflict (`EADDRINUSE`) is explicitly logged.
- Crawl execution is effectively single-flight due to `scrapperStatus.running` guard.
- Callback network errors do not abort whole batch, but are persisted as failed callback status.
