import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeTextDocument } from '@packages/core';
import { Web2ContextProvider } from './Web2ContextProvider';

describe('Web2ContextProvider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      })
    });
  });

  it('reads documents through the cacheable GET endpoint and marks them read-only offline', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({
        document: {
          path: '/guide.md',
          mimeType: 'text/markdown',
          dataBase64: encodeTextDocument('# Guide\n'),
          canWrite: true
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    vi.stubGlobal('navigator', { onLine: false });

    const provider = new Web2ContextProvider({
      baseUrl: 'http://127.0.0.1:8787/api/context',
      fetchImpl: fetchMock as typeof fetch
    });

    const document = await provider.readDocument('/guide.md');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/api/context/read-document?path=%2Fguide.md',
      expect.objectContaining({ method: 'GET' })
    );
    expect(document.canWrite).toBe(false);
  });

  it('rejects writes while offline with a clear deferred-edit message', async () => {
    vi.stubGlobal('navigator', { onLine: false });

    const provider = new Web2ContextProvider({
      baseUrl: 'http://127.0.0.1:8787/api/context',
      fetchImpl: vi.fn() as typeof fetch
    });

    await expect(provider.writeDocument({
      path: '/guide.md',
      mimeType: 'text/markdown',
      dataBase64: encodeTextDocument('# Guide\n')
    })).rejects.toThrow('This document is read-only offline. Reconnect before editing.');
  });

  it('caches workspace context online and reuses it for offline initializeAccess/getContext', async () => {
    const context = {
      rootPath: '/',
      nodes: [
        {
          path: '/',
          name: 'Root',
          kind: 'directory',
          parentPath: null,
          hasChildren: true,
          depth: 0
        },
        {
          path: '/guide.md',
          name: 'guide',
          kind: 'file',
          parentPath: '/',
          hasChildren: false,
          depth: 1
        }
      ],
      folderMetadata: {
        '/': {
          scopeKey: '/',
          data: {
            name: 'Default Knowledge Agent'
          }
        }
      }
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/initialize-access')) {
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.endsWith('/get-context')) {
        return new Response(JSON.stringify(context), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal('navigator', { onLine: true });

    const provider = new Web2ContextProvider({
      baseUrl: 'http://127.0.0.1:8787/api/context',
      fetchImpl: fetchMock as typeof fetch
    });

    await provider.initializeAccess();
    await expect(provider.getContext()).resolves.toEqual(context);

    vi.stubGlobal('navigator', { onLine: false });

    await expect(provider.initializeAccess()).resolves.toBeUndefined();
    await expect(provider.getContext()).resolves.toEqual(context);
    await expect(provider.getFolderMetadata('/')).resolves.toEqual(context.folderMetadata['/']);
  });
});
