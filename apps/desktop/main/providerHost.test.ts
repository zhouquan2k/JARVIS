import { describe, expect, it } from 'vitest';
import {
    ExternalHistoryError,
    type Conversation,
    type ConversationHistorySummary,
    type IHistoryProvider,
    type IModelProvider,
    type ProviderRuntime,
    type ProviderSendResult,
    type ProviderStreamUpdate,
    type SendMessageOptions
} from '@packages/core/src';
import { createProviderHost } from './providerHost';
import type { ProxyResponse } from '../shared/proxyProtocol';

class StreamingProvider implements IModelProvider {
    public id = 'chatgpt-web';
    private aborted = false;
    private readonly pending = new Map<string, { reject: (reason?: unknown) => void; timer: ReturnType<typeof setTimeout> }>();

    constructor(private readonly label: string) {}

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async getAvailableModels() {
        return {
            models: [{ id: 'auto', name: 'Auto' }],
            defaultModel: 'auto'
        };
    }

    async getDocumentCapability() {
        return {
            acceptedMimeTypes: ['text/plain', 'text/markdown', 'application/pdf']
        };
    }

    async sendMessage(
        prompt: string,
        options: SendMessageOptions,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> {
        this.aborted = false;
        const requestKey = `${options.context?.conversationId || prompt}-${this.label}`;
        onUpdate({ text: `${this.label}:${prompt}:partial` });

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestKey);
                if (this.aborted) {
                    reject(new Error('Request aborted'));
                    return;
                }

                resolve({
                    text: `${this.label}:${prompt}:done`,
                    conversationId: requestKey,
                    messageId: `${requestKey}-message`
                });
            }, 20);

            this.pending.set(requestKey, { reject, timer });
        });
    }

    abort(): void {
        this.aborted = true;
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Request aborted'));
        }
        this.pending.clear();
    }
}

class HistoryProviderStub implements IHistoryProvider {
    public id: 'chatgpt-web' = 'chatgpt-web';
    public lastQuery: string | undefined;

    async getHistoryList(options?: { query?: string }): Promise<ConversationHistorySummary[]> {
        this.lastQuery = options?.query;
        return [
            {
                id: 'history-1',
                title: 'Host History',
                updatedAt: 1,
                origin: 'chatgpt-web'
            }
        ];
    }

    async getHistoryDetail(externalId: string): Promise<Conversation> {
        return {
            id: 'conversation-1',
            title: 'Host Detail',
            backendId: externalId,
            externalId,
            origin: 'chatgpt-web',
            updatedAt: 1,
            messages: []
        };
    }
}

class AuthRequiredHistoryProviderStub implements IHistoryProvider {
    public id: 'gemini-web' = 'gemini-web';

    async getHistoryList(): Promise<ConversationHistorySummary[]> {
        throw new ExternalHistoryError('AUTH_REQUIRED', 'Gemini 页面当前未登录。', {
            providerId: 'gemini-web'
        });
    }

    async getHistoryDetail(): Promise<Conversation> {
        throw new ExternalHistoryError('AUTH_REQUIRED', 'Gemini 页面当前未登录。', {
            providerId: 'gemini-web'
        });
    }
}

function createRuntime(providerFactory: (providerId: string) => IModelProvider): ProviderRuntime {
    return {
        getAvailableProviders() {
            return [];
        },
        getProviderCatalog() {
            return [];
        },
        async getProviderModels() {
            return {
                models: [{ id: 'auto', name: 'Auto' }],
                defaultModel: 'auto'
            };
        },
        getProvider(providerId: string) {
            return providerFactory(providerId);
        }
    };
}

