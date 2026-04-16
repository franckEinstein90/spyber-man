# Frontend Sample (`front-end-sample-one/`)

## Purpose

This folder is a local integration harness:

1. **Streamlit app (`app.py`)** submits crawl jobs to Node backend.
2. **FastAPI app (`api.py`)** receives asynchronous callback results.

This allows end-to-end manual testing without external callback infrastructure.

## FastAPI Service (`api.py`)

### Endpoints

- `POST /api/process-events`
  - Local mock/process endpoint.
  - Returns request echo + TODO note (not the production crawler path).

- `POST /api/crawl-results`
  - Receives callback payload from Node backend.
  - Stores events in in-memory `received_crawl_results` list.

- `GET /api/crawl-results`
  - Returns all in-memory callback events for inspection.

- `GET /health`
  - Simple health check (`{"status":"ok"}`).

### Notes

- CORS is open (`allow_origins=["*"]`) for local development convenience.
- Callback persistence is volatile (in-memory only, reset on restart).

## Streamlit UI (`app.py`)

### Functional Flow

1. User enters one or more URLs.
2. UI builds payload where each URL shares a configured callback URL.
3. UI POSTs to backend `http://localhost:3000/api/process-events`.
4. UI displays backend immediate response.
5. User can inspect callback data through FastAPI endpoints.

### Important Defaults

- `API_BASE_URL = http://localhost:3000`
- `CALLBACK_URL = http://localhost:8000/api/crawl-results`

### UX Features

- Sample URL buttons.
- JSON response panel.
- API health check expander.
- Usage guide with payload example.

## Data Models (`models.py`)

Pydantic models define:

- `CrawlTarget` (`url`, `callbackUrl` as `HttpUrl`)
- `CrawlRequest` (`urls: List[CrawlTarget]`)
- `CrawlCallbackPayload` (callback payload structure)

## Development Commands

```bash
uv sync
uv run python api.py
uv run streamlit run app.py
```

Alternative helper commands:

```bash
make install
make api
make app
make both
```
