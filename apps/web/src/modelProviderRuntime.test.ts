import { describe, expect, it } from 'vitest';
import { createWebHistoryProvider, modelProviderRuntime } from './modelProviderRuntime';

describe('web modelProviderRuntime', () => {
    it('includes chatgpt-codex in the web runtime provider catalog', () => {
        expect(modelProviderRuntime.getProviderCatalog().some((provider) => provider.id === 'chatgpt-codex')).toBe(true);
        expect(modelProviderRuntime.getProvider('chatgpt-codex').id).toBe('chatgpt-codex');
    });

    it('falls back to the mock history provider when the requested provider is unavailable in web mode', async () => {
        expect(modelProviderRuntime.getProviderCatalog().some((provider) => provider.id === 'chatgpt-web')).toBe(false);

        const historyProvider = createWebHistoryProvider('chatgpt-web');
        await expect(historyProvider.getHistoryList()).resolves.toHaveLength(2);
        await expect(historyProvider.getHistoryDetail('external-alpha')).resolves.toMatchObject({
            externalId: 'external-alpha',
            title: 'Alpha Research Notes'
        });
    });
});