function waitForMicrotasks() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createProviderHost', () => {
    it('streams responses independently for concurrent sendMessage requests', async () => {
        const responses: ProxyResponse[] = [];
        const host = createProviderHost({
            runtime: createRuntime(() => new StreamingProvider('provider'))
        });

        await Promise.all([
            host.handleRequest({
                action: 'SEND_MESSAGE',
                requestId: 'request-a',
                channelId: 'channel-a',
                providerId: 'chatgpt-web',
                prompt: 'A'
            }, (response) => responses.push(response)),
            host.handleRequest({
                action: 'SEND_MESSAGE',
                requestId: 'request-b',
                channelId: 'channel-b',
                providerId: 'chatgpt-web',
                prompt: 'B'
            }, (response) => responses.push(response))
        ]);

        expect(responses.filter((item) => item.type === 'UPDATE')).toEqual([
            expect.objectContaining({ requestId: 'request-a', channelId: 'channel-a' }),
            expect.objectContaining({ requestId: 'request-b', channelId: 'channel-b' })
        ]);
        expect(responses.filter((item) => item.type === 'DONE')).toEqual([
            expect.objectContaining({ requestId: 'request-a', channelId: 'channel-a' }),
            expect.objectContaining({ requestId: 'request-b', channelId: 'channel-b' })
        ]);
    });

    it('forwards history responses and unsupported-history errors', async () => {
        const historyResponses: ProxyResponse[] = [];
        const historyProvider = new HistoryProviderStub();
        const host = createProviderHost({
            runtime: createRuntime(() => new StreamingProvider('provider')),
            resolveHistoryProvider: async (providerId) => providerId === 'chatgpt-web' ? historyProvider : undefined
        });

        await host.handleRequest({
            action: 'GET_HISTORY_LIST',
            requestId: 'history-list',
            channelId: 'history-channel',
            providerId: 'chatgpt-web',
            query: 'incident'
        }, (response) => historyResponses.push(response));

        expect(historyResponses).toEqual([
            expect.objectContaining({
                type: 'DONE',
                requestId: 'history-list',
                channelId: 'history-channel'
            })
        ]);
        expect(historyProvider.lastQuery).toBe('incident');

        const errorResponses: ProxyResponse[] = [];
        await host.handleRequest({
            action: 'GET_HISTORY_LIST',
            requestId: 'history-error',
            channelId: 'history-channel',
            providerId: 'gemini-web'
        }, (response) => errorResponses.push(response));

        expect(errorResponses).toEqual([
            expect.objectContaining({
                type: 'ERROR',
                requestId: 'history-error',
                channelId: 'history-channel',
                error: "Provider 'gemini-web' does not support history queries"
            })
        ]);
    });

    it('preserves external history error metadata for renderer recovery flows', async () => {
        const responses: ProxyResponse[] = [];
        const host = createProviderHost({
            runtime: createRuntime(() => new StreamingProvider('provider')),
            resolveHistoryProvider: async (providerId) => providerId === 'gemini-web' ? new AuthRequiredHistoryProviderStub() : undefined
        });

        await host.handleRequest({
            action: 'GET_HISTORY_LIST',
            requestId: 'gemini-auth-required',
            channelId: 'history-channel',
            providerId: 'gemini-web'
        }, (response) => responses.push(response));

        expect(responses).toEqual([
            expect.objectContaining({
                type: 'ERROR',
                requestId: 'gemini-auth-required',
                channelId: 'history-channel',
                error: 'Gemini 页面当前未登录。',
                historyErrorCode: 'AUTH_REQUIRED',
                historyProviderId: 'gemini-web'
            })
        ]);
    });

    it('returns provider document capability through the host bridge', async () => {
        const responses: ProxyResponse[] = [];
        const host = createProviderHost({
            runtime: createRuntime(() => new StreamingProvider('provider'))
        });

        await host.handleRequest({
            action: 'GET_DOCUMENT_CAPABILITY',
            requestId: 'doc-capability',
            channelId: 'provider-channel',
            providerId: 'chatgpt-web'
        }, (response) => responses.push(response));

        expect(responses).toEqual([
            expect.objectContaining({
                type: 'DONE',
                requestId: 'doc-capability',
                channelId: 'provider-channel',
                result: {
                    acceptedMimeTypes: ['text/plain', 'text/markdown', 'application/pdf']
                }
            })
        ]);
    });

    it('aborts only the targeted in-flight request', async () => {
        const providerA = new StreamingProvider('provider-a');
        const providerB = new StreamingProvider('provider-b');
        const responses: ProxyResponse[] = [];
        const host = createProviderHost({
            runtime: createRuntime((providerId) => providerId === 'chatgpt-web' ? providerA : providerB)
        });

        const requestA = host.handleRequest({
            action: 'SEND_MESSAGE',
            requestId: 'request-a',
            channelId: 'shared-channel',
            providerId: 'chatgpt-web',
            prompt: 'A'
        }, (response) => responses.push(response));

        const requestB = host.handleRequest({
            action: 'SEND_MESSAGE',
            requestId: 'request-b',
            channelId: 'shared-channel',
            providerId: 'gemini-api',
            prompt: 'B'
        }, (response) => responses.push(response));

        await waitForMicrotasks();

        await host.handleRequest({
            action: 'ABORT',
            requestId: 'abort-a',
            channelId: 'shared-channel',
            targetRequestId: 'request-a'
        }, () => undefined);

        await Promise.allSettled([requestA, requestB]);

        expect(responses).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'ERROR', requestId: 'request-a', channelId: 'shared-channel' }),
            expect.objectContaining({ type: 'DONE', requestId: 'request-b', channelId: 'shared-channel' })
        ]));
    });
});
