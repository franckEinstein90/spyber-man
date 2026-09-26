# MCP server (`mcp/`)

A stdio FastMCP server. The chat starts it with `uv run server.py` from `frontend/`. You can also run it yourself for another MCP client.

## Setup

```bash
cd mcp
uv sync
```

Environment is read from `mcp/.env`, then the repo-root `.env`. Shell variables win. See `mcp/.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `CRAWLER_BACKEND_URL` | `http://localhost:3000` | Web crawler base URL |
| `CRAWL_CALLBACK_URL` | `http://localhost:3000/api/crawl-results` | Default callback for `start_crawl` |
| `OPENAI_API_KEY` | unset | Required only for `summarize_text` |

The chat and the default MCP callback both use the crawler's results endpoint on port `3000`.

## Tools

- `get_crawler_status` reports whether the web crawler process is listening.
- `start_crawler` runs `npm run dev` in `webcrawler/` when it is stopped.
- `stop_crawler` stops that process.
- `check_crawler` is the same reachability check, with a `reachable` field.
- `start_crawl` submits up to 25 HTTP(S) URLs.
- `get_crawl_results` returns recent titles, excerpts, and screenshot file names.
- `summarize_text` summarizes text with OpenAI. It needs `OPENAI_API_KEY`.

## Client config

```json
{
  "servers": {
    "cyber-crawler": {
      "type": "stdio",
      "command": "uv",
      "args": ["--directory", "/absolute/path/to/cyber-crawler/mcp", "run", "server.py"]
    }
  }
}
```
