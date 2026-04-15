from pydantic import BaseModel, HttpUrl
from typing import List


class CrawlRequest(BaseModel):
    """Request model for crawling URLs"""
    urls: List[HttpUrl]
    
    class Config:
        json_schema_extra = {
            "example": {
                "urls": [
                    "https://example.com",
                    "https://example.org"
                ]
            }
        }
