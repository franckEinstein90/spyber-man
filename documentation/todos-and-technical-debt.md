# TODOs and Technical Debt

This list is based on direct repository code analysis and is grouped by priority.

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

4. **Add automated tests (backend + frontend sample)**
   - No unit/integration tests currently present.
   - Minimum target:
     - AJV request validation tests.
     - Endpoint behavior tests (400/429/success paths).
     - Callback delivery and DB record assertions.

5. **Persist frontend callback results**
   - `front-end-sample-one/api.py` stores results in memory only.
   - Add SQLite/Postgres persistence for restart resilience.

## Medium Priority

6. **Unify logging strategy in backend**
   - Replace `console.error` in `processEvents.ts` with Winston logger.
   - Include stable structured fields (url, callbackUrl, status, latencyMs).

7. **Harden crawler error visibility**
   - `Crawler.crawl` currently swallows detailed errors and returns empty result.
   - Return or log specific error diagnostics for troubleshooting.

8. **Improve concurrency model and backpressure controls**
   - Process currently crawls targets sequentially.
   - Add configurable concurrency limits and retry policies.

9. **Add health/readiness probes in backend**
   - Root route renders HTML, but no explicit `/health` endpoint.
   - Add service readiness checks including DB write and browser launch sanity checks.

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
