import os
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from dotenv import load_dotenv
from fastmcp import FastMCP
from openai import AsyncOpenAI


MCP_DIR = Path(__file__).resolve().parent
for env_file in (MCP_DIR / ".env", MCP_DIR.parent / ".env"):
    load_dotenv(env_file, override=False)

from crawler_ctl import crawler_status
from crawler_ctl import start_crawler as launch_crawler
from crawler_ctl import stop_crawler as halt_crawler
from database_ctl import apply_pending_migrations
from database_ctl import database_status
from database_ctl import migration_status
from database_ctl import start_database as launch_database
from database_ctl import stop_database as halt_database

BACKEND_URL = os.getenv(
    "CRAWLER_BACKEND_URL",
    f"http://localhost:{os.getenv('BACKEND_PORT', '3000')}",
).rstrip("/")
CALLBACK_URL = os.getenv(
    "CRAWL_CALLBACK_URL",
    f"http://localhost:{os.getenv('BACKEND_PORT', '3000')}/api/crawl-results",
)
mcp = FastMCP("Cyber Crawler")


def _validate_http_url(value: str, field_name: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"{field_name} must be an absolute HTTP or HTTPS URL")
    return value


@mcp.tool
async def check_crawler() -> dict:
    """Check whether the Cyber Crawler backend is reachable."""
    status = crawler_status()
    status["reachable"] = status["running"]
    return status


@mcp.tool
async def get_crawler_status() -> dict:
    """Report whether the web crawler process is running."""
    return crawler_status()


@mcp.tool
async def start_crawler() -> dict:
    """Start the web crawler backend if it is not already running."""
    return launch_crawler()


@mcp.tool
async def stop_crawler() -> dict:
    """Stop the web crawler backend process."""
    return halt_crawler()


@mcp.tool
async def get_database_status() -> dict:
    """Report whether embedded Postgres is accepting connections."""
    return database_status()


@mcp.tool
async def start_database() -> dict:
    """Start embedded Postgres if it is not already listening."""
    return launch_database()


@mcp.tool
async def stop_database() -> dict:
    """Stop the embedded Postgres process."""
    return halt_database()


@mcp.tool
async def get_migration_status() -> dict:
    """List database migrations that are applied and migrations that are still pending."""
    return migration_status()


@mcp.tool
async def apply_migrations() -> dict:
    """Apply pending SQL migrations. Uses the live database when it is running."""
    return apply_pending_migrations()


@mcp.tool
async def start_crawl(urls: list[str], callback_url: str = CALLBACK_URL) -> dict:
    """Submit up to 25 HTTP(S) URLs for asynchronous crawling."""
    if not urls:
        raise ValueError("Provide at least one URL")
    if len(urls) > 25:
        raise ValueError("A crawl batch can contain at most 25 URLs")

    callback = _validate_http_url(callback_url, "callback_url")
    targets = [
        {"url": _validate_http_url(url, "url"), "callbackUrl": callback}
        for url in urls
    ]

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{BACKEND_URL}/api/process-events", json={"urls": targets}
            )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        try:
            detail = exc.response.json()
        except ValueError:
            detail = exc.response.text
        return {"accepted": False, "status_code": exc.response.status_code, "error": detail}
    except httpx.HTTPError as exc:
        return {"accepted": False, "error": str(exc)}


@mcp.tool
async def get_crawl_results(limit: int = 20) -> dict:
    """Return the most recent crawler results, including titles and excerpts."""
    if not 1 <= limit <= 50:
        raise ValueError("limit must be between 1 and 50")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{BACKEND_URL}/api/crawl-results")
            response.raise_for_status()
        payload = response.json()
        items = payload.get("items", [])
        return {"count": len(items[:limit]), "items": items[:limit]}
    except (httpx.HTTPError, ValueError) as exc:
        return {"error": str(exc), "backend_url": BACKEND_URL}


@mcp.tool
async def parse_screenshot(url: str | None = None) -> dict:
    """Parse the newest crawl screenshot with Cohere and store embedded chunks. Pass a URL to parse that page."""
    body: dict[str, str] = {}
    if url:
        body["url"] = _validate_http_url(url, "url")

    try:
        async with httpx.AsyncClient(timeout=540) as client:
            response = await client.post(f"{BACKEND_URL}/api/parse", json=body)
        try:
            payload = response.json()
        except ValueError:
            payload = {"error": response.text}
        if response.status_code >= 400:
            detail = payload.get("error") if isinstance(payload, dict) else payload
            return {"error": detail or f"Parse failed ({response.status_code})"}
        return payload if isinstance(payload, dict) else {"error": "Parse returned an unexpected response"}
    except httpx.HTTPError as exc:
        return {"error": str(exc), "backend_url": BACKEND_URL}


@mcp.tool
async def get_app_logs(limit: int = 20, level: str | None = None) -> dict:
    """Return recent crawler log rows. level can be debug, info, warn, or error."""
    if not 1 <= limit <= 200:
        raise ValueError("limit must be between 1 and 200")
    params: dict[str, str | int] = {"limit": limit}
    if level:
        params["level"] = level
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{BACKEND_URL}/api/logs", params=params)
        try:
            payload = response.json()
        except ValueError:
            payload = {"error": response.text}
        if response.status_code >= 400:
            detail = payload.get("error") if isinstance(payload, dict) else payload
            return {"error": detail or f"Logs failed ({response.status_code})"}
        return payload if isinstance(payload, dict) else {"error": "Logs returned an unexpected response"}
    except httpx.HTTPError as exc:
        return {"error": str(exc), "backend_url": BACKEND_URL}


@mcp.tool
async def summarize_text(text: str, model: str = "gpt-4o-mini") -> dict:
    """Summarize text with OpenAI; requires OPENAI_API_KEY in an env file."""
    if not os.getenv("OPENAI_API_KEY"):
        return {
            "error": "OPENAI_API_KEY is not set. Add it to mcp/.env or the workspace .env."
        }
    if not text.strip():
        raise ValueError("text must not be empty")
    if len(text) > 30_000:
        raise ValueError("text must be 30,000 characters or fewer")

    async with AsyncOpenAI() as client:
        response = await client.responses.create(
            model=model,
            instructions="Summarize the supplied text clearly and concisely. Preserve key facts.",
            input=text,
        )
    return {"summary": response.output_text, "model": model}


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()