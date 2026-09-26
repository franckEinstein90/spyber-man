import { useState } from 'react';

import {
  BACKEND_DISPLAY_URL,
  CALLBACK_URL,
  checkBackendHealth,
  checkCallbackHealth,
  listCrawlResults,
  submitCrawl,
  submitIndividualCrawl,
} from './api';
import { ApiStatus } from './components/ApiStatus';
import { CallbackResults } from './components/CallbackResults';
import { Controls } from './components/Controls';
import { CrawlResultPanel } from './components/CrawlResultPanel';
import { LastResponse } from './components/LastResponse';
import { UrlInput, SAMPLE_URLS } from './components/UrlInput';
import { UsageGuide } from './components/UsageGuide';
import type {
  CrawlCallbackPayload,
  CrawlResultsList,
  IndividualOptions,
  ProcessEventsResponse,
  SubmitMode,
} from './types';

export function App() {
  const [mode, setMode] = useState<SubmitMode>('batch');
  const [batchUrls, setBatchUrls] = useState('');
  const [individualUrl, setIndividualUrl] = useState('');
  const [individualOptions, setIndividualOptions] = useState<IndividualOptions>(
    {
      callbackUrl: CALLBACK_URL,
      waitForResult: true,
    },
  );
  const [lastResponse, setLastResponse] = useState<ProcessEventsResponse | null>(
    null,
  );
  const [crawlResult, setCrawlResult] = useState<CrawlCallbackPayload | null>(
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

  const batchList = batchUrls
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const trimmedIndividual = individualUrl.trim();
  const urlCount = mode === 'batch' ? batchList.length : trimmedIndividual ? 1 : 0;

  function handleModeChange(next: SubmitMode) {
    if (next === mode) return;

    if (next === 'individual') {
      // Prefer first batch line so typed work isn't lost when switching.
      const first = batchList[0] ?? '';
      if (!trimmedIndividual && first) {
        setIndividualUrl(first);
      }
      setCrawlResult(null);
    } else if (next === 'batch') {
      if (!batchUrls.trim() && trimmedIndividual) {
        setBatchUrls(trimmedIndividual);
      }
    }

    setMode(next);
  }

  async function handleSend() {
    setError(null);
    setSuccess(null);

    if (mode === 'batch') {
      if (batchList.length === 0) {
        setError('Please enter at least one URL');
        return;
      }
      setSending(true);
      setCrawlResult(null);
      try {
        const response = await submitCrawl({
          urls: batchList.map((url) => ({
            url,
            callbackUrl: CALLBACK_URL,
          })),
        });
        setLastResponse(response);
        setSuccess('Request sent successfully');
      } catch (err) {
        setError(formatSendError(err));
      } finally {
        setSending(false);
      }
      return;
    }

    if (!trimmedIndividual) {
      setError('Please enter a URL');
      return;
    }
    if (!individualOptions.callbackUrl.trim()) {
      setError('Please set a callback URL in Options');
      return;
    }

    setSending(true);
    setCrawlResult(null);
    try {
      const outcome = await submitIndividualCrawl(trimmedIndividual, {
        callbackUrl: individualOptions.callbackUrl.trim(),
        waitForResult: individualOptions.waitForResult,
      });
      setLastResponse(outcome.acceptResponse);
      setCrawlResult(outcome.crawlResult);
      setSuccess(
        outcome.crawlResult
          ? 'Crawl finished — result displayed below'
          : 'Crawl request accepted',
      );
    } catch (err) {
      setError(formatSendError(err));
    } finally {
      setSending(false);
    }
  }

  function formatSendError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return `Cannot connect to API at ${BACKEND_DISPLAY_URL}. Make sure the backend is running.`;
    }
    return message;
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
          mode={mode}
          onModeChange={handleModeChange}
          batchValue={batchUrls}
          onBatchChange={setBatchUrls}
          individualUrl={individualUrl}
          onIndividualUrlChange={setIndividualUrl}
          options={individualOptions}
          onOptionsChange={setIndividualOptions}
          onUsePython={() => {
            if (mode === 'batch') {
              setBatchUrls(SAMPLE_URLS.Python.join('\n'));
            } else {
              setIndividualUrl(SAMPLE_URLS.Python[0]);
            }
          }}
          onUseDocsNews={() =>
            setBatchUrls(SAMPLE_URLS['Docs + News'].join('\n'))
          }
        />
        <Controls
          callbackUrl={
            mode === 'individual'
              ? individualOptions.callbackUrl
              : CALLBACK_URL
          }
          urlCount={urlCount}
          mode={mode}
          sending={sending}
          error={error}
          success={success}
          onSend={handleSend}
        />
      </div>

      <LastResponse response={lastResponse} />
      {mode === 'individual' ? (
        <CrawlResultPanel result={crawlResult} />
      ) : null}

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
