import { describe, expect, it, vi } from 'vitest';
import { augmentPromptWithAgentContext } from '../augmentPromptWithAgentContext';
import { createMockContextProvider } from '../../testing/createMockContextProvider';
import { encodeTextDocument } from '../../utils/documentData';
import type {
    AgentCapabilities,
    AgentRunRequest,
    IAgentCapableProvider
} from '../../interfaces/IAgentCapableProvider';
import type { IModelProvider, ProviderSendResult, ProviderStreamUpdate, SendMessageOptions } from '../../interfaces/IModelProvider';
import type { ProviderRuntime } from '../../runtime/providerRuntime.types';
import { createAgentRuntime } from './createAgentRuntime';

const scopedAgent = {
    name: 'Docs Agent',
    description: 'Documentation specialist',
    instructions: 'Use documentation context only.',
    effectiveInstructions: 'Use documentation context only.',
    modelProviderName: 'gemini-api',
    modelName: 'gemini-2.5-pro',
    scopePath: '/docs',
    sourcePaths: ['/docs/.agent.json'],
    tools: [{ id: 'read_file', description: 'Read docs' }]
};

class BasicProvider implements IModelProvider {
    public id = 'basic-provider';
    public acceptedMimeTypes = ['text/plain', 'text/markdown', 'application/pdf'];
    public sendMessage = vi.fn(async (
        prompt: string,
        _options: SendMessageOptions,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> => {
        onUpdate({ text: `fallback:${prompt}` });
        return {
            text: `fallback:${prompt}`,
            conversationId: 'conversation-id',
            messageId: 'message-id'
        };
    });

    async getAvailableModels() {
        return {
            models: [{ id: 'mock-model', name: 'Mock Model' }],
            defaultModel: 'mock-model'
        };
    }

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async getDocumentCapability() {
        return {
            acceptedMimeTypes: [...this.acceptedMimeTypes]
        };
    }

    abort(): void {}
}

class AgentProvider extends BasicProvider implements IAgentCapableProvider {
    private iteration = 0;
    public runAgent = vi.fn(async (
        request: AgentRunRequest,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> => {
        this.iteration += 1;
        if (this.iteration === 1) {
            onUpdate({ text: 'native:intro' });
            return {
                text: 'native:intro',
                conversationId: 'conversation-id',
                messageId: 'message-id',
                modelTurn: {
                    role: 'model',
                    parts: [
                        {
                            text: 'native:intro',
                            thoughtSignature: 'sig-1'
                        },
                                {
                                    functionCall: {
                                        id: 'call-1',
                                        name: 'read_file',
                                        args: { path: '/docs/guide.md' }
                                    }
                                }
                    ]
                },
                toolCalls: [
                    {
                        id: 'call-1',
                        name: 'read_file',
                        arguments: { path: '/docs/guide.md' }
                    }
                ]
            };
        }

        expect(request.toolExchanges).toHaveLength(1);
        expect(request.toolExchanges?.[0]?.modelTurn).toEqual({
            role: 'model',
            parts: [
                {
                    text: 'native:intro',
                    thoughtSignature: 'sig-1'
                },
                {
                    functionCall: {
                        id: 'call-1',
                        name: 'read_file',
                        args: { path: '/docs/guide.md' }
                    }
                }
            ]
        });
        expect(request.tools).toEqual([
            {
                id: 'read_file',
                description: 'Read docs',
                inputSchema: {
                    type: 'OBJECT',
                    properties: {
                        path: { type: 'STRING', description: 'Absolute file path inside the workspace scope.' }
                    },
                    required: ['path']
                }
            }
        ]);
        expect(request.toolExchanges?.[0]?.call.name).toBe('read_file');
        expect(request.toolExchanges?.[0]?.result.isError).toBeUndefined();
        expect(JSON.parse(request.toolExchanges?.[0]?.result.result || '{}')).toEqual({
            path: '/docs/guide.md',
            mimeType: 'text/markdown',
            content: '# Guide'
        });
        onUpdate({ text: 'native:done' });
        return {
            text: 'native:done',
            conversationId: 'conversation-id',
            messageId: 'message-id'
        };
    });

    getAgentCapabilities(): AgentCapabilities {
        return {
            nativeAgent: true,
            toolLoop: 'application-managed'
        };
    }
}

class MultiToolAgentProvider extends BasicProvider implements IAgentCapableProvider {
    private iteration = 0;
    public runAgent = vi.fn(async (
        request: AgentRunRequest,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> => {
        this.iteration += 1;
        if (this.iteration === 1) {
            onUpdate({ text: 'native:planning' });
            return {
                text: 'native:planning',
                conversationId: 'conversation-id',
                messageId: 'message-id',
                modelTurn: {
                    role: 'model',
                    parts: [
                        {
                            functionCall: {
                                id: 'call-1',
                                name: 'read_file',
                                args: { path: '/docs/guide.md' }
                            }
                        },
                        {
                            functionCall: {
                                id: 'call-2',
                                name: 'read_current_file',
                                args: {}
                            }
                        }
                    ]
                },
                toolCalls: [
                    {
                        id: 'call-1',
                        name: 'read_file',
                        arguments: { path: '/docs/guide.md' }
                    },
                    {
                        id: 'call-2',
                        name: 'read_current_file',
                        arguments: {}
                    }
                ]
            };
        }

        onUpdate({ text: 'native:done' });
        return {
            text: 'native:done',
            conversationId: 'conversation-id',
            messageId: 'message-id'
        };
    });

    getAgentCapabilities(): AgentCapabilities {
        return {
            nativeAgent: true,
            toolLoop: 'application-managed'
        };
    }
}

function createRuntime(provider: IModelProvider): ProviderRuntime {
    return {
        getAvailableProviders: () => [],
        getProviderCatalog: () => [],
        getProviderModels: async () => ({
            models: [{ id: 'mock-model', name: 'Mock Model' }],
            defaultModel: 'mock-model'
        }),
        getProvider: () => provider
    };
}

describe('createAgentRuntime', () => {
    it('routes agent requests to native providers when capability is available', async () => {
        const provider = new AgentProvider();
        const runtime = createAgentRuntime({
            providerRuntime: createRuntime(provider)
        });
        const updates: string[] = [];
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({ name: 'Docs Agent' }),
                '/docs/guide.md': '# Guide'
            }
        });

        const result = await runtime.run(
            {
                prompt: '请总结文档',
                agent: scopedAgent,
                workspace: {
                    activePath: '/docs/guide.md',
                    contextProvider
                },
                providerId: 'gemini-api',
                modelId: 'gemini-2.5-pro'
            },
            (update) => updates.push(update.text)
        );

        expect(provider.runAgent).toHaveBeenCalledTimes(2);
        expect(provider.sendMessage).not.toHaveBeenCalled();
        expect(result.text).toContain('native:intro');
        expect(result.text).toContain('Function Call Request');
        expect(result.text).toContain('"name": "read_file"');
        expect(result.text).toContain('Function Call Response');
        expect(result.text).toContain('\\"content\\":\\"# Guide\\"');
        expect(result.text).toContain('native:done');
        expect(updates).toHaveLength(3);
        expect(updates[0]).toBe('native:intro');
        expect(updates[1]).toContain('Function Call Request');
        expect(updates[1]).toContain('Function Call Response');
        expect(updates[2]).toBe(result.text);
    });

