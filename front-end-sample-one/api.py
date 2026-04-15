from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import CrawlRequest
import logging

app = FastAPI(title="Cyber Crawler API")

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
        urls = [str(url) for url in request.urls]
        logger.info(f"Received process request for {len(urls)} URL(s): {urls}")
        
        # TODO: Implement actual event processing logic here
        return {
            "status": "received",
            "count": len(urls),
            "urls": urls,
            "message": "Events received successfully. Processing logic to be implemented."
        }
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
