export const SAMPLE_URLS = {
  Python: ['https://www.python.org'],
  'Docs + News': [
    'https://docs.python.org/3/',
    'https://news.ycombinator.com',
  ],
} as const;

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onUsePython: () => void;
  onUseDocsNews: () => void;
}

export function UrlInput({
  value,
  onChange,
  onUsePython,
  onUseDocsNews,
}: UrlInputProps) {
  return (
    <section className="panel">
      <h2>Input URLs</h2>
      <div className="sample-row">
        <button type="button" className="btn secondary" onClick={onUsePython}>
          Use Python URL
        </button>
        <button type="button" className="btn secondary" onClick={onUseDocsNews}>
          Use 2 Real URLs
        </button>
      </div>
      <label className="field-label" htmlFor="urls-input">
        Enter URLs (one per line)
      </label>
      <textarea
        id="urls-input"
        className="urls-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={'https://www.python.org\nhttps://news.ycombinator.com'}
        rows={8}
      />
    </section>
  );
}
