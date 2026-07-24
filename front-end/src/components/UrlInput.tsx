import type { IndividualOptions, SubmitMode } from '../types';

export const SAMPLE_URLS = {
  Python: ['https://www.python.org'],
  'Docs + News': [
    'https://docs.python.org/3/',
    'https://news.ycombinator.com',
  ],
} as const;

interface UrlInputProps {
  mode: SubmitMode;
  onModeChange: (mode: SubmitMode) => void;
  /** Batch mode: multi-line URL text. */
  batchValue: string;
  onBatchChange: (value: string) => void;
  /** Individual mode: single URL. */
  individualUrl: string;
  onIndividualUrlChange: (value: string) => void;
  options: IndividualOptions;
  onOptionsChange: (options: IndividualOptions) => void;
  onUsePython: () => void;
  onUseDocsNews: () => void;
}

export function UrlInput({
  mode,
  onModeChange,
  batchValue,
  onBatchChange,
  individualUrl,
  onIndividualUrlChange,
  options,
  onOptionsChange,
  onUsePython,
  onUseDocsNews,
}: UrlInputProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{mode === 'batch' ? 'Input URLs' : 'Input URL'}</h2>
        <div className="mode-toggle" role="tablist" aria-label="Submit mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'batch'}
            className={mode === 'batch' ? 'mode-btn active' : 'mode-btn'}
            onClick={() => onModeChange('batch')}
          >
            Batch
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'individual'}
            className={mode === 'individual' ? 'mode-btn active' : 'mode-btn'}
            onClick={() => onModeChange('individual')}
          >
            Individual
          </button>
        </div>
      </div>

      {mode === 'batch' ? (
        <>
          <div className="sample-row">
            <button type="button" className="btn secondary" onClick={onUsePython}>
              Use Python URL
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={onUseDocsNews}
            >
              Use 2 Real URLs
            </button>
          </div>
          <label className="field-label" htmlFor="urls-input">
            Enter URLs (one per line)
          </label>
          <textarea
            id="urls-input"
            className="urls-input"
            value={batchValue}
            onChange={(event) => onBatchChange(event.target.value)}
            placeholder={
              'https://www.python.org\nhttps://news.ycombinator.com'
            }
            rows={8}
          />
        </>
      ) : (
        <>
          <div className="sample-row single">
            <button type="button" className="btn secondary" onClick={onUsePython}>
              Use Python URL
            </button>
          </div>
          <label className="field-label" htmlFor="single-url-input">
            URL
          </label>
          <input
            id="single-url-input"
            type="url"
            className="single-url-input"
            value={individualUrl}
            onChange={(event) => onIndividualUrlChange(event.target.value)}
            placeholder="https://www.python.org"
            autoComplete="url"
          />

          <div className="options-block">
            <h3 className="options-heading">Options</h3>
            <p className="caption options-lede">
              Per-request settings for this individual crawl.
            </p>

            <label className="field-label" htmlFor="option-callback">
              Callback URL
            </label>
            <input
              id="option-callback"
              type="url"
              className="single-url-input"
              value={options.callbackUrl}
              onChange={(event) =>
                onOptionsChange({ ...options, callbackUrl: event.target.value })
              }
              placeholder="http://localhost:8000/api/crawl-results"
            />

            <label className="option-check">
              <input
                type="checkbox"
                checked={options.waitForResult}
                onChange={(event) =>
                  onOptionsChange({
                    ...options,
                    waitForResult: event.target.checked,
                  })
                }
              />
              <span>Wait for crawl result and display it</span>
            </label>
          </div>
        </>
      )}
    </section>
  );
}
