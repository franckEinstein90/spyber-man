# TODOs and Technical Debt

This list is based on direct repository code analysis and is grouped by priority.

The chat (`frontend/`), MCP server (`mcp/`), embedded Postgres (`data/`), and `webcrawler/` folder are the current baseline. The chat can start, stop, and report the web crawler and the database, crawl a page, and parse a screenshot on request. Screenshots are written to disk and served at `/screengrabs`. The chat's recent-result list stays in memory. Parsed chunks and `app_logs` are in Postgres.

## High Priority

1. **Migrate crawler from Puppeteer to `puppeteer-extra` with pluggable behavior**
   - Future requirement: replace base Puppeteer runtime with `puppeteer-extra`.
   - Add plugin support for stealth/anti-bot scenarios and site-specific compatibility.
   - Introduce a crawler customization layer (per-domain actions, waits, click scripts, extraction profiles).
   - Keep callback payload shape stable during migration to avoid downstream breakage.

2. **Add authentication/authorization to backend crawl endpoint**
   - Current `POST /api/process-events` is unauthenticated and can be abused.
   - Introduce API key or OAuth-based protection before internet exposure.

3. **Implement durable job queue and worker model**
   - Current crawl execution is single-flight and in-process.
   - Move to persistent queue (e.g., BullMQ/RabbitMQ/SQS) for reliability and scalability.

4. **Cover the crawl HTTP API**
   - Unit tests cover crawl batching, the database client, screenshot slicing, and migrations.
   - Still missing: HTTP tests for validation, `429` rate limits, and the running server.

5. **Persist recent crawl results**
   - `webcrawler` keeps recent titles, excerpts, and screenshot names in memory only.
   - Add durable storage if those results must survive a restart.

## Medium Priority

6. **Unify logging strategy in backend**
   - `app_logs` records parse steps and callback failures, and `GET /api/logs` exposes them.
   - Winston still logs to the console, and some paths still use `console.error`.
   - Add correlation ids so a crawl, its callback, and its parse share one id.

7. **Harden crawler error visibility**
   - `Crawler.crawl` currently swallows detailed errors and returns empty result.
   - Return or log specific error diagnostics for troubleshooting.

8. **Improve concurrency model and backpressure controls**
   - A batch crawls up to 3 URLs at a time.
   - Add configurable limits and retry policies.

9. **Extend health checks**
   - `GET /health` reports whether a crawl is running.
   - It does not yet check that Postgres accepts writes or that Chrome can launch.

10. **Externalize configuration**
   - Convert hard-coded values (timeouts, user-agent, screenshot directory, rate limits) into environment-driven config.

11. **Formalize schema contracts and versioning**
    - Callback payload shape is implicit.
    - Publish OpenAPI/JSON schema and version payloads for future compatibility.

## Low Priority

12. **Socket.IO feature completion**
    - `crawl:request` handler currently contains TODO and only emits `crawl:start`.

13. **Fix naming consistency (`scrapper` -> `scraper`)**
    - Internal naming typo appears in status object/type variable naming.

14. **Repository consistency improvements**
    - Introduce root-level task runner and unified docs for both ecosystems (Node + Python).

15. **Data retention policy**
    - Define automatic pruning for screenshots and old DB rows.

## Suggested Execution Roadmap

### Phase 1 (Safety + correctness)
- Start crawler migration design (`puppeteer-extra` + customization abstraction + compatibility tests).
- Add endpoint auth.
- Add backend tests around payload validation/rate limiting.
- Improve error logging and observability.

### Phase 2 (Reliability + scale)
- Introduce queue-based async architecture.
- Add retries, idempotency keys, and worker concurrency controls.
- Persist callback events in frontend sample (or replace with dedicated receiver service).

### Phase 3 (Operational maturity)
- Health/readiness endpoints.
- Metrics and dashboards.
- Cleanup/retention automation for artifacts.
