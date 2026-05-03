import { describe, expect, it } from 'vitest';
import type { GeminiHistoryRemoteConfig } from '@packages/core/src';
import { GeminiHistoryConfigLoader } from './GeminiHistoryConfigLoader';

class MemoryConfigStorage {
    private readonly data = new Map<string, string>();

    async get(key: string): Promise<string | null> {
        return this.data.get(key) ?? null;
    }

    async set(key: string, value: string): Promise<void> {
        this.data.set(key, value);
    }
}

const REMOTE_CONFIG: GeminiHistoryRemoteConfig = {
    providerId: 'gemini-web',
    version: 'remote-1',
    matchOrigins: ['https://gemini.google.com'],
    selectors: {
        historyListContainer: '.history-list',
        historyListItem: '.history-item',
        historyTitle: '.history-title',
        historyLink: 'a',
        conversationRoot: 'main',
        userBubble: '.user',
        assistantBubble: '.assistant',
        lazyLoadSentinel: '.sentinel'
    },
    healthCheck: {
        requiredSelectors: ['historyListContainer', 'conversationRoot'],
        maxMissingCount: 1
    }
};

describe('GeminiHistoryConfigLoader', () => {
    it('loads remote config without caching it until it is validated', async () => {
        const storage = new MemoryConfigStorage();
        const loader = new GeminiHistoryConfigLoader({
            env: {
                WXT_PROVIDER_CONFIG_BASE_URL: 'https://config.test/api/provider-configs'
            },
            storage,
            fetchImpl: async () => new Response(JSON.stringify(REMOTE_CONFIG), {
                status: 200,
                headers: {
                    'cache-control': 'public, max-age=60'
                }
            }),
            now: () => 123
        });

        const result = await loader.load();

        expect(result.metadata.source).toBe('remote');
        expect(result.metadata.cacheControl).toBe('public, max-age=60');
        expect(result.config.version).toBe('remote-1');
        await expect(storage.get('chatprism:provider-config:gemini-history')).resolves.toBeNull();
    });

    it('persists a config after it is marked as validated', async () => {
        const storage = new MemoryConfigStorage();
        const loader = new GeminiHistoryConfigLoader({
            storage
        });

        await loader.markValidated(REMOTE_CONFIG);

        await expect(storage.get('chatprism:provider-config:gemini-history')).resolves.toContain('"version":"remote-1"');
    });

    it('falls back to cached config when remote fetch fails', async () => {
        const storage = new MemoryConfigStorage();
        await storage.set('chatprism:provider-config:gemini-history', JSON.stringify(REMOTE_CONFIG));
        const loader = new GeminiHistoryConfigLoader({
            env: {
                WXT_PROVIDER_CONFIG_BASE_URL: 'https://config.test/api/provider-configs'
            },
            storage,
            fetchImpl: async () => {
                throw new Error('network down');
            },
            now: () => 456
        });

        const result = await loader.load();

        expect(result.metadata.source).toBe('cache');
        expect(result.metadata.fetchedAt).toBe(456);
        expect(result.config.version).toBe('remote-1');
    });

    it('falls back to builtin config when provider-config endpoint returns an error response', async () => {
        const storage = new MemoryConfigStorage();
        const loader = new GeminiHistoryConfigLoader({
            env: {
                WXT_PROVIDER_CONFIG_BASE_URL: 'https://config.test/api/provider-configs'
            },
            storage,
            fetchImpl: async () => new Response(JSON.stringify({
                error: "Provider config 'gemini-history' not found.",
                code: 'PROVIDER_CONFIG_NOT_FOUND'
            }), {
                status: 404
            }),
            now: () => 789
        });

        const result = await loader.load();
        expect(result.metadata.source).toBe('builtin');
        expect(result.metadata.fetchedAt).toBe(789);
    });
});
