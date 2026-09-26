# Spyber Man Front-End

Vite + React + TypeScript UI that submits crawl jobs to the Node backend, plus a local Express callback receiver (replaces the Streamlit + FastAPI sample).

## Components

- **UI** (`src/`) — React app on port `5173`
- **Callback server** (`server/`) — Express receiver on port `8000`

## Setup

```bash
npm install
```

## Run

Terminal A — backend:

```bash
cd ../back-end
npm install
npm run dev
```

Terminal B — this frontend (UI + callback receiver):

```bash
npm run dev
```

- UI: http://localhost:5173
- Callback receiver: http://localhost:8000
- Backend (expected): http://localhost:3000

Useful scripts:

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite UI + callback server |
| `npm run server` | Callback server only |
| `npm run build` | Production UI build |
| `npm run preview` | Preview production build |

## Integration flow

1. Enter URLs (one per line) or use a sample button.
2. Click **Send to API** → `POST http://localhost:3000/api/process-events` (via Vite `/backend` proxy).
3. Backend crawls asynchronously and POSTs results to `http://localhost:8000/api/crawl-results`.
4. Use **Callback Results → Refresh** to inspect delivered payloads.

## Environment

Preferred ports and URLs live in the **repo-root** [`.env`](../.env) (see [`.env.example`](../.env.example)).
VS Code compound launch **Spyber Man: Full Stack** loads that file for both processes.

| Variable | Default | Purpose |
|----------|---------|---------|
| `BACKEND_PORT` / `PORT` | `3000` | Node backend listen port |
| `FRONTEND_PORT` | `5173` | Vite UI listen port |
| `CALLBACK_PORT` | `8000` | Callback server listen port |
| `VITE_API_BASE_URL` | `http://localhost:3000` | Display / docs URL for the backend |
| `VITE_CALLBACK_URL` | `http://localhost:8000/api/crawl-results` | Absolute URL embedded in crawl requests (must be reachable by the backend) |
| `VITE_API_PROXY` | `/backend` | Browser path proxied to the backend |
| `VITE_CALLBACK_PROXY` | `/callback` | Browser path proxied to the callback server |

## Callback API

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/api/crawl-results` | Store callback payload in memory |
| `GET` | `/api/crawl-results` | List stored callbacks |
| `GET` | `/health` | Health check |
| `POST` | `/api/process-events` | Local echo only (not the crawler) |

Callback storage is in-memory and clears on restart.
