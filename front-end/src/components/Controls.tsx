interface ControlsProps {
  callbackUrl: string;
  urlCount: number;
  sending: boolean;
  error: string | null;
  success: string | null;
  onSend: () => void;
}

export function Controls({
  callbackUrl,
  urlCount,
  sending,
  error,
  success,
  onSend,
}: ControlsProps) {
  return (
    <section className="panel">
      <h2>Controls</h2>
      <p className="caption">
        Callback endpoint: <code>{callbackUrl}</code>
      </p>
      <p className="url-count">
        URLs to send: <strong>{urlCount}</strong>
      </p>
      <button
        type="button"
        className="btn primary"
        onClick={onSend}
        disabled={sending}
      >
        {sending ? 'Sending…' : 'Send to API'}
      </button>
      {error ? <p className="msg error" role="alert">{error}</p> : null}
      {success ? <p className="msg success">{success}</p> : null}
    </section>
  );
}
