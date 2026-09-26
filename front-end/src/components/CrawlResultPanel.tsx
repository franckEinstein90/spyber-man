import type { CrawlCallbackPayload } from '../types';

interface CrawlResultPanelProps {
  result: CrawlCallbackPayload | null;
}

export function CrawlResultPanel({ result }: CrawlResultPanelProps) {
  if (!result) return null;

  const page = result.result ?? {};
  const htmlPreview =
    typeof page.html === 'string' && page.html.length > 0
      ? page.html.length > 4000
        ? `${page.html.slice(0, 4000)}\n… truncated …`
        : page.html
      : '(empty)';

  return (
    <section className="panel">
      <h2>Crawl Result</h2>
      <dl className="result-meta">
        <div>
          <dt>Callback status</dt>
          <dd>
            <span
              className={
                result.status === 'completed' ? 'badge ok' : 'badge bad'
              }
            >
              {result.status}
            </span>
          </dd>
        </div>
        <div>
          <dt>Page status</dt>
          <dd>
            <span
              className={
                page.status === 'success' ? 'badge ok' : 'badge bad'
              }
            >
              {page.status ?? 'unknown'}
            </span>
          </dd>
        </div>
        <div>
          <dt>URL</dt>
          <dd>
            <code>{page.url ?? '—'}</code>
          </dd>
        </div>
        <div>
          <dt>Title</dt>
          <dd>{page.title || '—'}</dd>
        </div>
        <div>
          <dt>Received at</dt>
          <dd>
            <code>{result.receivedAt}</code>
          </dd>
        </div>
        {page.screenshotUrl ? (
          <div>
            <dt>Screenshot</dt>
            <dd>
              <a
                className="screenshot-link"
                href={String(page.screenshotUrl)}
                target="_blank"
                rel="noreferrer"
              >
                <code>{String(page.screenshotUrl)}</code>
              </a>
              <img
                className="screenshot-preview"
                src={String(page.screenshotUrl)}
                alt={`Screenshot of ${page.url ?? 'page'}`}
              />
            </dd>
          </div>
        ) : null}
        {typeof page.ocrText === 'string' && page.ocrText.length > 0 ? (
          <div>
            <dt>OCR text</dt>
            <dd>
              <pre className="ocr-text">{page.ocrText}</pre>
            </dd>
          </div>
        ) : null}
        {page.error ? (
          <div>
            <dt>Error</dt>
            <dd className="msg error">{page.error}</dd>
          </div>
        ) : null}
      </dl>
      <h3 className="options-heading">HTML snapshot</h3>
      <pre className="json-block">{htmlPreview}</pre>
    </section>
  );
}
