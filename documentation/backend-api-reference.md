# Backend API Reference

Base URL (local default): `http://localhost:3000`

## 1) `GET /`

Renders monitoring dashboard HTML (Handlebars template).

- **Response type**: `text/html`
- **Purpose**: basic operator view.

## 2) `POST /api/process-events` (Primary endpoint)

### Purpose

Accept a list of crawl targets and callback destinations. The backend starts asynchronous crawling and returns immediately.

### Request Headers

- `Content-Type: application/json`

### Request Body Schema

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

Rules:
- `urls` is required.
- Every item must have both `url` and `callbackUrl`.
- Both values must be valid URI strings beginning with `http://` or `https://`.
- Additional fields are rejected by AJV schema.

### Success Response

Status: `200 OK`

```json
{
  "message": "Crawl initiated",
  "options": {
    "urls": [
      {
        "url": "https://example.com",
        "callbackUrl": "http://localhost:8000/api/crawl-results"
      }
    ]
  }
}
```

### Error Responses

#### `400 Invalid request body`
Returned when AJV validation fails.

Example:

```json
{
  "error": "Invalid request body",
  "details": [
    {
      "instancePath": "/urls/0/url",
      "message": "must match pattern \"^https?://\""
    }
  ]
}
```

#### `400 A crawl is already in progress`
Returned when `scrapperStatus.running` is already true.

```json
{
  "error": "A crawl is already in progress"
}
```

#### `429 Too many process requests`
Returned by in-memory rate limiter when request budget is exhausted.

```json
{
  "error": "Too many process requests. Please wait and retry."
}
```

Also includes `Retry-After` header.

### Behavioral Semantics

- Endpoint response confirms request acceptance, **not crawl completion**.
- Crawl and callback delivery happen asynchronously after HTTP response.
- One backend process handles one crawl batch at a time (single-flight guard).

## 3) Socket.IO Events

Current surface:

### Client -> Server: `crawl:request`

```json
{ "url": "https://example.com" }
```

### Server -> Clients: `crawl:start`

```json
{ "url": "https://example.com" }
```

> Note: server-side crawl streaming over sockets is not fully implemented yet.

## Callback Contract (Outbound from backend)

For each target URL, backend performs `POST <callbackUrl>` with JSON payload:

```json
{
  "status": "completed",
  "result": {
    "url": "https://example.com",
    "html": "<html>...</html>",
    "title": "Example",
    "timestamp": "2026-04-16T00:00:00.000Z"
  },
  "callbackUrl": "http://localhost:8000/api/crawl-results",
  "receivedAt": "2026-04-16T00:00:00.000Z"
}
```

If callback fails (non-2xx or network error), the failure is recorded to SQLite as `callback_status = failed` with an error message.

## Forward-compatibility note

The crawler engine is expected to evolve from Puppeteer to `puppeteer-extra` with additional crawl customization features.  
This should remain an internal implementation change; API request/response and callback contracts should stay backward compatible.

## Example cURL

```bash
curl -X POST http://localhost:3000/api/process-events \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      {
        "url": "https://www.python.org",
        "callbackUrl": "http://localhost:8000/api/crawl-results"
      },
      {
        "url": "https://news.ycombinator.com",
        "callbackUrl": "http://localhost:8000/api/crawl-results"
      }
    ]
  }'
```
