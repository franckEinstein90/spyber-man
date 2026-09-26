# Documentation Home

This folder centralizes repository-level and service-level documentation.

## Recommended Reading Order

1. **`repo-overview.md`** — understand all folders, responsibilities, and relationships.
2. **`frontend.md`** — chat UI and the service rail.
3. **`mcp-server.md`** — MCP tools, including crawler start, stop, and status.
4. **`backend-architecture.md`** — crawler internals and processing flow.
5. **`backend-api-reference.md`** — endpoint-level contract and payload schema.
6. **`frontend-sample-one.md`** — the older Streamlit and FastAPI sample.
7. **`deployment-and-operations.md`** — run and operate locally.
8. **`todos-and-technical-debt.md`** — known gaps and prioritized improvements.

## Document Scope

- The chat in `frontend/` is the primary way to instruct the crawler. It talks to `mcp/`, which talks to `webcrawler/`.
- The backend docs describe crawling, callbacks, screenshots, and the in-memory result list.
- `frontend-sample-one/` is an older Streamlit and FastAPI harness. It is not required for the chat.
- Technical debt items are grounded in current code observations and include practical remediation direction.
