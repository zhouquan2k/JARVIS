import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpApiError } from '../../interfaces/HttpApiError';
import { FetchSyncTransport } from './FetchSyncTransport';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe('FetchSyncTransport', () => {
    it('binds the default global fetch implementation to avoid illegal invocation', async () => {
        const fetchSpy = vi.fn(function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
            expect(this).toBe(globalThis);
            expect(String(input)).toBe('http://sync.test/pull');
            expect(init?.headers).toMatchObject({
                'content-type': 'application/json',
                'x-sync-key': 'workspace-a'
            });
            return Promise.resolve(
                new Response(JSON.stringify({
                    conversations: [],
                    nextCursor: 10
                }))
            );
        });

        globalThis.fetch = fetchSpy as typeof fetch;

        const transport = new FetchSyncTransport({
            syncKey: 'workspace-a',
            baseUrl: 'http://sync.test'
        });

        await expect(transport.pull(null)).resolves.toEqual({
            conversations: [],
            nextCursor: 10
        });
    });

    it('preserves server error message and code', async () => {
        const transport = new FetchSyncTransport({
            syncKey: 'workspace-a',
            baseUrl: 'http://sync.test',
            fetchImpl: async () => new Response(JSON.stringify({
                error: 'syncKey must not be empty.',
                code: 'SYNC_KEY_INVALID'
            }), {
                status: 400
            })
        });

        await expect(transport.pull(null)).rejects.toMatchObject({
            name: 'HttpApiError',
            message: 'syncKey must not be empty.',
            status: 400,
            code: 'SYNC_KEY_INVALID',
            source: 'sync'
        } satisfies Partial<HttpApiError>);
    });
});
