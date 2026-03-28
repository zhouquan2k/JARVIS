import { describe, expect, it, vi } from 'vitest';
import { GeminiApiProvider } from './GeminiApiProvider';

const scopedAgent = {
    name: 'Docs Agent',
    description: 'Documentation specialist',
    instructions: 'Use documentation context only.',
    effectiveInstructions: 'Use documentation context only.',
    modelProviderName: 'gemini-api',
    modelName: 'gemini-2.5-pro',
    scopePath: '/docs',
    sourcePaths: ['/docs/.agent.json'],
    tools: [{ id: 'read_document', description: 'Read docs' }],
    skills: [{ id: 'summarize', description: 'Summarize docs' }]
};

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
                {
                    id: 'gemini-2.5-flash',
                    name: 'Gemini 2.5 Flash',
                    options: [expect.objectContaining({ key: 'deep_research', type: 'boolean' })]
                },
                {
                    id: 'gemini-2.5-pro',
                    name: 'Gemini 2.5 Pro',
                    options: [expect.objectContaining({ key: 'deep_research', type: 'boolean' })]
                }
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
                {
                    id: 'gemini-2.5-flash',
                    name: 'Gemini 2.5 Flash',
                    options: [expect.objectContaining({ key: 'deep_research', type: 'boolean' })]
                },
                {
                    id: 'gemini-2.0-flash',
                    name: 'Gemini 2.0 Flash',
                    options: [expect.objectContaining({ key: 'deep_research', type: 'boolean' })]
                },
                {
                    id: 'gemini-2.5-pro',
                    name: 'Gemini 2.5 Pro',
                    options: [expect.objectContaining({ key: 'deep_research', type: 'boolean' })]
                }
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

    it('normalizes markdown attachments to text/plain for Gemini document input', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createGeminiSseResponse([
                {
                    candidates: [
                        {
                            content: {
                                parts: [{ text: '已分析' }]
                            }
                        }
                    ]
                }
            ])
        );
        vi.stubGlobal('fetch', fetchMock);

        const provider = new GeminiApiProvider({ apiKey: 'test-key' });
        await provider.sendMessage(
            '分析附件',
            {
                modelId: 'gemini-2.5-flash',
                attachments: [
                    {
                        id: 'file-1',
                        type: 'file',
                        name: 'notes.md',
                        mimeType: 'application/octet-stream',
                        size: 12,
                        base64Data: 'IyBUaXRsZQ=='
                    }
                ]
            },
            () => undefined
        );

        const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(requestBody.contents[0]?.parts).toEqual([
            { text: '分析附件' },
            { inlineData: { mimeType: 'text/plain', data: 'IyBUaXRsZQ==' } }
        ]);

        vi.unstubAllGlobals();
    });

    it('replays prior conversation history in Gemini contents', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createGeminiSseResponse([
                {
                    candidates: [
                        {
                            content: {
                                parts: [{ text: '继续回答' }]
                            }
                        }
                    ]
                }
            ])
        );
        vi.stubGlobal('fetch', fetchMock);

        const provider = new GeminiApiProvider({ apiKey: 'test-key' });
        await provider.sendMessage(
            '第二问',
            {
                modelId: 'gemini-2.5-flash',
                history: [
                    { role: 'user', content: '第一问' },
                    { role: 'assistant', content: '第一答' }
                ]
            },
            () => undefined
        );

        const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(requestBody.contents).toEqual([
            {
                role: 'user',
                parts: [{ text: '第一问' }]
            },
            {
                role: 'model',
                parts: [{ text: '第一答' }]
            },
            {
                role: 'user',
                parts: [{ text: '第二问' }]
            }
        ]);

        vi.unstubAllGlobals();
    });

    it('adds research tools when deep research is enabled', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createGeminiSseResponse([
                {
                    candidates: [
                        {
                            content: {
                                parts: [{ text: '研究结果' }]
                            }
                        }
                    ]
                }
            ])
        );
        vi.stubGlobal('fetch', fetchMock);

        const provider = new GeminiApiProvider({ apiKey: 'test-key' });
        await provider.sendMessage(
            '做研究',
            {
                modelId: 'gemini-2.5-flash',
                modelOptions: { deep_research: true }
            },
            () => undefined
        );

        const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(requestBody.tools).toEqual([{ googleSearch: {} }]);

        vi.unstubAllGlobals();
    });

    it('declares native agent capability for AgentRuntime', () => {
        const provider = new GeminiApiProvider({ apiKey: 'test-key' });
        expect(provider.getAgentCapabilities()).toEqual({
            nativeAgent: true,
            toolLoop: 'application-managed'
        });
    });

    it('builds native agent requests with system instructions and function declarations', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createGeminiSseResponse([
                {
                    candidates: [
                        {
                            content: {
                                parts: [{ text: 'Agent 已响应' }]
                            }
                        }
                    ]
                }
            ])
        );
        vi.stubGlobal('fetch', fetchMock);

        const provider = new GeminiApiProvider({ apiKey: 'test-key' });
        await provider.runAgent(
            {
                prompt: '请分析当前文档',
                agent: scopedAgent,
                modelOptions: { deep_research: true },
                toolExchanges: [
                    {
                        modelTurn: {
                            role: 'model',
                            parts: [
                                {
                                    text: '前置思考',
                                    thoughtSignature: 'sig-1'
                                },
                                {
                                    functionCall: {
                                        id: 'call-1',
                                        name: 'read_document',
                                        args: { path: '/docs/guide.md' }
                                    }
                                }
                            ]
                        },
                        call: {
                            id: 'call-1',
                            name: 'read_document',
                            arguments: { path: '/docs/guide.md' }
                        },
                        result: {
                            toolCallId: 'call-1',
                            name: 'read_document',
                            result: '文档内容',
                            isError: false
                        }
                    }
                ]
            },
            () => undefined
        );

        const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(requestBody.systemInstruction.parts[0].text).toBe('Use documentation context only.');
        expect(requestBody.contents.at(-2)).toEqual({
            role: 'model',
            parts: [
                {
                    text: '前置思考',
                    thoughtSignature: 'sig-1'
                },
                {
                    functionCall: {
                        id: 'call-1',
                        name: 'read_document',
                        args: { path: '/docs/guide.md' }
                    }
                }
            ]
        });
        expect(requestBody.contents.at(-1)).toEqual({
            role: 'user',
            parts: [
                {
                    functionResponse: {
                        id: 'call-1',
                        name: 'read_document',
                        response: {
                            result: '文档内容',
                            isError: false
                        }
                    }
                }
            ]
        });
        expect(requestBody.tools).toEqual([
            { googleSearch: {} },
            {
                functionDeclarations: [
                    {
                        name: 'read_document',
                        description: 'Read docs',
                        parameters: {
                            type: 'OBJECT',
                            properties: {}
                        }
                    }
                ]
            }
        ]);
        expect(requestBody.toolConfig).toEqual({
            functionCallingConfig: {
                mode: 'AUTO'
            }
        });

        vi.unstubAllGlobals();
    });

    it('returns tool calls from the native agent SSE stream while preserving text updates', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createGeminiSseResponse([
                {
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        text: '前置思考',
                                        thoughtSignature: 'sig-1'
                                    },
                                    {
                                        functionCall: {
                                            name: 'read_document',
                                            args: { path: '/docs/guide.md' },
                                            id: 'call-1'
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                },
                {
                    candidates: [
                        {
                            content: {
                                parts: [{ text: '最终答案' }]
                            }
                        }
                    ]
                }
            ])
        );
        vi.stubGlobal('fetch', fetchMock);

        const provider = new GeminiApiProvider({ apiKey: 'test-key' });
        const updates: Array<{ text: string; toolCalls?: unknown[] }> = [];
        const result = await provider.runAgent(
            {
                prompt: '请分析当前文档',
                agent: scopedAgent
            },
            (update) => updates.push(update)
        );

        expect(updates[0]).toEqual({
            text: '前置思考',
            toolCalls: [
                {
                    id: 'call-1',
                    name: 'read_document',
                    arguments: { path: '/docs/guide.md' }
                }
            ]
        });
        expect(updates[1]).toEqual({ text: '前置思考最终答案', toolCalls: undefined });
        expect(result.toolCalls).toEqual([
            {
                id: 'call-1',
                name: 'read_document',
                arguments: { path: '/docs/guide.md' }
            }
        ]);
        expect(result.modelTurn).toEqual({
            role: 'model',
            parts: [
                {
                    text: '最终答案'
                }
            ]
        });
        expect(result.text).toBe('前置思考最终答案');

        vi.unstubAllGlobals();
    });
});
