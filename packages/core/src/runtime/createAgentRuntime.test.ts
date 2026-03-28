import { describe, expect, it, vi } from 'vitest';
import { buildAgentPromptEnvelope } from '../agents/buildAgentPromptEnvelope';
import type {
    AgentCapabilities,
    AgentRunRequest,
    IAgentCapableProvider
} from '../interfaces/IAgentCapableProvider';
import type { IModelProvider, ProviderSendResult, ProviderStreamUpdate, SendMessageOptions } from '../interfaces/IModelProvider';
import type { ProviderRuntime } from './types';
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
    tools: [{ id: 'read_document', description: 'Read docs' }]
};

class BasicProvider implements IModelProvider {
    public id = 'basic-provider';
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
                                name: 'read_document',
                                args: { path: '/docs/guide.md' }
                            }
                        }
                    ]
                },
                toolCalls: [
                    {
                        id: 'call-1',
                        name: 'read_document',
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
                        name: 'read_document',
                        args: { path: '/docs/guide.md' }
                    }
                }
            ]
        });
        expect(request.toolExchanges?.[0]?.call.name).toBe('read_document');
        expect(request.toolExchanges?.[0]?.result.isError).toBe(true);
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

        const result = await runtime.run(
            {
                prompt: '请总结文档',
                agent: scopedAgent,
                providerId: 'gemini-api',
                modelId: 'gemini-2.5-pro'
            },
            (update) => updates.push(update.text)
        );

        expect(provider.runAgent).toHaveBeenCalledTimes(2);
        expect(provider.sendMessage).not.toHaveBeenCalled();
        expect(result.text).toContain('native:intro');
        expect(result.text).toContain('Function Call Request');
        expect(result.text).toContain('"name": "read_document"');
        expect(result.text).toContain('Function Call Response');
        expect(result.text).toContain("Tool 'read_document' declared by agent 'Docs Agent' is not implemented in phase one.");
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
                providerId: 'chatgpt-web',
                modelId: 'gpt-4o'
            },
            () => undefined
        );

        expect(provider.sendMessage).toHaveBeenCalledTimes(1);
        expect(provider.sendMessage.mock.calls[0]?.[0]).toBe(buildAgentPromptEnvelope(scopedAgent, '请总结文档'));
        expect(result.text).toContain('fallback:');
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
            messageId: 'message-id'
        });
    });
});
