/// <reference types="chrome"/>
import type { IModelProvider, ProviderRuntime } from '@packages/core/src';
import type {
    AbortRequest,
    AnalyzeComparisonRequest,
    CheckAuthRequest,
    ProxyRequest,
    ProxyResponse,
    SendMessageRequest
} from '../src/utils/proxyProtocol';

type RuntimeDeps = {
    createProviderRuntime: typeof import('@packages/core/src/runtime/createProviderRuntime').createProviderRuntime;
    ComparisonAnalyzer: typeof import('@packages/core/src/analysis/ComparisonAnalyzer').ComparisonAnalyzer;
    APP_CONFIG: typeof import('@packages/core/config').APP_CONFIG;
};

let runtimeDepsPromise: Promise<RuntimeDeps> | null = null;

const loadRuntimeDeps = async (): Promise<RuntimeDeps> => {
    if (!runtimeDepsPromise) {
        runtimeDepsPromise = Promise.all([
            import('@packages/core/src/runtime/createProviderRuntime'),
            import('@packages/core/src/analysis/ComparisonAnalyzer'),
            import('@packages/core/config')
        ])
            .then(([runtimeModule, analysisModule, configModule]) => ({
                createProviderRuntime: runtimeModule.createProviderRuntime,
                ComparisonAnalyzer: analysisModule.ComparisonAnalyzer,
                APP_CONFIG: configModule.APP_CONFIG
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
                    runtimePromise = loadRuntimeDeps().then(({ createProviderRuntime }) =>
                        createProviderRuntime({ runtimeMode: 'extension' })
                    );
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
