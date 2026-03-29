import { describe, expect, it, vi } from 'vitest';
import { createExtensionContextProvider } from './createExtensionContextProvider';

describe('createExtensionContextProvider', () => {
  it('derives the context base url from extension env and uses the http context api', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://sync.example.com/api/context/initialize-access');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const provider = createExtensionContextProvider({
      env: {
        WXT_SYNC_BASE_URL: 'https://sync.example.com/api/sync/'
      },
      fetchImpl
    });

    await expect(provider.initializeAccess()).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
