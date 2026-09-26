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

BACKEND_URL = os.getenv("CRAWLER_BACKEND_URL", "http://localhost:3000").rstrip("/")
CALLBACK_URL = os.getenv(
    "CRAWL_CALLBACK_URL", "http://localhost:8000/api/crawl-results"
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