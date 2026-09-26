# Spyber Man

Spyber Man is a local web crawler you instruct from a chat.

1. **`webcrawler/`** — TypeScript crawler (Express, Socket.IO, Puppeteer, SQLite).
2. **`frontend/`** — Vite, React, and shadcn chat. The sidebar shows which services are running.
3. **`mcp/`** — FastMCP server the chat uses to crawl, check status, and start or stop the crawler.

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

Run the crawler and the chat. The chat starts the MCP server for you.

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

In the chat you can ask whether the web crawler is running, tell it to start or stop, or send one or more `http`/`https` URLs to crawl. Screenshots come back in the thread.

Puppeteer looks for Chrome under `~/.cache/puppeteer`. If a crawl fails because Chrome is missing, set `PUPPETEER_CACHE_DIR` to that directory before starting `webcrawler`.

## Crawl endpoint

- **Method**: `POST`
- **Preferred path**: `/api/crawls`
- **Alias**: `/api/process-events`
- **Service**: `webcrawler`
- Recent results: `GET /api/crawl-results`
- Screenshots: `GET /screengrabs/<file>.png` and `GET /screenGrabs/<file>.png`

The chat does not call that endpoint directly. It calls the MCP tools in `mcp/`, which call the crawler.
