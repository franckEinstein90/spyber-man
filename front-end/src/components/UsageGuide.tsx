interface UsageGuideProps {
  backendUrl: string;
  callbackUrl: string;
}

export function UsageGuide({ backendUrl, callbackUrl }: UsageGuideProps) {
  const example = {
    urls: [
      {
        url: 'https://www.python.org',
        callbackUrl,
      },
      {
        url: 'https://news.ycombinator.com',
        callbackUrl,
      },
    ],
  };

  return (
    <details className="panel details">
      <summary>Usage Guide</summary>
      <div className="details-body prose">
        <h3>Quick Start</h3>
        <ol>
          <li>
            Start the Node backend in <code>back-end/</code> (
            <code>npm run dev</code>).
          </li>
          <li>
            Start this frontend (<code>npm run dev</code>) — Vite UI + callback
            receiver.
          </li>
          <li>Enter URLs in the text area (one per line).</li>
          <li>Click Send to API to submit the crawl request.</li>
          <li>Use Callback Results → Refresh to inspect delivered payloads.</li>
        </ol>
        <h3>API Endpoint</h3>
        <ul>
          <li>
            Crawl: <code>POST {backendUrl}/api/process-events</code>
          </li>
          <li>
            Callback receiver: <code>POST {callbackUrl}</code>
          </li>
          <li>
            Content-Type: <code>application/json</code>
          </li>
        </ul>
        <h3>Example Request</h3>
        <pre className="json-block">{JSON.stringify(example, null, 2)}</pre>
      </div>
    </details>
  );
}
