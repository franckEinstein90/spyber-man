# Repository Overview

## Top-level Layout

```text
.
├── LICENSE
├── README.md
├── documentation/
├── webcrawler/
├── data/
├── frontend/
└── mcp/
```

## Component Summary

### 1) `webcrawler/` (TypeScript service)

Purpose:
- Exposes crawl initiation endpoint.
- Runs Puppeteer crawler jobs and writes full-page screenshots.
- Sends asynchronous callback payloads for each crawled URL.
- Keeps a short in-memory list of recent titles, excerpts, and screenshot file names.
- Persists crawl execution metadata in embedded Postgres.
- Hosts a basic dashboard page and Socket.IO server.

Core technologies:
- Express
- Socket.IO
- Puppeteer
- AJV (request validation)
- pg (client for the embedded Postgres in `data/`)
- Winston

### 2) `data/` (embedded Postgres)

Purpose:
- Runs PGlite, an embedded Postgres, on `POSTGRES_PORT` from the repo-root `.env`.
- Loads the pgvector extension and applies `data/migrations/*.sql` on startup.
- Stores database files in `data/pgdata`.

Core technologies:
- PGlite
- pgvector

### 3) `frontend/` (chat UI)

Purpose:
- Chat for crawl instructions and for starting, stopping, and checking the web crawler.
- Collapsible sidebar with the web crawler and the database.

Core technologies:
- Vite
- React
- shadcn/ui
- Tailwind CSS

### 4) `mcp/` (MCP server)

Purpose:
- stdio tools the chat calls: crawler and database control, crawl, parse a screenshot, recent results, logs, and optional text summary.
- Starts and stops the `webcrawler` and `data` processes on the local machine.

Core technologies:
- Python
- FastMCP
- httpx

### 5) `documentation/`

Purpose:
- Repository-wide documentation for architecture, APIs, operations, and debt tracking.

## Runtime Interaction Model

1. User instructs the chat (`frontend/`, port 5173).
2. The chat calls MCP tools (`mcp/server.py`) over stdio.
3. `start_crawl` posts `POST /api/process-events` to `webcrawler` (port 3000).
4. The crawler visits each URL, writes a PNG under `screenGrabs/`, stores a short result in memory, and POSTs the full result to the callback URL.
5. The chat polls `get_crawl_results` and shows the title, excerpt, and screenshot. Parsing is a later request: `parse_screenshot` posts `POST /api/parse`, which calls Cohere and writes embedded chunks to `rag.chunks`.
6. `start_crawler` and `stop_crawler` start or stop the Node process. `start_database` and `stop_database` do the same for embedded Postgres. The sidebar polls both status tools.
7. `get_app_logs` reads `app_logs`, which records parse steps and callback failures.

## Data Artifacts Produced

- **Screenshots**: backend writes PNG files under `webcrawler/screenGrabs/`.
- **Postgres**: embedded database files live in `data/pgdata`. Migrations are in `data/migrations`. The server listens on `POSTGRES_PORT`. Crawl visits are in `link_visits`. Parsed text is chunked into `rag.chunks` with `text-embedding-ada-002` vectors. Operational events are in `app_logs`.
- **In-memory crawl results**: `webcrawler` keeps recent titles, excerpts, screenshot names, and parsed markdown for `GET /api/crawl-results`. That list does not survive a restart.

## Repository-level Risks

- Missing automated tests across both services.
- No consistent environment variable documentation for deployment scenarios.
- In-memory rate limiting and callback result storage are non-persistent and single-node only.
- No authentication/authorization guard on crawl endpoint.
