# Spyber Man

Spyber Man is a local web crawler you instruct from a chat.

1. **`webcrawler/`** — TypeScript crawler (Express, Socket.IO, Puppeteer).
2. **`data/`** — embedded Postgres with pgvector. SQL migrations live in `data/migrations`.
3. **`frontend/`** — Vite, React, and shadcn chat. The sidebar shows which services are running.
4. **`mcp/`** — FastMCP server the chat uses to crawl, parse screenshots, read logs, and start or stop the crawler and the database.

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

In the chat you can ask whether the web crawler or the database is running, tell it to start or stop either one, and apply pending migrations. Send one or more `http`/`https` URLs to crawl. Screenshots and page text come back in the thread. Parsing is separate: say `parse the screenshot` to send the latest image to Cohere and store the markdown as embedded chunks. Say `show the logs` to read `app_logs`.

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
