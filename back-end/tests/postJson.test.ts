import { afterEach, describe, expect, it, vi } from 'vitest';

import { postJson } from '../src/server/processEvents';
import { fetchResolving } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('postJson', () => {
  it('resolves and sends a JSON POST on a 2xx response', async () => {
    const fetchMock = fetchResolving(200);
    vi.stubGlobal('fetch', fetchMock);

    await expect(postJson('http://x/cb', { a: 1 })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://x/cb');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
    // A timeout signal is always attached.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects with the status and body on a non-2xx response', async () => {
    vi.stubGlobal('fetch', fetchResolving(500, 'boom'));

    await expect(postJson('http://x/cb', {})).rejects.toThrow(
      /Callback failed \(500\): boom/,
    );
  });

  it('propagates network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(postJson('http://x/cb', {})).rejects.toThrow('network down');
  });

  it('aborts when the request exceeds the timeout', async () => {
    // fetch that rejects when its abort signal fires.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new Error('The operation was aborted')),
            );
          }),
      ),
    );

    await expect(postJson('http://x/cb', {}, 10)).rejects.toThrow(/aborted/);
  });
});
