# Repository Overview

## Top-level Layout

```text
.
├── LICENSE
├── README.md
├── documentation/
├── back-end/
└── front-end-sample-one/
```

## Component Summary

### 1) `back-end/` (TypeScript service)

Purpose:
- Exposes crawl initiation endpoint.
- Runs Puppeteer crawler jobs.
- Sends asynchronous callback payloads for each crawled URL.
- Persists crawl execution metadata in SQLite.
- Hosts a basic dashboard page and Socket.IO server.

Core technologies:
- Express
- Socket.IO
- Puppeteer
- AJV (request validation)
- better-sqlite3
- Winston

### 2) `front-end-sample-one/` (Python local integration sample)

Purpose:
- Provides a Streamlit UI to submit crawl requests.
- Provides a FastAPI service that receives callbacks from backend.
- Serves as a test harness / local integration target.

Core technologies:
- FastAPI
- Streamlit
- Pydantic
- Requests
- Uvicorn

### 3) `documentation/`

Purpose:
- Repository-wide documentation for architecture, APIs, operations, and debt tracking.

## Runtime Interaction Model

1. User enters URLs in Streamlit (`front-end-sample-one/app.py`).
2. Streamlit sends `POST /api/process-events` to Node backend (`back-end`).
3. Node backend validates payload and crawls each URL.
4. For each URL, backend pushes result to provided callback URL (typically `front-end-sample-one/api.py:/api/crawl-results`).
5. Backend logs visit/callback status into SQLite database.

## Data Artifacts Produced

- **Screenshots**: backend writes PNG files under `back-end/screenGrabs/`.
- **SQLite DB**: backend writes crawl records to `back-end/data/spyber.sqlite3`.
- **In-memory callback store**: frontend FastAPI keeps callback payloads in process memory (`received_crawl_results`).

## Repository-level Risks

- Missing automated tests across both services.
- No consistent environment variable documentation for deployment scenarios.
- In-memory rate limiting and callback result storage are non-persistent and single-node only.
- No authentication/authorization guard on crawl endpoint.