    it('falls back to prompt envelope when the provider does not support native agents', async () => {
        const provider = new BasicProvider();
        const runtime = createAgentRuntime({
            providerRuntime: createRuntime(provider)
        });

        const result = await runtime.run(
            {
                prompt: '请总结文档',
                agent: scopedAgent,
                workspace: {
                    activePath: '/docs/guide.md',
                    activeDocument: {
                        path: '/docs/guide.md',
                        mimeType: 'text/markdown',
                        dataBase64: encodeTextDocument('# Guide')
                    },
                    contextProvider: null
                },
                providerId: 'chatgpt-web',
                modelId: 'gpt-4o'
            },
            () => undefined
        );

        expect(provider.sendMessage).toHaveBeenCalledTimes(1);
        expect(provider.sendMessage.mock.calls[0]?.[0]).toBe(augmentPromptWithAgentContext('请总结文档', {
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide')
            }
        }));
        expect(result.text).toContain('fallback:');
        expect(result.requestSnapshot).toEqual({
            prompt: augmentPromptWithAgentContext('请总结文档', {
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Guide')
                }
            }),
            attachments: [
                expect.objectContaining({
                    id: 'active-document:/docs/guide.md',
                    name: 'guide.md',
                    mimeType: 'text/markdown',
                    base64Data: encodeTextDocument('# Guide')
                })
            ],
            activeDocumentMode: 'attachment'
        });
    });

    it('reuses the standard stream/update contracts for non-agent requests', async () => {
        const provider = new BasicProvider();
        const runtime = createAgentRuntime({
            providerRuntime: createRuntime(provider)
        });
        const updates: ProviderStreamUpdate[] = [];

        const result = await runtime.run(
            {
                prompt: '普通聊天',
                agent: null,
                providerId: 'gemini-api',
                modelId: 'gemini-2.5-flash'
            },
            (update) => updates.push(update)
        );

        expect(updates).toEqual([{ text: 'fallback:普通聊天' }]);
        expect(result).toEqual({
            text: 'fallback:普通聊天',
            conversationId: 'conversation-id',
            messageId: 'message-id',
            requestSnapshot: {
                prompt: '普通聊天',
                attachments: [],
                activeDocumentMode: 'none'
            }
        });
    });

    it('renders a grouped tool round summary when a single turn emits multiple function calls', async () => {
        const provider = new MultiToolAgentProvider();
        const runtime = createAgentRuntime({
            providerRuntime: createRuntime(provider)
        });
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({ name: 'Docs Agent' }),
                '/docs/guide.md': '# Guide'
            }
        });

        const result = await runtime.run(
            {
                prompt: '请同时读取文件',
                agent: {
                    ...scopedAgent,
                    tools: [
                        { id: 'read_file', description: 'Read docs' },
                        { id: 'read_current_file', description: 'Read active file' }
                    ]
                },
                workspace: {
                    activePath: '/docs/guide.md',
                    activeDocument: {
                        path: '/docs/guide.md',
                        mimeType: 'text/markdown',
                        dataBase64: encodeTextDocument('# Guide')
                    },
                    contextProvider
                },
                providerId: 'gemini-api',
                modelId: 'gemini-2.5-pro'
            },
            () => undefined
        );

        expect(result.text).toContain('### 本轮工具调用（2 个函数调用）');
        expect(result.text).toContain('#### 调用 1: `read_file`');
        expect(result.text).toContain('#### 调用 2: `read_current_file`');
    });

    it('passes the active file context into native agent requests', async () => {
        const provider = new AgentProvider();
        const runtime = createAgentRuntime({
            providerRuntime: createRuntime(provider)
        });

        await runtime.run(
            {
                prompt: '请总结文档',
                agent: scopedAgent,
                workspace: {
                    activePath: '/docs/guide.md',
                    activeDocument: {
                        path: '/docs/guide.md',
                        mimeType: 'text/markdown',
                        dataBase64: encodeTextDocument('# Guide')
                    },
                    contextProvider: createMockContextProvider({
                        nodes: [{ path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }],
                        documents: { '/docs/guide.md': '# Guide' }
                    })
                },
                providerId: 'gemini-api',
                modelId: 'gemini-2.5-pro'
            },
            () => undefined
        );

        expect(provider.runAgent.mock.calls[0]?.[0]?.prompt).toBe('当前文档已作为附件提供：/docs/guide.md\n\n请总结文档');
        expect(provider.runAgent.mock.calls[0]?.[0]?.attachments).toEqual([
            expect.objectContaining({
                id: 'active-document:/docs/guide.md',
                name: 'guide.md',
                mimeType: 'text/markdown',
                base64Data: encodeTextDocument('# Guide')
            })
        ]);
    });

    it('attaches active pdf documents for providers that accept application/pdf', async () => {
        const provider = new BasicProvider();
        const runtime = createAgentRuntime({
            providerRuntime: createRuntime(provider)
        });

        const result = await runtime.run(
            {
                prompt: '请总结这个 PDF',
                agent: scopedAgent,
                workspace: {
                    activePath: '/docs/spec.pdf',
                    activeDocument: {
                        path: '/docs/spec.pdf',
                        mimeType: 'application/pdf',
                        dataBase64: 'JVBERi0xLjQ='
                    },
                    contextProvider: null
                },
                providerId: 'chatgpt-web',
                modelId: 'gpt-4o'
            },
            () => undefined
        );

        expect(provider.sendMessage.mock.calls[0]?.[0]).toBe('请总结这个 PDF');
        expect(provider.sendMessage.mock.calls[0]?.[1]?.attachments).toEqual([
            expect.objectContaining({
                id: 'active-document:/docs/spec.pdf',
                name: 'spec.pdf',
                mimeType: 'application/pdf',
                base64Data: 'JVBERi0xLjQ='
            })
        ]);
        expect(result.requestSnapshot).toMatchObject({
            prompt: '请总结这个 PDF',
            activeDocumentMode: 'attachment',
            attachments: [
                expect.objectContaining({
                    id: 'active-document:/docs/spec.pdf',
                    name: 'spec.pdf',
                    mimeType: 'application/pdf',
                    base64Data: 'JVBERi0xLjQ='
                })
            ]
        });
    });

    it('omits unsupported active document payloads from fallback requests', async () => {
        const provider = new BasicProvider();
        provider.acceptedMimeTypes = ['text/plain', 'text/markdown'];
        const runtime = createAgentRuntime({
            providerRuntime: createRuntime(provider)
        });

        const result = await runtime.run(
            {
                prompt: '请总结这个 PDF',
                agent: scopedAgent,
                workspace: {
                    activePath: '/docs/spec.pdf',
                    activeDocument: {
                        path: '/docs/spec.pdf',
                        mimeType: 'application/pdf',
                        dataBase64: 'JVBERi0xLjQ='
                    },
                    contextProvider: null
                },
                providerId: 'chatgpt-web',
                modelId: 'gpt-4o'
            },
            () => undefined
        );

        expect(provider.sendMessage.mock.calls[0]?.[0]).toBe('请总结这个 PDF');
        expect(provider.sendMessage.mock.calls[0]?.[1]?.attachments).toEqual([]);
        expect(result.requestSnapshot).toEqual({
            prompt: '请总结这个 PDF',
            attachments: [],
            activeDocumentMode: 'omitted'
        });
    });
});
