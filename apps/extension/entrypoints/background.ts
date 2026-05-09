/// <reference types="chrome"/>
import { ExternalHistoryError, GeminiHistoryConfigLoader } from '@packages/core/src';
import type { IExternalConversationProvider, IModelProvider, ModelProviderRuntime } from '@packages/core/src';
import { GeminiHistoryTabBridge } from '../src/history/GeminiHistoryTabBridge';
import { GeminiDomHistoryProvider } from '@packages/core/src';
import type {
    AbortRequest,
    AnalyzeComparisonRequest,
    CheckAuthRequest,
    GenerateConversationTitleRequest,
    GetDocumentCapabilityRequest,
    GetAvailableModelsRequest,
    GetHistoryDetailRequest,
    GetHistoryListRequest,
    ProxyRequest,
    ProxyResponse,
    SendMessageRequest
} from '../src/utils/proxyProtocol';

type RuntimeDeps = {
    createModelProviderRuntime: typeof import('@packages/core/src/runtime/createModelProviderRuntime').createModelProviderRuntime;
    ComparisonAnalyzer: typeof import('@packages/core/src/workflows/compare/ComparisonAnalyzer').ComparisonAnalyzer;
    APP_CONFIG: typeof import('@packages/core/config').APP_CONFIG;
    createMockRuntime: typeof import('../src/testing/createMockRuntime').createMockRuntime;
};

let runtimeDepsPromise: Promise<RuntimeDeps> | null = null;
let geminiHistoryProvider: IExternalConversationProvider | null = null;

const loadRuntimeDeps = async (): Promise<RuntimeDeps> => {
    if (!runtimeDepsPromise) {
        runtimeDepsPromise = Promise.all([
            import('@packages/core/src/runtime/createModelProviderRuntime'),
            import('@packages/core/src/workflows/compare/ComparisonAnalyzer'),
            import('@packages/core/config'),
            import('../src/testing/createMockRuntime')
        ])
            .then(([runtimeModule, analysisModule, configModule, mockRuntimeModule]) => ({
                createModelProviderRuntime: runtimeModule.createModelProviderRuntime,
                ComparisonAnalyzer: analysisModule.ComparisonAnalyzer,
                APP_CONFIG: configModule.APP_CONFIG,
                createMockRuntime: mockRuntimeModule.createMockRuntime
            }))
            .catch((error) => {
                runtimeDepsPromise = null;
                throw error;
            });
    }
    return runtimeDepsPromise;
};

