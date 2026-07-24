export interface CrawlTarget {
  url: string;
  callbackUrl: string;
}

export interface CrawlRequest {
  urls: CrawlTarget[];
}

export interface ProcessEventsResponse {
  message?: string;
  options?: {
    urls: CrawlTarget[];
  };
  error?: string;
  details?: unknown;
  status?: string;
  count?: number;
  urls?: string[];
  callbackUrls?: string[];
}

export interface CrawlCallbackPayload {
  status: string;
  result: {
    url?: string;
    html?: string;
    title?: string;
    timestamp?: string;
    [key: string]: unknown;
  };
  callbackUrl: string;
  receivedAt: string;
}

export interface CrawlResultsList {
  count: number;
  items: CrawlCallbackPayload[];
}

export interface HealthResponse {
  status: string;
}
