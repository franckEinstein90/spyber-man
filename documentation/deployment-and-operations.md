# Deployment and Operations Guide

## Backend Runtime Requirements

- Node.js runtime compatible with TypeScript target/build output.
- Chromium runtime dependencies required by Puppeteer.
- Writable filesystem paths:
  - `back-end/data/` (SQLite file)
  - `back-end/screenGrabs/` (screenshots)

## Backend Local Run

```bash
cd back-end
npm install
npm run dev
```

Production-style run:

```bash
npm run build
npm start
```

## Frontend Sample Local Run

```bash
cd front-end-sample-one
uv sync
uv run python api.py
# in second terminal
uv run streamlit run app.py
```

## Networking Expectations

- Streamlit client must reach backend at `http://localhost:3000`.
- Backend must reach callback endpoint (default `http://localhost:8000/api/crawl-results`).
- Callback URL must be reachable from backend host (important in container/cloud deployments).

## Logging and Observability

### Current state

- Backend logs via Winston to console.
- Callback failures currently also write via `console.error` in `processEvents`.
- No request IDs/correlation IDs.
- No metrics endpoint.

### Recommended operational upgrades

- Standardize logger usage (remove `console.error`, keep structured logs).
- Add correlation ID middleware and include IDs in callback payload/logs.
- Expose Prometheus-style metrics for:
  - crawl job count
  - callback success/failure
  - average crawl duration

## Data Operations

### SQLite maintenance

DB file path: `back-end/data/spyber.sqlite3`

Useful quick checks:

```bash
sqlite3 back-end/data/spyber.sqlite3 ".tables"
sqlite3 back-end/data/spyber.sqlite3 "SELECT COUNT(*) FROM link_visits;"
```

### Screenshot management

Screenshots are not automatically purged. Plan disk cleanup policy for long-running environments.

## Failure Modes and Troubleshooting

- **Port already in use**: backend logs `EADDRINUSE` guidance.
- **Callback failures**: inspect `link_visits.callback_status` and `callback_error`.
- **Crawler instability**: inspect runtime dependencies for Chromium/Puppeteer.
- **Rate limiting rejections**: inspect `429` responses and `Retry-After` values.
