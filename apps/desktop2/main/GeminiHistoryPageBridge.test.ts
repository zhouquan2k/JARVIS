import { describe, expect, it, vi } from 'vitest';
import type { ControlledPageManager } from './controlledPageManager';
import { GeminiHistoryPageBridge } from './GeminiHistoryPageBridge';

// Static probe config — only pageUrl matters for the probe path.
const PROBE_CONFIG = {
    pageUrl: 'https://gemini.google.com/app',
    pageOrigin: 'https://gemini.google.com',
    storageKey: 'chatprism:provider-config:gemini-history',
    providerConfigBaseUrl: 'https://sync.example.com/api',
    providerConfigPath: 'https://sync.example.com/api/gemini-history',
    requestTimeoutMs: 10000
} as const;

describe('GeminiHistoryPageBridge', () => {
    it('probes hidden history readiness by loading the Gemini page', async () => {
        const controlledPageManager: ControlledPageManager = {
            ensurePage: vi.fn().mockResolvedValue({
                getURL: vi.fn().mockReturnValue('https://gemini.google.com/app'),
                executeJavaScript: vi.fn().mockResolvedValue({ ok: true, data: [] }),
                on: vi.fn()
            } as any),
            dispose: vi.fn()
        };

        const bridge = new GeminiHistoryPageBridge({
            controlledPageManager,
            preloadPath: '/tmp/gemini-history.preload.cjs'
        });

        await expect(bridge.probeHistoryListReady(PROBE_CONFIG)).resolves.toBe(true);
        expect(controlledPageManager.ensurePage).toHaveBeenCalledWith('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            visible: false,
            preloadPath: '/tmp/gemini-history.preload.cjs',
            forceReload: false
        });
    });

    it('allows auth probe to force reload when explicitly requested', async () => {
        const controlledPageManager: ControlledPageManager = {
            ensurePage: vi.fn().mockResolvedValue({
                getURL: vi.fn().mockReturnValue('https://gemini.google.com/app'),
                executeJavaScript: vi.fn().mockResolvedValue({ ok: true, data: [] }),
                on: vi.fn()
            } as any),
            dispose: vi.fn()
        };

        const bridge = new GeminiHistoryPageBridge({
            controlledPageManager,
            preloadPath: '/tmp/gemini-history.preload.cjs'
        });

        await expect(bridge.probeHistoryListReady(PROBE_CONFIG, { forceReload: true })).resolves.toBe(true);
        expect(controlledPageManager.ensurePage).toHaveBeenCalledWith('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            visible: false,
            preloadPath: '/tmp/gemini-history.preload.cjs',
            forceReload: true
        });
    });

    it('returns false when bridge is unavailable in the page', async () => {
        const controlledPageManager: ControlledPageManager = {
            ensurePage: vi.fn().mockResolvedValue({
                getURL: vi.fn().mockReturnValue('https://gemini.google.com/app'),
                executeJavaScript: vi.fn().mockRejectedValue(new Error('Gemini history preload bridge is unavailable')),
                on: vi.fn()
            } as any),
            dispose: vi.fn()
        };

        const bridge = new GeminiHistoryPageBridge({
            controlledPageManager,
            preloadPath: '/tmp/gemini-history.preload.cjs'
        });

        await expect(bridge.probeHistoryListReady(PROBE_CONFIG)).rejects.toThrow('bridge is unavailable');
    });
});
