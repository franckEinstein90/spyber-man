interface ApiStatusProps {
  backendUrl: string;
  callbackUrl: string;
  backendHealth: boolean | null;
  callbackHealth: boolean | null;
  checking: boolean;
  onCheck: () => void;
}

function healthLabel(value: boolean | null): string {
  if (value === null) return 'Not checked';
  return value ? 'Running' : 'Not responding';
}

export function ApiStatus({
  backendUrl,
  callbackUrl,
  backendHealth,
  callbackHealth,
  checking,
  onCheck,
}: ApiStatusProps) {
  return (
    <details className="panel details">
      <summary>API Status</summary>
      <div className="details-body">
        <button
          type="button"
          className="btn secondary"
          onClick={onCheck}
          disabled={checking}
        >
          {checking ? 'Checking…' : 'Check API Health'}
        </button>
        <dl className="status-list">
          <div>
            <dt>Backend</dt>
            <dd>
              <code>{backendUrl}</code>
              <span
                className={
                  backendHealth === null
                    ? 'badge'
                    : backendHealth
                      ? 'badge ok'
                      : 'badge bad'
                }
              >
                {healthLabel(backendHealth)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Callback receiver</dt>
            <dd>
              <code>{callbackUrl}</code>
              <span
                className={
                  callbackHealth === null
                    ? 'badge'
                    : callbackHealth
                      ? 'badge ok'
                      : 'badge bad'
                }
              >
                {healthLabel(callbackHealth)}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </details>
  );
}
