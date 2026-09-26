import type { SubmitMode } from '../types';

interface ControlsProps {
  callbackUrl: string;
  urlCount: number;
  mode: SubmitMode;
  sending: boolean;
  error: string | null;
  success: string | null;
  onSend: () => void;
}

export function Controls({
  callbackUrl,
  urlCount,
  mode,
  sending,
  error,
  success,
  onSend,
}: ControlsProps) {
  const sendLabel =
    mode === 'individual'
      ? sending
        ? 'Crawling…'
        : 'Crawl URL'
      : sending
        ? 'Sending…'
        : 'Send to API';

  return (
    <section className="panel">
      <h2>Controls</h2>
      <p className="caption">
        Callback endpoint: <code>{callbackUrl}</code>
      </p>
      <p className="url-count">
        URLs to send: <strong>{urlCount}</strong>{' '}
        <span className="mode-hint">({mode})</span>
      </p>
      <button
        type="button"
        className="btn primary"
        onClick={onSend}
        disabled={sending}
      >
        {sendLabel}
      </button>
      {error ? <p className="msg error" role="alert">{error}</p> : null}
      {success ? <p className="msg success">{success}</p> : null}
    </section>
  );
}
