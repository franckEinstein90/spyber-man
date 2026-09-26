# Chat frontend (`frontend/`)

Vite, React, and shadcn UI for instructing Spyber.

## What it does

- Chat thread for crawl instructions and service control.
- Collapsible left rail with a service list. Each service shows running, stopped, or unknown.
- The only service today is the web crawler. Add another by appending a check in `frontend/src/lib/services.ts`.
- Tool steps in the thread name the MCP calls (`get_crawler_status`, `start_crawler`, `stop_crawler`, `start_crawl`, `get_crawl_results`).

The dev server proxies `/api` and `/screengrabs` to `http://localhost:3000`, and exposes `/mcp/call` so the browser can use the stdio MCP server.

## Run

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## Example instructions

- `Is the web crawler running?`
- `Start the crawler`
- `Stop the crawler`
- `Crawl https://example.com and show me the screenshot.`
