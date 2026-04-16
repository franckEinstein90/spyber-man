# Spyber Man Repository Documentation

This repository contains two runnable applications that work together:

1. **`back-end/`**: A TypeScript/Node.js crawler service (Express + Socket.IO + Puppeteer + SQLite).
2. **`front-end-sample-one/`**: A Python local integration app (FastAPI callback receiver + Streamlit UI).

A new comprehensive documentation set is available under **`documentation/`**.

## Documentation Index

- `documentation/README.md` — documentation map and reading order.
- `documentation/repo-overview.md` — complete repository structure and component map.
- `documentation/backend-architecture.md` — deep dive into backend architecture and runtime behavior.
- `documentation/backend-api-reference.md` — complete API contract, especially `POST /api/process-events`.
- `documentation/frontend-sample-one.md` — frontend sample behavior and API interaction model.
- `documentation/deployment-and-operations.md` — environment setup, runbooks, and observability notes.
- `documentation/todos-and-technical-debt.md` — prioritized TODOs and technical debt inventory.

## Quick Start

### Backend

```bash
cd back-end
npm install
npm run dev
```

Backend default URL: `http://localhost:3000`

### Frontend sample

```bash
cd front-end-sample-one
uv sync
uv run python api.py
# in another terminal
uv run streamlit run app.py
```

Frontend URL: `http://localhost:8501`  
FastAPI callback receiver URL: `http://localhost:8000`

## Primary Crawl Endpoint

- **Method**: `POST`
- **Path**: `/api/process-events`
- **Service**: `back-end`
- **Purpose**: Accepts crawl targets and callback URLs, performs crawling, and asynchronously POSTs crawl results back to each callback URL.

See `documentation/backend-api-reference.md` for full request/response examples, validation rules, and execution semantics.
