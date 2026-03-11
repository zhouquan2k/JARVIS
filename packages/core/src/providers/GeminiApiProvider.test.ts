import { describe, expect, it, vi } from 'vitest';
import { GeminiApiProvider } from './GeminiApiProvider';

function createGeminiSseResponse(events: unknown[]) {
    const encoder = new TextEncoder();
    const chunks = events.map((event) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

    return {
        ok: true,
        body: new ReadableStream({
            start(controller) {
                chunks.forEach((chunk) => controller.enqueue(chunk));
                controller.close();
            }
        })
    };
}

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

    it('encodes attachments as inlineData and emits normalized text snapshots', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createGeminiSseResponse([
                {
                    candidates: [
                        {
                            content: {
                                parts: [{ text: '第一段' }]
                            }
                        }
                    ]
                },
                {
                    candidates: [
                        {
                            content: {
                                parts: [{ text: '第二段' }]
                            }
                        }
                    ]
                }
            ])
        );
        vi.stubGlobal('fetch', fetchMock);

        const provider = new GeminiApiProvider({ apiKey: 'test-key' });
        const updates: string[] = [];
        const result = await provider.sendMessage(
            '分析这张图',
            {
                modelId: 'gemini-2.5-flash',
                attachments: [
                    {
                        id: 'image-1',
                        type: 'image',
                        name: 'chart.png',
                        mimeType: 'image/png',
                        size: 512,
                        base64Data: 'data:image/png;base64,aW1n'
                    },
                    {
                        id: 'file-1',
                        type: 'file',
                        name: 'notes.txt',
                        mimeType: 'text/plain',
                        size: 12,
                        base64Data: 'bm90ZXM='
                    }
                ]
            },
            (update) => updates.push(update.text)
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(requestBody.contents[0]?.parts).toEqual([
            { text: '分析这张图' },
            { inlineData: { mimeType: 'image/png', data: 'aW1n' } },
            { inlineData: { mimeType: 'text/plain', data: 'bm90ZXM=' } }
        ]);
        expect(updates).toEqual(['第一段', '第一段第二段']);
        expect(result.text).toBe('第一段第二段');

        vi.unstubAllGlobals();
    });
});
