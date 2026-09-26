# Repository Overview

## Top-level Layout

```text
.
├── LICENSE
├── README.md
├── documentation/
├── webcrawler/
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
- Persists crawl execution metadata in SQLite.
- Hosts a basic dashboard page and Socket.IO server.

Core technologies:
- Express
- Socket.IO
- Puppeteer
- AJV (request validation)
- better-sqlite3
- Winston

### 2) `frontend/` (chat UI)

Purpose:
- Chat for crawl instructions and for starting, stopping, and checking the web crawler.
- Collapsible sidebar with a service status list. The web crawler is the first entry.

Core technologies:
- Vite
- React
- shadcn/ui
- Tailwind CSS

### 3) `mcp/` (MCP server)

Purpose:
- stdio tools the chat calls: status, start, stop, crawl, recent results, and optional text summary.
- Starts and stops the `webcrawler` process on the local machine.

Core technologies:
- Python
- FastMCP
- httpx

### 4) `documentation/`

Purpose:
- Repository-wide documentation for architecture, APIs, operations, and debt tracking.

## Runtime Interaction Model

1. User instructs the chat (`frontend/`, port 5173).
2. The chat calls MCP tools (`mcp/server.py`) over stdio.
3. `start_crawl` posts `POST /api/process-events` to `webcrawler` (port 3000).
4. The crawler visits each URL, writes a PNG under `screenGrabs/`, stores a short result in memory, and POSTs the full result to the callback URL.
5. The chat polls `get_crawl_results` and shows the title, excerpt, and screenshot.
6. `start_crawler` and `stop_crawler` start or stop the Node process. The sidebar polls `get_crawler_status`.

## Data Artifacts Produced

- **Screenshots**: backend writes PNG files under `webcrawler/screenGrabs/`.
- **SQLite DB**: backend writes crawl records to `webcrawler/data/spyber.sqlite3`.
- **In-memory crawl results**: `webcrawler` keeps recent titles, excerpts, and screenshot names for `GET /api/crawl-results`.

## Repository-level Risks

- Missing automated tests across both services.
- No consistent environment variable documentation for deployment scenarios.
- In-memory rate limiting and callback result storage are non-persistent and single-node only.
- No authentication/authorization guard on crawl endpoint.
