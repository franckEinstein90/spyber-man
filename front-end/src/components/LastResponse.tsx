import type { ProcessEventsResponse } from '../types';

interface LastResponseProps {
  response: ProcessEventsResponse | null;
}

export function LastResponse({ response }: LastResponseProps) {
  if (!response) return null;

  return (
    <section className="panel">
      <h2>Last Response</h2>
      <pre className="json-block">{JSON.stringify(response, null, 2)}</pre>
    </section>
  );
}
