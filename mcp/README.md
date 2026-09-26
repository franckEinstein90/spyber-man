# Cyber Crawler MCP Server

A stdio MCP server built with FastMCP. It connects to the existing crawler backend and optionally uses OpenAI to summarize text. Crawling works without an OpenAI key.

## Setup

Install [uv](https://docs.astral.sh/uv/) if it is not already available, then from this directory:

```bash
uv sync
```

The server reads `mcp/.env` first and then the workspace-level `.env`. Existing shell environment variables take precedence. Set `OPENAI_API_KEY` for summaries and for embedding parsed pages. Set `COHERE_API_KEY` (or `CO_API_KEY`) to parse screenshots. The crawler defaults can also be overridden with `CRAWLER_BACKEND_URL` and `CRAWL_CALLBACK_URL`.

The chat UI uses port `5173`. The default crawl callback is the crawler's own results endpoint on port `3000`. The MCP server uses stdio and does not listen on a TCP port.

`start_crawler` and `stop_crawler` start and stop `npm run dev` in `webcrawler/`. `start_database` and `stop_database` do the same for embedded Postgres in `data/`. `get_migration_status` lists pending SQL files, and `apply_migrations` applies them.

## Run

Start the Node backend, and the callback API if you want completed results delivered, then run:

```bash
uv run server.py
```

The server uses stdio for MCP transport. Configure an MCP client with:

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

## Tools

- `get_crawler_status` reports whether the web crawler process is listening.
- `start_crawler` starts the web crawler when it is stopped.
- `stop_crawler` stops the web crawler process.
- `check_crawler` checks backend reachability.
- `start_crawl` submits up to 25 HTTP(S) URLs as an asynchronous batch.
- `get_database_status`, `start_database`, and `stop_database` control embedded Postgres in `data/`.
- `get_migration_status` and `apply_migrations` inspect and apply `data/migrations`.
- `get_crawl_results` returns recent titles, excerpts, and screenshot file names (up to 50).
- `parse_screenshot` parses the newest stored screenshot with Cohere and stores embedded chunks. The chat waits up to 9 minutes.
- `get_app_logs` returns recent rows from `app_logs`.
- `summarize_text` summarizes text using OpenAI and `gpt-4o-mini` by default; it requires `OPENAI_API_KEY`.

See `../documentation/mcp-server.md` for the chat integration.