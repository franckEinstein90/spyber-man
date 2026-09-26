# Cyber Crawler MCP Server

A stdio MCP server built with FastMCP. It connects to the existing crawler backend and optionally uses OpenAI to summarize text. Crawling works without an OpenAI key.

## Setup

Install [uv](https://docs.astral.sh/uv/) if it is not already available, then from this directory:

```bash
uv sync
```

The server reads `mcp/.env` first and then the workspace-level `.env`. Existing shell environment variables take precedence. To use OpenAI summaries, set `OPENAI_API_KEY` in either file. The crawler defaults can also be overridden with `CRAWLER_BACKEND_URL` and `CRAWL_CALLBACK_URL`.

The chat passes `http://localhost:3000/api/crawl-results` as the callback, and the crawler also keeps recent results in memory. The default `CRAWL_CALLBACK_URL` is still the sample API at `http://localhost:8000/api/crawl-results` for clients that do not override it.

`start_crawler` and `stop_crawler` start and stop `npm run dev` in `webcrawler/`.

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
- `get_crawl_results` returns recent titles, excerpts, and screenshot file names (up to 50).
- `summarize_text` summarizes text using OpenAI and `gpt-4o-mini` by default; it requires `OPENAI_API_KEY`.

See `../documentation/mcp-server.md` for the chat integration.