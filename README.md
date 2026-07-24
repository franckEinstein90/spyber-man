# Spyber Man

This repository contains two runnable applications that work together:

1. **`back-end/`**: A TypeScript/Node.js crawler service (Express + Socket.IO + Puppeteer + SQLite).
2. **`front-end/`**: A Vite + React + TypeScript UI with a local Express callback receiver.

A documentation set lives under **`documentation/`**.

## Documentation Index

- `documentation/README.md` — documentation map and reading order.
- `documentation/repo-overview.md` — repository structure and component map.
- `documentation/backend-architecture.md` — backend architecture and runtime behavior.
- `documentation/backend-api-reference.md` — API contract (`POST /api/crawls` and the `/api/process-events` alias).
- `documentation/deployment-and-operations.md` — environment setup, runbooks, and observability notes.
- `documentation/todos-and-technical-debt.md` — prioritized TODOs and technical debt inventory.

## Quick Start

Preferred ports are defined in the repo-root `.env` (see `.env.example`):

| Service | Default |
|---------|---------|
| Backend | `http://localhost:3000` |
| Front-end UI | `http://localhost:5173` |
| Callback receiver | `http://localhost:8000` |

### Option A — VS Code compound launch

1. Copy `.env.example` to `.env` if needed.
2. Run and Debug → **Spyber Man: Full Stack** (starts backend + front-end together).

### Option B — Terminals

```bash
# Terminal 1 — backend
cd back-end
npm install          # also installs Puppeteer's Chrome via postinstall
npm run dev

# Terminal 2 — front-end (Vite UI + callback receiver)
cd front-end
npm install
npm run dev
```

- UI: http://localhost:5173
- Backend monitor (read-only live activity): http://localhost:3000
- Callback API: http://localhost:8000

## Primary Crawl Endpoint

- **Preferred path**: `POST /api/crawls`
- **Alias** (backward compatible): `POST /api/process-events`
- **Service**: `back-end`
- **Purpose**: Accept crawl targets and callback URLs, crawl asynchronously (bounded concurrency), POST results to each callback URL, and broadcast live activity over Socket.IO to the monitor dashboard.

Example payload:

```json
{
  "urls": [
    {
      "url": "https://example.com",
      "callbackUrl": "http://localhost:8000/api/crawl-results"
    }
  ]
}
```

See `documentation/backend-api-reference.md` and `front-end/README.md` for full request/response details, validation rules, and local callback inspection.
