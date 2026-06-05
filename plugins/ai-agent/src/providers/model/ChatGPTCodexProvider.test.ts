import { describe, expect, it, vi } from 'vitest';
import { ChatGPTCodexProvider } from './ChatGPTCodexProvider';

function createSseResponse(events: unknown[]) {
    const encoder = new TextEncoder();
    const chunks = events.map((event) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    chunks.push(encoder.encode('data: [DONE]\n\n'));

    return {
        ok: true,
        body: new ReadableStream({
            start(controller) {
                chunks.forEach((chunk) => controller.enqueue(chunk));
                controller.close();
            }
        }),
        text: async () => ''
    };
}

describe('ChatGPTCodexProvider', () => {
    it('checks auth through the local provider server', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({ authenticated: true })
        });

        const provider = new ChatGPTCodexProvider({
            baseUrl: 'http://127.0.0.1:8787/api/codex',
            requestClient: { fetch: fetchMock }
        });

        await expect(provider.checkAuth()).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8787/api/codex/auth/status', expect.objectContaining({
            method: 'GET'
        }));
    });

    it('falls back to the static catalog when the server catalog request fails', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => JSON.stringify({ error: 'boom' })
        });

        const provider = new ChatGPTCodexProvider({
            baseUrl: 'http://127.0.0.1:8787/api/codex',
            requestClient: { fetch: fetchMock }
        });

        await expect(provider.getAvailableModels()).resolves.toEqual({
            models: [
                {
                    id: 'auto',
                    name: 'Auto (Default)',
                    nameKey: 'model.autoDefault',
                    options: [
                        expect.objectContaining({ key: 'web_search' }),
                        expect.objectContaining({ key: 'deep_research' })
                    ]
                },
                {
                    id: 'gpt-5.4',
                    name: 'gpt-5.4',
                    options: [
                        expect.objectContaining({ key: 'web_search' }),
                        expect.objectContaining({ key: 'deep_research' })
                    ]
                }
            ],
            defaultModel: 'auto'
        });
    });

    it('streams normal chat updates through the server-backed SSE contract', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createSseResponse([
                { type: 'message.delta', delta: 'Hello' },
                { type: 'message.delta', delta: ' world' },
                { type: 'message.completed', text: 'Hello world', conversationId: 'conv-1', messageId: 'msg-1' }
            ])
        );

        const provider = new ChatGPTCodexProvider({
            baseUrl: 'http://127.0.0.1:8787/api/codex',
            requestClient: { fetch: fetchMock }
        });
        const updates: string[] = [];

        const result = await provider.sendMessage('Hello', {}, (update) => {
            updates.push(update.text);
        });

        expect(result).toEqual({
            text: 'Hello world',
            conversationId: 'conv-1',
            messageId: 'msg-1',
            toolCalls: undefined,
            modelTurn: undefined,
            functionalParts: undefined
        });
        expect(updates).toEqual(['Hello', 'Hello world']);
    });

    it('uses the configured lightweight codex model to generate a short title', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createSseResponse([
                { type: 'message.completed', text: '"事故复盘"' }
            ])
        );

        const provider = new ChatGPTCodexProvider({
            baseUrl: 'http://127.0.0.1:8787/api/codex',
            requestClient: { fetch: fetchMock },
            lightweightModel: {
                providerId: 'chatgpt-codex',
                modelId: 'gpt-5.4',
                reasoningEffort: 'low',
                modelOptions: {
                    web_search: false,
                    deep_research: false
                }
            }
        });

        await expect(provider.generateConversationTitle?.('请帮我总结这次事故复盘重点', 10)).resolves.toBe('事故复盘');
        const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(body.options).toMatchObject({
            modelId: 'gpt-5.4',
            reasoningEffort: 'low',
            modelOptions: {
                web_search: false,
                deep_research: false
            }
        });
        expect(body.prompt).toContain('生成一个尽可能短的中文会话标题');
    });

    it('exposes native agent capability and returns server tool calls', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createSseResponse([
                { type: 'message.delta', delta: 'Running tools' },
                {
                    type: 'message.completed',
                    text: 'Running tools',
                    conversationId: 'agent-conv',
                    messageId: 'agent-msg',
                    toolCalls: [{ id: 'tool-1', name: 'read_file', arguments: { path: 'README.md' } }]
                }
            ])
        );

        const provider = new ChatGPTCodexProvider({
            baseUrl: 'http://127.0.0.1:8787/api/codex',
            requestClient: { fetch: fetchMock }
        });

        expect(provider.getAgentCapabilities()).toEqual({
            nativeAgent: true,
            toolLoop: 'application-managed'
        });

        const result = await provider.runAgent({
            prompt: 'Inspect the docs',
            agent: {
                name: 'Docs Agent',
                description: 'Reads docs',
                instructions: 'Read docs',
                effectiveInstructions: 'Read docs',
                modelProviderName: 'chatgpt-codex',
                modelName: 'codex',
                scopePath: '/docs',
                sourcePaths: [],
                tools: [],
                skills: []
            }
        }, () => undefined);

        expect(result.toolCalls).toEqual([
            { id: 'tool-1', name: 'read_file', arguments: { path: 'README.md' } }
        ]);
    });
});
