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

  it('uses the shared http context contract for pdf read and markdown write', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};

      if (url.endsWith('/read-document')) {
        expect(body).toEqual({ path: '/reports/checkup.pdf' });
        return new Response(JSON.stringify({
          document: {
            path: '/reports/checkup.pdf',
            mimeType: 'application/pdf',
            dataBase64: 'JVBERi0xLjQ=',
            canWrite: false
          }
        }), { status: 200 });
      }

      if (url.endsWith('/write-document')) {
        expect(body).toEqual({
          path: '/notes/summary.md',
          mimeType: 'text/markdown',
          dataBase64: 'IyBTdW1tYXJ5'
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    });

    const provider = createExtensionContextProvider({
      baseUrl: 'https://context.example.com/api/context',
      fetchImpl
    });

    await expect(provider.readDocument('/reports/checkup.pdf')).resolves.toEqual({
      path: '/reports/checkup.pdf',
      mimeType: 'application/pdf',
      dataBase64: 'JVBERi0xLjQ=',
      canWrite: false
    });
    await expect(provider.writeDocument({
      path: '/notes/summary.md',
      mimeType: 'text/markdown',
      dataBase64: 'IyBTdW1tYXJ5'
    })).resolves.toBeUndefined();
  });
});
