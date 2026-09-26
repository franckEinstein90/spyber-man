# Documentation Home

This folder centralizes repository-level and service-level documentation.

## Recommended Reading Order

1. **`repo-overview.md`** — understand all folders, responsibilities, and relationships.
2. **`frontend.md`** — chat UI and the service rail.
3. **`mcp-server.md`** — MCP tools for the crawler, the database, parsing, and logs.
4. **`backend-architecture.md`** — crawler internals and processing flow.
5. **`backend-api-reference.md`** — endpoint-level contract and payload schema.
6. **`deployment-and-operations.md`** — run and operate locally.
7. **`todos-and-technical-debt.md`** — known gaps and prioritized improvements.

## Document Scope

- The chat in `frontend/` is the way to instruct the crawler. It talks to `mcp/`, which talks to `webcrawler/` and `data/`.
- The backend docs describe crawling, on-demand screenshot parsing, callbacks, screenshots, embedded Postgres, and `app_logs`.
- Technical debt items are grounded in current code observations and include practical remediation direction.
