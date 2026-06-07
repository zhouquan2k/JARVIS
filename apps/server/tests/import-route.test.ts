import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';

function createConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    return {
        port: 8787,
        dbPath: ':memory:',
        isDevelopment: false,
        corsAllowlist: ['https://chatprism.test'],
        knowledgeRoot: undefined,
        contextBackend: 'local-file',
        codexCommand: 'codex',
        codexWorkingDirectory: process.cwd(),
        ...overrides
    };
}

describe('import route', () => {
    it('returns normalized transcript payload from the injected bilibili transcript service', async () => {
        const bilibiliTranscriptService = {
            fetch: vi.fn(async () => ({
                title: 'Demo Video',
                transcript: '第一行\n第二行'
            }))
        };
        const app = createApp({
            config: createConfig(),
            bilibiliTranscriptService: bilibiliTranscriptService as any
        });

        const response = await app.request('/api/import/bilibili', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: 'https://www.bilibili.com/video/BV1xx411c7mD' })
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            title: 'Demo Video',
            transcript: '第一行\n第二行'
        });
        expect(bilibiliTranscriptService.fetch).toHaveBeenCalledWith(
            'https://www.bilibili.com/video/BV1xx411c7mD',
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
    });

    it('propagates transcript fetch failures as route-level errors', async () => {
        const app = createApp({
            config: createConfig(),
            bilibiliTranscriptService: {
                fetch: vi.fn(async () => {
                    throw new Error('No subtitle track was available for this Bilibili video.');
                })
            } as any
        });

        const response = await app.request('/api/import/bilibili', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: 'https://www.bilibili.com/video/BV1xx411c7mD' })
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: 'No subtitle track was available for this Bilibili video.'
        });
    });

    it('responds to CORS preflight for bilibili import', async () => {
        const app = createApp({
            config: createConfig()
        });

        const response = await app.request('/api/import/bilibili', {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://chatprism.test',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type'
            }
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe('https://chatprism.test');
        expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
        expect(response.headers.get('access-control-allow-headers')).toBe('content-type');
    });
});
