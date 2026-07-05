// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

describe('createWeb2HostContext', () => {
    it('binds the browser fetch before exposing it as the http client capability', async () => {
        const rawFetch = globalThis.fetch;
        const fetchSpy = vi.fn();
        globalThis.fetch = fetchSpy as typeof fetch;

        try {
            const { createWeb2HostContext } = await import('./createWeb2HostContext');
            const hostContext = createWeb2HostContext();
            const fetchImpl = hostContext.getCapability<typeof fetch>('http-client');

            expect(fetchImpl).toBeTypeOf('function');
            expect(fetchImpl).not.toBe(fetchSpy);
        } finally {
            globalThis.fetch = rawFetch;
        }
    });
});
