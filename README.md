# Spyber Man

Spyber Man is a local agent that captures web pages and, when you ask, turns those captures into a knowledge base.

You work in the chat. A crawl saves the screenshot and the page text and stops there. Parsing is a separate step: Cohere reads the screenshot, and the markdown is split into chunks with embeddings in embedded Postgres. Later questions are answered from those chunks, and follow-ups keep the conversation. The same chat starts and stops the crawler and the database, applies migrations, and reads the logs.

1. **`frontend/`** — Vite, React, and shadcn chat. This is where you instruct the agent. The sidebar shows which services are running.
2. **`mcp/`** — FastMCP tools the chat calls to crawl, parse, read logs, and start or stop the crawler and the database.
3. **`webcrawler/`** — TypeScript crawler (Express, Socket.IO, Puppeteer). It captures pages. It does not parse them unless asked.
4. **`data/`** — embedded Postgres with pgvector. Visits, parsed chunks (`rag`), and `app_logs` are created from `data/migrations`.

## Documentation

- `documentation/README.md` — reading order.
- `documentation/repo-overview.md` — folders and how the pieces talk to each other.
- `documentation/frontend.md` — chat UI.
- `documentation/mcp-server.md` — MCP tools, including start, stop, and status.
- `documentation/backend-architecture.md` — crawler internals.
- `documentation/backend-api-reference.md` — HTTP contract.
- `documentation/deployment-and-operations.md` — how to run it.
- `documentation/todos-and-technical-debt.md` — known gaps.

## Quick start

Run the crawler and the chat. The crawler starts embedded Postgres on `POSTGRES_PORT` when it is not already listening. The chat starts the MCP server for you.

```bash
# Terminal 1 — crawler
cd webcrawler
npm install
npm run dev

# Terminal 2 — chat
cd frontend
npm install
npm run dev
```

| Service | URL |
|---|---|
| Chat | http://localhost:5173 |
| Web crawler | http://localhost:3000 |
| Embedded Postgres | `127.0.0.1:5432` |

Ask whether the crawler or the database is running, or tell the agent to start or stop either one and to apply pending migrations. Send one or more `http`/`https` URLs to capture a page. The screenshot and page text come back in the thread. Say `parse the screenshot` when you want that image turned into markdown and stored as embedded chunks. Say `show the logs` to read `app_logs`.

`COHERE_API_KEY` is required to parse. `OPENAI_API_KEY` is required for those embeddings and for text summaries. Both belong in the repo-root `.env`. See `.env.example`.

Puppeteer looks for Chrome under `~/.cache/puppeteer`. If a crawl fails because Chrome is missing, set `PUPPETEER_CACHE_DIR` to that directory before starting `webcrawler`.

## Crawl endpoint

- **Method**: `POST`
- **Preferred path**: `/api/crawls`
- **Alias**: `/api/process-events`
- **Service**: `webcrawler`
- Recent results: `GET /api/crawl-results`
- Parse a stored screenshot: `POST /api/parse`
- Crawler logs: `GET /api/logs`
- Screenshots: `GET /screengrabs/<file>.png` and `GET /screenGrabs/<file>.png`

The chat does not call that endpoint directly. It calls the MCP tools in `mcp/`, which call the crawler.
