# Cyber Crawler Frontend Sample

This folder contains a local integration sample with:

1. **Streamlit UI** (`app.py`) to submit crawl requests to the Node backend.
2. **FastAPI service** (`api.py`) to receive crawl callbacks and expose callback history.

## Components

- `app.py` — Streamlit user interface.
- `api.py` — FastAPI callback receiver + utility endpoints.
- `models.py` — Pydantic request/response models.
- `Makefile` / `run.sh` — helper commands for local execution.

## Local setup

### Install dependencies

```bash
uv sync
```

Alternative:

```bash
pip install -r requirements.txt
```

### Run services

Terminal 1:

```bash
uv run python api.py
```

Terminal 2:

```bash
uv run streamlit run app.py
```

## Endpoint map (FastAPI app)

- `POST /api/process-events`
  - Local sample endpoint returning accepted payload summary.
  - Mainly useful for standalone FastAPI testing.

- `POST /api/crawl-results`
  - Callback receiver used by Node backend.
  - Stores callback events in memory.

- `GET /api/crawl-results`
  - Returns all callback events received during current process lifetime.

- `GET /health`
  - Health check endpoint.

## Typical integration flow

1. Start Node backend (`../back-end`) on port `3000`.
2. Start this FastAPI service on port `8000`.
3. Start Streamlit app on port `8501`.
4. Submit URLs from Streamlit.
5. Observe immediate response in Streamlit + callback records via `GET /api/crawl-results`.

## Notes / limitations

- Callback event storage is in memory only (cleared on restart).
- CORS is open for local development.
- This is a development sample, not hardened production deployment code.

For deeper repository documentation, see `../documentation/`.
