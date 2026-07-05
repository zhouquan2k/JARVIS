// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

vi.mock('@packages/ui', () => ({
    loadPluginEnablementConfig: vi.fn(() => ({
        enabledPluginIds: ['ai-agent', 'task-mgr', 'bilibili-import'],
        fallbackToDefaultEnabled: true
    }))
}));

vi.mock('../context/createDesktop2HostContext', () => ({
    createDesktop2HostContext: vi.fn(() => ({
        environment: {
            platform: 'desktop',
            contextBaseUrl: 'file://context'
        },
        hasCapability: () => false,
        getCapability: () => null
    }))
}));

describe('createDesktop2RuntimeOptions', () => {
    it('hydrates sync-related runtime env values from the desktop preload bridge', async () => {
        window.chatprismDesktop = {
            runtimeEnv: {
                contextBaseUrl: 'file://context',
                syncBaseUrl: 'https://hub.example/api/sync',
                syncKey: 'desktop-e2e',
                codexBaseUrl: 'https://hub.example/api/codex'
            }
        } as typeof window.chatprismDesktop;

        const { createDesktop2RuntimeOptions } = await import('./createDesktop2RuntimeOptions');
        const options = createDesktop2RuntimeOptions();

        expect(options.env.CHATPRISM_CONTEXT_BASE_URL).toBe('file://context');
        expect(options.env.CHATPRISM_SYNC_BASE_URL).toBe('https://hub.example/api/sync');
        expect(options.env.CHATPRISM_SYNC_KEY).toBe('desktop-e2e');
        expect(options.codexBaseUrl).toBe('https://hub.example/api/codex');
    });
});
