# Chat frontend (`frontend/`)

Vite, React, and shadcn UI for instructing Spyber.

## What it does

- Chat thread for crawl instructions and service control.
- Collapsible left rail with a service list. Each service shows running, stopped, or unknown.
- The rail lists the web crawler and the database. Add another by appending a check in `frontend/src/lib/services.ts`.
- Tool steps in the thread name the MCP calls (`get_crawler_status`, `start_crawler`, `stop_crawler`, `get_database_status`, `start_database`, `stop_database`, `start_crawl`, `get_crawl_results`, `parse_screenshot`, `get_app_logs`).

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
- `Parse the latest screenshot.`
- `Are any database migrations pending?`
- `Show the logs.`
- `What do the stored pages say about peat?`
