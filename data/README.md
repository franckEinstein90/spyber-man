# Embedded Postgres

PGlite with the pgvector extension. It listens on the Postgres wire protocol so the crawler can use a normal `pg` client.

The port and credentials come from the repo-root `.env`:

| Variable | Default |
|---|---|
| `POSTGRES_PORT` | `5432` |
| `POSTGRES_HOST` | `127.0.0.1` |
| `POSTGRES_USER` | `postgres` |
| `POSTGRES_PASSWORD` | `postgres` |
| `POSTGRES_DB` | `postgres` |

```bash
npm install
npm run dev
```

Migrations in `migrations/` run on startup:

- `link_visits` records each crawl and, after a parse, the Cohere markdown.
- `rag.chunks` stores that markdown in chunks with `text-embedding-ada-002` embeddings (`vector(1536)`).
- `app_logs` records parse steps and callback failures.

Database files are stored in `pgdata/` (gitignored). The crawler starts this server itself when `POSTGRES_PORT` is not already open. The chat can also start it, stop it, and apply pending migrations.

`psql` needs `PGSSLMODE=disable`.
