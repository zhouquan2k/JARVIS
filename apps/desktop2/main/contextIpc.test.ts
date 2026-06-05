import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL,
    DESKTOP_CONTEXT_INITIALIZE_CHANNEL
} from '../shared/contextBridge';
import { registerContextIpc } from './contextIpc';

function createIpcMock() {
    return {
        handle: vi.fn(),
        removeHandler: vi.fn()
    };
}

function getHandler(ipc: ReturnType<typeof createIpcMock>, channel: string) {
    const matched = ipc.handle.mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    return matched?.[1] as ((...args: any[]) => unknown) | undefined;
}

describe('contextIpc', () => {
    let infoSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    afterEach(() => {
        infoSpy.mockClear();
        warnSpy.mockClear();
    });

    it('rejects missing CHATPRISM_CONTEXT_BASE_URL', () => {
        const ipc = createIpcMock();
        expect(() => registerContextIpc({ ipc, contextBaseUrl: '' })).toThrow(
            'Desktop HTTP context provider is not configured. Set CHATPRISM_CONTEXT_BASE_URL.'
        );
    });

    it('uses the configured server context provider', async () => {
        const ipc = createIpcMock();
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith('/initialize-access')) {
                return new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                });
            }

            if (url.endsWith('/get-context')) {
                return new Response(JSON.stringify({
                    nodes: [{ path: '/server-only', name: 'server-only', kind: 'directory', hasChildren: false }],
                    agentConfigs: {}
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                });
            }

            throw new Error(`unexpected request: ${url} ${init?.method ?? 'GET'}`);
        }) as typeof fetch;

        registerContextIpc({
            ipc,
            contextBaseUrl: 'http://127.0.0.1:8787/api/context',
            fetchImpl
        });
        const initializeHandler = getHandler(ipc, DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
        const getContextHandler = getHandler(ipc, DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);

        await expect(initializeHandler?.({})).resolves.toBeUndefined();
        await expect(getContextHandler?.({})).resolves.toMatchObject({
            nodes: [expect.objectContaining({ path: '/server-only' })]
        });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(infoSpy).toHaveBeenCalledWith('[desktop-context] using HTTP context provider: http://127.0.0.1:8787/api/context');
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
