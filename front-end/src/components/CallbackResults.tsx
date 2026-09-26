import type { CrawlResultsList } from '../types';

interface CallbackResultsProps {
  results: CrawlResultsList | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
}

export function CallbackResults({
  results,
  error,
  loading,
  onRefresh,
}: CallbackResultsProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Callback Results</h2>
        <button
          type="button"
          className="btn secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="caption">
        Results delivered by the backend to the local callback receiver.
      </p>
      {error ? <p className="msg error" role="alert">{error}</p> : null}
      {results ? (
        <>
          <p className="url-count">
            Received: <strong>{results.count}</strong>
          </p>
          <pre className="json-block">{JSON.stringify(results.items, null, 2)}</pre>
        </>
      ) : (
        <p className="caption">Click Refresh to load callback events.</p>
      )}
    </section>
  );
}
