from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import CrawlCallbackPayload, CrawlRequest
import logging
from datetime import datetime

app = FastAPI(title="Cyber Crawler API")

received_crawl_results = []

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.post("/api/process-events")
async def process_events(request: CrawlRequest):
    """
    Receive a list of URLs to process
    
    Request body:
    ```json
    {
        "urls": ["https://example.com", "https://example.org"]
    }
    ```
    """
    try:
        urls = [str(item.url) for item in request.urls]
        callback_urls = [str(item.callbackUrl) for item in request.urls]
        logger.info(f"Received process request for {len(urls)} URL(s): {urls}")
        
        # TODO: Implement actual event processing logic here
        return {
            "status": "received",
            "count": len(urls),
            "urls": urls,
            "callbackUrls": callback_urls,
            "message": "Events received successfully. Processing logic to be implemented."
        }
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/crawl-results")
async def receive_crawl_result(payload: CrawlCallbackPayload):
    """Receive crawl results pushed by the Node/Express backend callback."""
    event = payload.model_dump()
    received_crawl_results.append(event)
    logger.info("Received crawl callback for %s", event.get("result", {}).get("url"))
    return {
        "status": "accepted",
        "receivedAt": datetime.utcnow().isoformat(),
        "totalResults": len(received_crawl_results)
    }


@app.get("/api/crawl-results")
async def list_crawl_results():
    """List callback results received so far for quick local testing."""
    return {
        "count": len(received_crawl_results),
        "items": received_crawl_results,
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
