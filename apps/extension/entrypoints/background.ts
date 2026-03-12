/// <reference types="chrome"/>
import type { IHistoryProvider, IModelProvider, ProviderRuntime } from '@packages/core/src';
import { GeminiHistoryConfigLoader } from '../src/history/GeminiHistoryConfigLoader';
import { GeminiHistoryTabBridge } from '../src/history/GeminiHistoryTabBridge';
import { GeminiDomHistoryProvider } from '../src/history/GeminiDomHistoryProvider';
import type {
    AbortRequest,
    AnalyzeComparisonRequest,
    CheckAuthRequest,
    GetAvailableModelsRequest,
    GetHistoryDetailRequest,
    GetHistoryListRequest,
    ProxyRequest,
    ProxyResponse,
    SendMessageRequest
} from '../src/utils/proxyProtocol';

type RuntimeDeps = {
    createProviderRuntime: typeof import('@packages/core/src/runtime/createProviderRuntime').createProviderRuntime;
    ComparisonAnalyzer: typeof import('@packages/core/src/analysis/ComparisonAnalyzer').ComparisonAnalyzer;
    APP_CONFIG: typeof import('@packages/core/config').APP_CONFIG;
    createMockRuntime: typeof import('../src/testing/createMockRuntime').createMockRuntime;
};

let runtimeDepsPromise: Promise<RuntimeDeps> | null = null;
let geminiHistoryProvider: IHistoryProvider | null = null;

const loadRuntimeDeps = async (): Promise<RuntimeDeps> => {
    if (!runtimeDepsPromise) {
        runtimeDepsPromise = Promise.all([
            import('@packages/core/src/runtime/createProviderRuntime'),
            import('@packages/core/src/analysis/ComparisonAnalyzer'),
            import('@packages/core/config'),
            import('../src/testing/createMockRuntime')
        ])
            .then(([runtimeModule, analysisModule, configModule, mockRuntimeModule]) => ({
                createProviderRuntime: runtimeModule.createProviderRuntime,
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
            let runtimePromise: Promise<ProviderRuntime> | null = null;

            const getRuntime = async (): Promise<ProviderRuntime> => {
                if (!runtimePromise) {
                    runtimePromise = loadRuntimeDeps().then(({ createMockRuntime, createProviderRuntime }) => (
                        import.meta.env.WXT_E2E === '1'
                            ? createMockRuntime()
                            : createProviderRuntime({ runtimeMode: 'extension' })
                    ));
                }
                return runtimePromise;
            };

            const postResponse = (message: ProxyResponse) => {
                port.postMessage(message);
            };

            const postError = (requestId: string, channelId: string, error: unknown) => {
                postResponse({
                    type: 'ERROR',
                    requestId,
                    channelId,
                    error: error instanceof Error ? error.message : String(error)
                });
            };

            const resolveProvider = async (providerId: string): Promise<IModelProvider> => {
                const runtime = await getRuntime();
                return runtime.getProvider(providerId, { fresh: true });
            };

            const resolveHistoryProvider = async (providerId: string): Promise<IHistoryProvider> => {
                if (providerId === 'gemini-web') {
                    if (!geminiHistoryProvider) {
                        geminiHistoryProvider = new GeminiDomHistoryProvider({
                            configLoader: new GeminiHistoryConfigLoader({
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
                    typeof (provider as Partial<IHistoryProvider>).getHistoryList !== 'function' ||
                    typeof (provider as Partial<IHistoryProvider>).getHistoryDetail !== 'function'
                ) {
                    throw new Error(`Provider '${providerId}' does not support history queries`);
                }
                return provider as IHistoryProvider;
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
                    const analyzerRuntime: ProviderRuntime = {
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

            const handleGetHistoryList = async (msg: GetHistoryListRequest) => {
                try {
                    const provider = await resolveHistoryProvider(msg.providerId);
                    const result = await provider.getHistoryList();
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
                    case 'ANALYZE_COMPARISON':
                        void handleAnalyzeComparison(msg);
                        break;
                    case 'GET_AVAILABLE_MODELS':
                        void handleGetAvailableModels(msg);
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