export default defineBackground(() => {
    try {
        if (chrome.action && chrome.action.onClicked) {
            chrome.action.onClicked.addListener(() => {
                const extensionUrl = chrome.runtime.getURL('index.html');
                if (chrome.tabs && chrome.tabs.create) {
                    chrome.tabs.create({ url: extensionUrl });
                }
            });
        } else {
            console.warn('chrome.action.onClicked is unavailable; full-window launch listener not registered');
        }
    } catch (error) {
        console.error('Failed to register chrome.action.onClicked listener', error);
    }

    if (!chrome.runtime || !chrome.runtime.onConnect) {
        console.error('chrome.runtime.onConnect is unavailable; background proxy listener not registered');
        return;
    }

    try {
        chrome.runtime.onConnect.addListener((port) => {
        if (port.name === 'ai-provider-proxy') {
            const activeRequests = new Map<string, { provider: IModelProvider; channelId: string }>();
            const ownedRequestIds = new Set<string>();
            let runtimePromise: Promise<ModelProviderRuntime> | null = null;
            let portDisconnected = false;

            const getRuntime = async (): Promise<ModelProviderRuntime> => {
                if (!runtimePromise) {
                    runtimePromise = loadRuntimeDeps().then(({ createMockRuntime, createModelProviderRuntime }) => (
                        import.meta.env.WXT_E2E === '1'
                            ? createMockRuntime()
                            : createModelProviderRuntime({ runtimeMode: 'extension' })
                    ));
                }
                return runtimePromise;
            };

            const postResponse = (message: ProxyResponse): boolean => {
                if (portDisconnected) {
                    return false;
                }

                try {
                    port.postMessage(message);
                    return true;
                } catch (error) {
                    portDisconnected = true;
                    console.error('Failed to post ai-provider-proxy response', {
                        type: message.type,
                        requestId: message.requestId,
                        channelId: message.channelId,
                        error
                    });
                    return false;
                }
            };

            const postError = (requestId: string, channelId: string, error: unknown) => {
                const historyError = error instanceof ExternalHistoryError ? error : null;
                const delivered = postResponse({
                    type: 'ERROR',
                    requestId,
                    channelId,
                    error: error instanceof Error ? error.message : String(error),
                    historyErrorCode: historyError?.code,
                    historyProviderId: historyError?.providerId
                });

                if (!delivered) {
                    console.error('Failed to deliver ai-provider-proxy error response', {
                        requestId,
                        channelId,
                        error
                    });
                }
            };

            const resolveProvider = async (providerId: string): Promise<IModelProvider> => {
                const runtime = await getRuntime();
                return runtime.getProvider(providerId, { fresh: true });
            };

            const resolveHistoryProvider = async (providerId: string): Promise<IExternalConversationProvider> => {
                if (providerId === 'gemini-web') {
                    if (!geminiHistoryProvider) {
                        geminiHistoryProvider = new GeminiDomHistoryProvider({
                            configLoader: new GeminiHistoryConfigLoader({
                                storage: {
                                    async get(key: string) {
                                        const result = await chrome.storage.local.get(key);
                                        const value = result[key];
                                        return typeof value === 'string' ? value : null;
                                    },
                                    async set(key: string, value: string) {
                                        await chrome.storage.local.set({ [key]: value });
                                    }
                                },
                                env: import.meta.env as Record<string, string | undefined>
                            }),
                            tabBridge: new GeminiHistoryTabBridge({
                                env: import.meta.env as Record<string, string | undefined>
                            })
                        });
                    }

                    return geminiHistoryProvider;
                }

                const provider = await resolveProvider(providerId);
                if (
                    typeof (provider as Partial<IExternalConversationProvider>).getHistoryList !== 'function' ||
                    typeof (provider as Partial<IExternalConversationProvider>).getHistoryDetail !== 'function'
                ) {
                    throw new Error(`Provider '${providerId}' does not support history queries`);
                }
                return provider as IExternalConversationProvider;
            };

            const trackActiveRequest = (requestId: string, channelId: string, provider: IModelProvider) => {
                activeRequests.set(requestId, { provider, channelId });
                ownedRequestIds.add(requestId);
            };

            const clearActiveRequest = (requestId: string) => {
                activeRequests.delete(requestId);
                ownedRequestIds.delete(requestId);
            };

            const handleCheckAuth = async (msg: CheckAuthRequest) => {
                try {
                    const provider = await resolveProvider(msg.providerId);
                    const isAuth = await provider.checkAuth();
                    postResponse({
                        type: 'AUTH_RESULT',
                        requestId: msg.requestId,
                        channelId: msg.channelId,
                        isAuth
                    });
                } catch (error) {
                    postError(msg.requestId, msg.channelId, error);
                }
            };

            const handleSendMessage = async (msg: SendMessageRequest) => {
                let provider: IModelProvider | null = null;
                try {
                    provider = await resolveProvider(msg.providerId);
                    trackActiveRequest(msg.requestId, msg.channelId, provider);

                    const result = await provider.sendMessage(msg.prompt, msg.options || {}, (chunk) => {
                        postResponse({
                            type: 'UPDATE',
                            requestId: msg.requestId,
                            channelId: msg.channelId,
                            chunk
                        });
                    });

                    postResponse({
                        type: 'DONE',
                        requestId: msg.requestId,
                        channelId: msg.channelId,
                        result
                    });
                } catch (error) {
                    postError(msg.requestId, msg.channelId, error);
                } finally {
                    clearActiveRequest(msg.requestId);
                }
            };

            const handleAnalyzeComparison = async (msg: AnalyzeComparisonRequest) => {
                try {
                    const runtime = await getRuntime();
                    const analyzerRuntime: ModelProviderRuntime = {
                        getAvailableProviders() {
                            return runtime.getAvailableProviders();
                        },
                        getProviderCatalog() {
                            return runtime.getProviderCatalog();
                        },
                        getProviderModels(providerId: string) {
                            return runtime.getProviderModels(providerId);
                        },
                        getProvider(providerId: string, options?: { fresh?: boolean }) {
                            const provider = runtime.getProvider(providerId, options);
                            trackActiveRequest(msg.requestId, msg.channelId, provider);
                            return provider;
                        }
                    };

                    const { APP_CONFIG, ComparisonAnalyzer } = await loadRuntimeDeps();
                    const analyzerProviderId = msg.analyzerProviderId || APP_CONFIG.analyzer.defaultProvider;
                    const analyzerModelId = msg.analyzerModelId || APP_CONFIG.analyzer.defaultModel;

                    const analyzer = new ComparisonAnalyzer(analyzerRuntime, {
                        ...APP_CONFIG.analyzer,
                        defaultProvider: analyzerProviderId,
                        defaultModel: analyzerModelId
                    });

                    const result = await analyzer.analyze(
                        msg.prompt,
                        msg.outputA,
                        msg.outputB,
                        (chunk) => {
                            postResponse({
                                type: 'UPDATE',
                                requestId: msg.requestId,
                                channelId: msg.channelId,
                                chunk
                            });
                        }
                    );

                    postResponse({
                        type: 'DONE',
                        requestId: msg.requestId,
                        channelId: msg.channelId,
                        result
                    });
                } catch (error) {
                    postError(msg.requestId, msg.channelId, error);
                } finally {
                    clearActiveRequest(msg.requestId);
                }
            };

            const handleGetAvailableModels = async (msg: GetAvailableModelsRequest) => {
                try {
                    const runtime = await getRuntime();
                    const result = await runtime.getProviderModels(msg.providerId);
                    postResponse({
                        type: 'DONE',
                        requestId: msg.requestId,
                        channelId: msg.channelId,
                        result
                    });
                } catch (error) {
                    postError(msg.requestId, msg.channelId, error);
                }
            };

            const handleGetDocumentCapability = async (msg: GetDocumentCapabilityRequest) => {
                try {
                    const provider = await resolveProvider(msg.providerId);
                    const result = await provider.getDocumentCapability?.() ?? null;
                    postResponse({
                        type: 'DONE',
                        requestId: msg.requestId,
                        channelId: msg.channelId,
                        result
                    });
                } catch (error) {
                    postError(msg.requestId, msg.channelId, error);
                }
            };

            const handleGenerateConversationTitle = async (msg: GenerateConversationTitleRequest) => {
                try {
                    const provider = await resolveProvider(msg.providerId);
                    if (typeof provider.generateConversationTitle !== 'function') {
                        throw new Error(`Provider '${msg.providerId}' does not support conversation title generation`);
                    }
                    const result = await provider.generateConversationTitle(msg.prompt, msg.options);
                    postResponse({
                        type: 'DONE',
                        requestId: msg.requestId,
                        channelId: msg.channelId,
                        result
                    });
                } catch (error) {
                    postError(msg.requestId, msg.channelId, error);
                }
            };

            const handleGetHistoryList = async (msg: GetHistoryListRequest) => {
                try {
                    const provider = await resolveHistoryProvider(msg.providerId);
                    const result = await provider.getHistoryList({ query: msg.query });
                    postResponse({
                        type: 'DONE',
                        requestId: msg.requestId,
                        channelId: msg.channelId,
                        result
                    });
                } catch (error) {
                    postError(msg.requestId, msg.channelId, error);
                }
            };

            const handleGetHistoryDetail = async (msg: GetHistoryDetailRequest) => {
                try {
                    const provider = await resolveHistoryProvider(msg.providerId);
                    const result = await provider.getHistoryDetail(msg.externalId);
                    postResponse({
                        type: 'DONE',
                        requestId: msg.requestId,
                        channelId: msg.channelId,
                        result
                    });
                } catch (error) {
                    postError(msg.requestId, msg.channelId, error);
                }
            };

            const handleAbort = (msg: AbortRequest) => {
                if (msg.targetRequestId) {
                    const active = activeRequests.get(msg.targetRequestId);
                    if (active && active.channelId === msg.channelId) {
                        active.provider.abort();
                        clearActiveRequest(msg.targetRequestId);
                    }
                    return;
                }

                for (const requestId of Array.from(ownedRequestIds)) {
                    const active = activeRequests.get(requestId);
                    if (!active) {
                        continue;
                    }
                    active.provider.abort();
                    clearActiveRequest(requestId);
                }
            };

            port.onMessage.addListener((msg: ProxyRequest) => {
                switch (msg.action) {
                    case 'CHECK_AUTH':
                        void handleCheckAuth(msg);
                        break;
                    case 'SEND_MESSAGE':
                        void handleSendMessage(msg);
                        break;
                    case 'GENERATE_CONVERSATION_TITLE':
                        void handleGenerateConversationTitle(msg);
                        break;
                    case 'ANALYZE_COMPARISON':
                        void handleAnalyzeComparison(msg);
                        break;
                    case 'GET_AVAILABLE_MODELS':
                        void handleGetAvailableModels(msg);
                        break;
                    case 'GET_DOCUMENT_CAPABILITY':
                        void handleGetDocumentCapability(msg);
                        break;
                    case 'GET_HISTORY_LIST':
                        void handleGetHistoryList(msg);
                        break;
                    case 'GET_HISTORY_DETAIL':
                        void handleGetHistoryDetail(msg);
                        break;
                    case 'ABORT':
                        handleAbort(msg);
                        break;
                    default:
                        postError(msg.requestId, msg.channelId, `Unknown action: ${(msg as { action?: string }).action}`);
                        break;
                }
            });

            port.onDisconnect.addListener(() => {
                portDisconnected = true;
                for (const requestId of Array.from(ownedRequestIds)) {
                    const active = activeRequests.get(requestId);
                    if (!active) {
                        continue;
                    }
                    active.provider.abort();
                    clearActiveRequest(requestId);
                }
            });
        }
    });
    } catch (error) {
        console.error('Failed to register chrome.runtime.onConnect listener', error);
    }
});
