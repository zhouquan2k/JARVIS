import { describe, expect, it, vi } from 'vitest';
import type { ControlledPageManager } from './controlledPageManager';
import { GeminiHistoryPageBridge } from './GeminiHistoryPageBridge';

const CONFIG = {
    providerId: 'gemini-web',
    version: 'test-1',
    matchOrigins: ['https://gemini.google.com'],
    selectors: {
        historyListContainer: '.history-list',
        historyListItem: '.history-item',
        historyTitle: '.history-title',
        historyLink: 'a',
        conversationRoot: 'main',
        userBubble: '.user',
        assistantBubble: '.assistant'
    },
    healthCheck: {
        requiredSelectors: ['historyListContainer'],
        maxMissingCount: 1
    }
} as const;

describe('GeminiHistoryPageBridge', () => {
    it('requests the hidden controlled page with the Gemini preload and returns list results', async () => {
        const executeJavaScript = vi.fn().mockResolvedValue({
            ok: true,
            data: [{ id: 'gemini-1', title: 'Gemini', updatedAt: 1 }]
        });
        const controlledPageManager: ControlledPageManager = {
            ensurePage: vi.fn().mockResolvedValue({
                executeJavaScript,
                getURL: vi.fn().mockReturnValue('https://gemini.google.com/app')
            } as any),
            dispose: vi.fn()
        };

        const bridge = new GeminiHistoryPageBridge({
            controlledPageManager,
            preloadPath: '/tmp/gemini-history.preload.cjs'
        });

        await expect(bridge.getHistoryList(CONFIG as any)).resolves.toEqual([
            { id: 'gemini-1', title: 'Gemini', updatedAt: 1 }
        ]);
        expect(controlledPageManager.ensurePage).toHaveBeenCalledWith('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            visible: false,
            preloadPath: '/tmp/gemini-history.preload.cjs',
            forceReload: true
        });
    });

    it('forwards the search query through the hidden-page request payload', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const executeJavaScript = vi.fn().mockResolvedValue({
            ok: true,
            data: []
        });
        const controlledPageManager: ControlledPageManager = {
            ensurePage: vi.fn().mockResolvedValue({
                executeJavaScript,
                getURL: vi.fn().mockReturnValue('https://gemini.google.com/app')
            } as any),
            dispose: vi.fn()
        };

        const bridge = new GeminiHistoryPageBridge({
            controlledPageManager,
            preloadPath: '/tmp/gemini-history.preload.cjs'
        });

        await bridge.getHistoryList(CONFIG as any, { query: 'incident' });

        expect(executeJavaScript.mock.calls[0]?.[0]).toContain('"query":"incident"');
        expect(executeJavaScript.mock.calls[0]?.[0]).toContain('"debugTraceId":"gemini-history_load-');
        expect(logSpy.mock.calls.some((call) => {
            const line = String(call[0] ?? '');
            const payload = String(call[1] ?? '');
            return line.includes('[GeminiHistoryBridge]')
                && payload.includes('"stage":"history-request-dispatch"')
                && payload.includes('"query":"incident"');
        })).toBe(true);
        expect(logSpy.mock.calls.some((call) => {
            const line = String(call[0] ?? '');
            const payload = String(call[1] ?? '');
            return line.includes('[GeminiHistoryBridge]')
                && payload.includes('"stage":"history-request-response"')
                && payload.includes('"query":"incident"');
        })).toBe(true);
        logSpy.mockRestore();
    });

    it('navigates to the target conversation page when requesting detail', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const controlledPageManager: ControlledPageManager = {
            ensurePage: vi.fn().mockResolvedValue({
                getURL: vi.fn().mockReturnValue('https://gemini.google.com/app/remote-1'),
                executeJavaScript: vi.fn().mockResolvedValue({
                    ok: true,
                    data: {
                        id: 'remote-1',
                        title: 'Gemini Conversation',
                        updatedAt: 2,
                        messages: [{ id: 'm1', role: 'assistant', content: 'hello' }]
                    }
                })
            } as any),
            dispose: vi.fn()
        };

        const bridge = new GeminiHistoryPageBridge({
            controlledPageManager,
            preloadPath: '/tmp/gemini-history.preload.cjs'
        });

        await bridge.getHistoryDetail(CONFIG as any, 'remote-1');

        expect(controlledPageManager.ensurePage).toHaveBeenCalledWith('gemini-web', {
            targetUrl: 'https://gemini.google.com/app/remote-1',
            visible: false,
            preloadPath: '/tmp/gemini-history.preload.cjs',
            forceReload: false
        });
        expect(logSpy.mock.calls.some((call) => {
            const line = String(call[0] ?? '');
            const payload = String(call[1] ?? '');
            return line.includes('[GeminiHistoryBridge]')
                && payload.includes('"stage":"detail-request-dispatch"')
                && payload.includes('"externalId":"remote-1"')
                && payload.includes('"targetUrl":"https://gemini.google.com/app/remote-1"');
        })).toBe(true);
        logSpy.mockRestore();
    });

    it('keeps the hidden page on /app when requesting detail for a temporary search result id', async () => {
        const controlledPageManager: ControlledPageManager = {
            ensurePage: vi.fn().mockResolvedValue({
                getURL: vi.fn().mockReturnValue('https://gemini.google.com/app'),
                executeJavaScript: vi.fn().mockResolvedValue({
                    ok: true,
                    data: {
                        id: 'gemini-search-result:%E4%B9%9D%E5%AE%AB%E6%A0%BC:0',
                        title: 'Gemini Conversation',
                        updatedAt: 2,
                        messages: [{ id: 'm1', role: 'assistant', content: 'hello' }]
                    }
                })
            } as any),
            dispose: vi.fn()
        };

        const bridge = new GeminiHistoryPageBridge({
            controlledPageManager,
            preloadPath: '/tmp/gemini-history.preload.cjs'
        });

        await bridge.getHistoryDetail(CONFIG as any, 'gemini-search-result:%E4%B9%9D%E5%AE%AB%E6%A0%BC:0');

        expect(controlledPageManager.ensurePage).toHaveBeenCalledWith('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            visible: false,
            preloadPath: '/tmp/gemini-history.preload.cjs',
            forceReload: false
        });
    });

    it('probes hidden history readiness by reusing the list request path', async () => {
        const controlledPageManager: ControlledPageManager = {
            ensurePage: vi.fn().mockResolvedValue({
                getURL: vi.fn().mockReturnValue('https://gemini.google.com/app'),
                executeJavaScript: vi.fn().mockResolvedValue({
                    ok: true,
                    data: []
                })
            } as any),
            dispose: vi.fn()
        };

        const bridge = new GeminiHistoryPageBridge({
            controlledPageManager,
            preloadPath: '/tmp/gemini-history.preload.cjs'
        });

        await expect(bridge.probeHistoryListReady(CONFIG as any)).resolves.toBe(true);
        expect(controlledPageManager.ensurePage).toHaveBeenCalledWith('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            visible: false,
            preloadPath: '/tmp/gemini-history.preload.cjs',
            forceReload: false
        });
    });

    it('allows auth probe to force reload only when explicitly requested', async () => {
        const controlledPageManager: ControlledPageManager = {
            ensurePage: vi.fn().mockResolvedValue({
                getURL: vi.fn().mockReturnValue('https://gemini.google.com/app'),
                executeJavaScript: vi.fn().mockResolvedValue({
                    ok: true,
                    data: []
                })
            } as any),
            dispose: vi.fn()
        };

        const bridge = new GeminiHistoryPageBridge({
            controlledPageManager,
            preloadPath: '/tmp/gemini-history.preload.cjs'
        });

        await expect(bridge.probeHistoryListReady(CONFIG as any, { forceReload: true })).resolves.toBe(true);
        expect(controlledPageManager.ensurePage).toHaveBeenCalledWith('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            visible: false,
            preloadPath: '/tmp/gemini-history.preload.cjs',
            forceReload: true
        });
    });
});
