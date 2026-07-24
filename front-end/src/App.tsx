import { useState } from 'react';

import {
  BACKEND_DISPLAY_URL,
  CALLBACK_URL,
  checkBackendHealth,
  checkCallbackHealth,
  listCrawlResults,
  submitCrawl,
} from './api';
import { ApiStatus } from './components/ApiStatus';
import { CallbackResults } from './components/CallbackResults';
import { Controls } from './components/Controls';
import { LastResponse } from './components/LastResponse';
import { UrlInput, SAMPLE_URLS } from './components/UrlInput';
import { UsageGuide } from './components/UsageGuide';
import type { CrawlResultsList, ProcessEventsResponse } from './types';

export function App() {
  const [urlsInput, setUrlsInput] = useState('');
  const [lastResponse, setLastResponse] = useState<ProcessEventsResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [backendHealth, setBackendHealth] = useState<boolean | null>(null);
  const [callbackHealth, setCallbackHealth] = useState<boolean | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [results, setResults] = useState<CrawlResultsList | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const urlsList = urlsInput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  async function handleSend() {
    setError(null);
    setSuccess(null);

    if (urlsList.length === 0) {
      setError('Please enter at least one URL');
      return;
    }

    setSending(true);
    try {
      const response = await submitCrawl({
        urls: urlsList.map((url) => ({
          url,
          callbackUrl: CALLBACK_URL,
        })),
      });
      setLastResponse(response);
      setSuccess('Request sent successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        setError(
          `Cannot connect to API at ${BACKEND_DISPLAY_URL}. Make sure the backend is running.`,
        );
      } else {
        setError(message);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleHealthCheck() {
    setCheckingHealth(true);
    const [backend, callback] = await Promise.all([
      checkBackendHealth(),
      checkCallbackHealth(),
    ]);
    setBackendHealth(backend);
    setCallbackHealth(callback);
    setCheckingHealth(false);
  }

  async function handleRefreshResults() {
    setLoadingResults(true);
    setResultsError(null);
    try {
      setResults(await listCrawlResults());
    } catch (err) {
      setResultsError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingResults(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <p className="brand">Spyber Man</p>
        <h1>Cyber Crawler</h1>
        <p className="lede">Submit URLs to crawl via the API</p>
      </header>

      <div className="layout">
        <UrlInput
          value={urlsInput}
          onChange={setUrlsInput}
          onUsePython={() => setUrlsInput(SAMPLE_URLS.Python.join('\n'))}
          onUseDocsNews={() => setUrlsInput(SAMPLE_URLS['Docs + News'].join('\n'))}
        />
        <Controls
          callbackUrl={CALLBACK_URL}
          urlCount={urlsList.length}
          sending={sending}
          error={error}
          success={success}
          onSend={handleSend}
        />
      </div>

      <LastResponse response={lastResponse} />

      <CallbackResults
        results={results}
        error={resultsError}
        loading={loadingResults}
        onRefresh={handleRefreshResults}
      />

      <ApiStatus
        backendUrl={BACKEND_DISPLAY_URL}
        callbackUrl={CALLBACK_URL}
        backendHealth={backendHealth}
        callbackHealth={callbackHealth}
        checking={checkingHealth}
        onCheck={handleHealthCheck}
      />

      <UsageGuide
        backendUrl={BACKEND_DISPLAY_URL}
        callbackUrl={CALLBACK_URL}
      />
    </div>
  );
}
