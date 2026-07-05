// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

describe('createDesktop2HostContext', () => {
    it('binds the browser fetch when no desktop bridge is available', async () => {
        const rawFetch = globalThis.fetch;
        const fetchSpy = vi.fn();
        globalThis.fetch = fetchSpy as typeof fetch;
        delete window.chatprismDesktop;
        delete window.jarvisFetch;

        try {
            const { createDesktop2HostContext } = await import('./createDesktop2HostContext');
            const hostContext = createDesktop2HostContext();
            const fetchImpl = hostContext.getCapability<typeof fetch>('http-client');

            expect(fetchImpl).toBeTypeOf('function');
            expect(fetchImpl).not.toBe(fetchSpy);
        } finally {
            globalThis.fetch = rawFetch;
        }
    });

    it('resolves relative fetch URLs against the current window location before using the desktop bridge', async () => {
        const bridge = vi.fn(async () => ({
            status: 200,
            statusText: 'OK',
            headers: [['content-type', 'application/json']],
            bodyText: JSON.stringify({ ok: true }),
            url: 'http://127.0.0.1:8900/api/sync/tasks/push'
        }));

        window.chatprismDesktop = {
            runtimeEnv: {
                contextBaseUrl: '/api/context'
            },
            fetch: bridge
        } as typeof window.chatprismDesktop;

        const { createDesktop2HostContext } = await import('./createDesktop2HostContext');
        const hostContext = createDesktop2HostContext();
        const fetchImpl = hostContext.getCapability<typeof fetch>('http-client');

        expect(fetchImpl).toBeTypeOf('function');
        await fetchImpl!('/api/sync/tasks/push', {
            method: 'POST',
            body: JSON.stringify({ tasks: [] })
        });

        expect(bridge).toHaveBeenCalledWith(`${window.location.origin}/api/sync/tasks/push`, expect.objectContaining({
            method: 'POST'
        }));
    });
});
