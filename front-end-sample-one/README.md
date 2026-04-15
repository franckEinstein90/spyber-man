# Cyber Crawler Frontend

A Streamlit web application with FastAPI backend for submitting URLs to crawl via API.

## Project Structure

```
.
├── app.py                 # Streamlit frontend UI
├── api.py                 # FastAPI backend server
├── models.py              # Pydantic models for request validation
├── pyproject.toml         # uv project configuration
├── .vscode/
│   └── launch.json        # VS Code debugging configuration
└── README.md
```

## Setup

### 1. Install Dependencies

Using `uv` (recommended):

```bash
uv sync
```

Or with pip:

```bash
pip install -r requirements.txt
```

### 2. Running the Application

There are two components to run:

#### Option A: Run both with VS Code debugger

1. Open the project in VS Code
2. Go to the "Run and Debug" panel (Ctrl+Shift+D)
3. Select "FastAPI Server" and click run
4. In another debug session, select "Streamlit App" and click run

#### Option B: Run from terminal

**Terminal 1 - Start the API server:**

```bash
uv run python api.py
```

**Terminal 2 - Start Streamlit app:**

```bash
uv run streamlit run app.py
```

The Streamlit app will open at `http://localhost:8501`

## API Endpoint

### POST /api/process-events

Submit URLs to process.

**Request:**

```json
{
  "urls": [
    "https://example.com",
    "https://example.org"
  ]
}
```

**Response:**

```json
{
  "status": "received",
  "count": 2,
  "urls": ["https://example.com", "https://example.org"],
  "message": "Events received successfully. Processing logic to be implemented."
}
```

## Testing the API

### Using curl:

```bash
curl -X POST http://localhost:8000/api/process-events \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com", "https://example.org"]}'
```

### Using the Streamlit frontend:

1. Enter URLs in the text area (one per line)
2. Click "Send to API"
3. View the response in the response panel

## Technologies

- **Streamlit** - Web UI framework
- **FastAPI** - Modern API framework
- **Pydantic** - Data validation using Python type hints
- **uv** - Fast Python package manager
- **Uvicorn** - ASGI web server

## Development

### Add more features

The `api.py` file contains the POST `/api/process-events` endpoint with a TODO comment. Implement your event processing logic there.

### Testing POST requests

Use the Streamlit UI or curl to test the API during development.

## Configuration Files

### pyproject.toml

```toml
[tool.uv]
package = false  # This is a script-only project, not a package
```

This configuration prevents issues with editable installs for script-only projects.

### .vscode/launch.json

Provides three debug configurations:
- **Streamlit App** - Debug the Streamlit frontend
- **FastAPI Server** - Debug the API server
- **Python: Debug** - Generic Python debugger
