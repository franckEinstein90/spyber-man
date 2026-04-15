from datetime import datetime
from pydantic import BaseModel, HttpUrl
from typing import List


class CrawlTarget(BaseModel):
    """One crawl job target with a callback endpoint."""
    url: HttpUrl
    callbackUrl: HttpUrl


class CrawlRequest(BaseModel):
    """Request model for crawling URLs"""
    urls: List[CrawlTarget]
    
    class Config:
        json_schema_extra = {
            "example": {
                "urls": [
                    {
                        "url": "https://example.com",
                        "callbackUrl": "http://localhost:8000/api/crawl-results"
                    },
                    {
                        "url": "https://example.org",
                        "callbackUrl": "http://localhost:8000/api/crawl-results"
                    }
                ]
            }
        }


class CrawlCallbackPayload(BaseModel):
    """Payload received from the backend when a crawl result is ready."""
    status: str
    result: dict
    callbackUrl: HttpUrl
    receivedAt: datetime
