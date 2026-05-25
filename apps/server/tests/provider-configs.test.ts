import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';

function createConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    return {
        port: 8787,
        dbPath: ':memory:',
        isDevelopment: true,
        corsAllowlist: [],
        contextBackend: 'local-file',
        codexCommand: 'codex',
        codexWorkingDirectory: process.cwd(),
        ...overrides
    };
}

describe('provider config api', () => {
    it('returns the Gemini history config document', async () => {
        const app = createApp({ config: createConfig() });
        const response = await app.request('/api/provider-configs/gemini-history');

        expect(response.status).toBe(200);
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
        await expect(response.json()).resolves.toMatchObject({
            providerId: 'gemini-web',
            version: expect.any(String),
            matchOrigins: expect.arrayContaining(['https://gemini.google.com']),
            selectors: expect.objectContaining({
                historyListContainer: expect.any(String),
                conversationRoot: expect.any(String)
            }),
            healthCheck: expect.objectContaining({
                requiredSelectors: expect.arrayContaining(['historyListContainer']),
                maxMissingCount: 2
            })
        });
    });

    it('returns 404 for unknown provider config', async () => {
        const app = createApp({ config: createConfig() });
        const response = await app.request('/api/provider-configs/not-exists');

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({
            error: "Provider config 'not-exists' not found.",
            code: 'PROVIDER_CONFIG_NOT_FOUND'
        });
    });

    it('includes cache and version metadata headers', async () => {
        const app = createApp({ config: createConfig() });
        const response = await app.request('/api/provider-configs/gemini-history');

        expect(response.status).toBe(200);
        expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
        expect(response.headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=600');
        expect(response.headers.get('etag')).toMatch(/gemini-history:/);
        expect(response.headers.get('x-provider-config-version')).toBeTruthy();
    });

    it('responds to CORS preflight for provider configs', async () => {
        const app = createApp({ config: createConfig() });
        const response = await app.request('/api/provider-configs/gemini-history', {
            method: 'OPTIONS',
            headers: {
                Origin: 'chrome-extension://example-extension-id'
            }
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
        expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
    });
});
