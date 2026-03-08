import { describe, expect, it, vi } from 'vitest';
import { GeminiApiProvider } from './GeminiApiProvider';

describe('GeminiApiProvider', () => {
    it('loads chat-capable models from Google models.list', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                models: [
                    {
                        name: 'models/gemini-2.5-flash',
                        baseModelId: 'gemini-2.5-flash',
                        displayName: 'Gemini 2.5 Flash',
                        supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
                    },
                    {
                        name: 'models/embedding-001',
                        baseModelId: 'embedding-001',
                        displayName: 'Embedding 001',
                        supportedGenerationMethods: ['embedContent']
                    },
                    {
                        name: 'models/gemini-2.5-pro',
                        baseModelId: 'gemini-2.5-pro',
                        displayName: 'Gemini 2.5 Pro',
                        supportedGenerationMethods: ['generateContent']
                    }
                ]
            })
        });
        vi.stubGlobal('fetch', fetchMock);

        const provider = new GeminiApiProvider({ apiKey: 'test-key' });
        await expect(provider.getAvailableModels()).resolves.toEqual({
            models: [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
            ],
            defaultModel: 'gemini-2.5-flash'
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain('https://generativelanguage.googleapis.com/v1beta/models');
        vi.unstubAllGlobals();
    });

    it('falls back to static config when models.list fails', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
        });
        vi.stubGlobal('fetch', fetchMock);

        const provider = new GeminiApiProvider({ apiKey: 'test-key' });
        await expect(provider.getAvailableModels()).resolves.toEqual({
            models: [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
                { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
            ],
            defaultModel: 'gemini-2.5-flash'
        });

        vi.unstubAllGlobals();
    });
});
