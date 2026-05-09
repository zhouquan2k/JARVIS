import {
    APP_CONFIG,
    ComparisonAnalyzer,
    createModelProviderRuntime,
    ExternalHistoryError,
    type ChatGPTWebProviderOptions,
    type IAgentCapableProvider,
    type IExternalConversationProvider,
    type IModelProvider,
    type ModelProviderRuntime
} from '@packages/core/src';
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
    RunAgentRequest,
    SendMessageRequest
} from '../shared/proxyProtocol';

export interface CreateDesktopHostRuntimeOptions {
    geminiApiKey?: string;
    resolveChatGPTProviderOptions?: () => ChatGPTWebProviderOptions | undefined;
}

export function createDesktopHostRuntime(options: CreateDesktopHostRuntimeOptions = {}): ModelProviderRuntime {
    return createModelProviderRuntime({
        runtimeMode: 'desktop',
        credentials: {
            geminiApiKey: options.geminiApiKey
        },
        providerOptionsResolver(providerId) {
            if (providerId === 'chatgpt-web') {
                return options.resolveChatGPTProviderOptions?.();
            }

            return undefined;
        }
    });
}

type ResponseSender = (response: ProxyResponse) => void;

export interface ProviderHostOptions {
    runtime?: ModelProviderRuntime;
    createRuntime?: () => ModelProviderRuntime;
    resolveHistoryProvider?: (providerId: string) => Promise<IExternalConversationProvider | undefined>;
}

export interface ProviderHost {
    handleRequest(message: ProxyRequest, sendResponse: ResponseSender): Promise<void>;
    handleDisconnect(channelId: string): void;
}

export function createProviderHost(options: ProviderHostOptions = {}): ProviderHost {
    const activeRequests = new Map<string, { provider: IModelProvider; channelId: string }>();
    const requestIdsByChannel = new Map<string, Set<string>>();
    let runtimePromise: Promise<ModelProviderRuntime> | null = null;

    const getRuntime = async () => {
        if (options.runtime) {
            return options.runtime;
        }

        if (!runtimePromise) {
            runtimePromise = Promise.resolve(options.createRuntime ? options.createRuntime() : createDesktopHostRuntime());
        }

        return runtimePromise;
    };

    const trackActiveRequest = (requestId: string, channelId: string, provider: IModelProvider) => {
        activeRequests.set(requestId, { provider, channelId });
        const currentSet = requestIdsByChannel.get(channelId) ?? new Set<string>();
        currentSet.add(requestId);
        requestIdsByChannel.set(channelId, currentSet);
    };

    const clearActiveRequest = (requestId: string) => {
        const active = activeRequests.get(requestId);
        if (!active) {
            return;
        }

        activeRequests.delete(requestId);
        const currentSet = requestIdsByChannel.get(active.channelId);
        if (!currentSet) {
            return;
        }

        currentSet.delete(requestId);
        if (currentSet.size === 0) {
            requestIdsByChannel.delete(active.channelId);
        }
    };

    const postError = (requestId: string, channelId: string, error: unknown, sendResponse: ResponseSender) => {
        const historyError = error instanceof ExternalHistoryError ? error : null;
        sendResponse({
            type: 'ERROR',
            requestId,
            channelId,
            error: error instanceof Error ? error.message : String(error),
            historyErrorCode: historyError?.code,
            historyProviderId: historyError?.providerId
        });
    };

    const resolveProvider = async (providerId: string): Promise<IModelProvider> => {
        const runtime = await getRuntime();
        return runtime.getProvider(providerId, { fresh: true });
    };

    const resolveHistoryProvider = async (providerId: string): Promise<IExternalConversationProvider> => {
        const injected = await options.resolveHistoryProvider?.(providerId);
        if (injected) {
            return injected;
        }

        const provider = await resolveProvider(providerId);
        if (
            typeof (provider as Partial<IExternalConversationProvider>).getHistoryList !== 'function'
            || typeof (provider as Partial<IExternalConversationProvider>).getHistoryDetail !== 'function'
        ) {
            throw new Error(`Provider '${providerId}' does not support history queries`);
        }

        return provider as IExternalConversationProvider;
    };

    const abortRequest = (requestId: string) => {
        const active = activeRequests.get(requestId);
        if (!active) {
            return;
        }

        active.provider.abort();
        clearActiveRequest(requestId);
    };

    const handleCheckAuth = async (msg: CheckAuthRequest, sendResponse: ResponseSender) => {
        try {
            const provider = await resolveProvider(msg.providerId);
            const isAuth = await provider.checkAuth();
            sendResponse({
                type: 'AUTH_RESULT',
                requestId: msg.requestId,
                channelId: msg.channelId,
                isAuth
            });
        } catch (error) {
            postError(msg.requestId, msg.channelId, error, sendResponse);
        }
    };

    const handleSendMessage = async (msg: SendMessageRequest, sendResponse: ResponseSender) => {
        try {
            const provider = await resolveProvider(msg.providerId);
            trackActiveRequest(msg.requestId, msg.channelId, provider);

            const attachmentCount = msg.options?.attachments?.length ?? 0;
            const historyAttachmentCount = msg.options?.history?.reduce((n, m) => n + (m.attachments?.length ?? 0), 0) ?? 0;
            if (attachmentCount > 0 || historyAttachmentCount > 0) {
                console.log(`[providerHost] sendMessage attachments=${attachmentCount} historyAttachments=${historyAttachmentCount} provider=${msg.providerId}`);
                for (const att of msg.options?.attachments ?? []) {
                    console.log(`  attachment: name=${att.name} mimeType=${att.mimeType} size=${att.size} hasBase64=${!!att.base64Data}`);
                }
            }

            const result = await provider.sendMessage(msg.prompt, msg.options || {}, (chunk) => {
                sendResponse({
                    type: 'UPDATE',
                    requestId: msg.requestId,
                    channelId: msg.channelId,
                    chunk
                });
            });

            sendResponse({
                type: 'DONE',
                requestId: msg.requestId,
                channelId: msg.channelId,
                result
            });
        } catch (error) {
            postError(msg.requestId, msg.channelId, error, sendResponse);
        } finally {
            clearActiveRequest(msg.requestId);
        }
    };

    const handleAnalyzeComparison = async (msg: AnalyzeComparisonRequest, sendResponse: ResponseSender) => {
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
                getProvider(providerId: string, getProviderOptions?: { fresh?: boolean }) {
                    const provider = runtime.getProvider(providerId, getProviderOptions);
                    trackActiveRequest(msg.requestId, msg.channelId, provider);
                    return provider;
                }
            };

            const analyzer = new ComparisonAnalyzer(analyzerRuntime, {
                ...APP_CONFIG.analyzer,
                defaultProvider: msg.analyzerProviderId || APP_CONFIG.analyzer.defaultProvider,
                defaultModel: msg.analyzerModelId || APP_CONFIG.analyzer.defaultModel
            });

            const result = await analyzer.analyze(
                msg.prompt,
                msg.outputA,
                msg.outputB,
                (chunk) => {
                    sendResponse({
                        type: 'UPDATE',
                        requestId: msg.requestId,
                        channelId: msg.channelId,
                        chunk
                    });
                }
            );

            sendResponse({
                type: 'DONE',
                requestId: msg.requestId,
                channelId: msg.channelId,
                result
            });
        } catch (error) {
            postError(msg.requestId, msg.channelId, error, sendResponse);
        } finally {
            clearActiveRequest(msg.requestId);
        }
    };

    const handleGetAvailableModels = async (msg: GetAvailableModelsRequest, sendResponse: ResponseSender) => {
        try {
            const runtime = await getRuntime();
            const result = await runtime.getProviderModels(msg.providerId);
            sendResponse({
                type: 'DONE',
                requestId: msg.requestId,
                channelId: msg.channelId,
                result
            });
        } catch (error) {
            postError(msg.requestId, msg.channelId, error, sendResponse);
        }
    };

    const handleGetDocumentCapability = async (msg: GetDocumentCapabilityRequest, sendResponse: ResponseSender) => {
        try {
            const provider = await resolveProvider(msg.providerId);
            const result = await provider.getDocumentCapability?.() ?? null;
            sendResponse({
                type: 'DONE',
                requestId: msg.requestId,
                channelId: msg.channelId,
                result
            });
        } catch (error) {
            postError(msg.requestId, msg.channelId, error, sendResponse);
        }
    };

    const handleGenerateConversationTitle = async (msg: GenerateConversationTitleRequest, sendResponse: ResponseSender) => {
        try {
            const provider = await resolveProvider(msg.providerId);
            if (typeof provider.generateConversationTitle !== 'function') {
                throw new Error(`Provider '${msg.providerId}' does not support conversation title generation`);
            }
            const result = await provider.generateConversationTitle(msg.prompt, msg.options);
            sendResponse({
                type: 'DONE',
                requestId: msg.requestId,
                channelId: msg.channelId,
                result
            });
        } catch (error) {
            postError(msg.requestId, msg.channelId, error, sendResponse);
        }
    };

    const handleRunAgent = async (msg: RunAgentRequest, sendResponse: ResponseSender) => {
        try {
            const provider = await resolveProvider(msg.providerId);

            const agentCapableProvider = typeof (provider as Partial<IAgentCapableProvider>).runAgent === 'function'
                ? provider as IAgentCapableProvider
                : null;

            if (!agentCapableProvider) {
                throw new Error(`Provider '${msg.providerId}' does not support agent execution`);
            }

            trackActiveRequest(msg.requestId, msg.channelId, provider);

            const attachmentCount = msg.agentRequest.attachments?.length ?? 0;
            if (attachmentCount > 0 || (msg.agentRequest.tools?.length ?? 0) > 0) {
                console.log(`[providerHost] runAgent tools=${msg.agentRequest.tools?.length ?? 0} attachments=${attachmentCount} provider=${msg.providerId}`);
            }

            const result = await agentCapableProvider.runAgent(msg.agentRequest, (chunk) => {
                sendResponse({
                    type: 'UPDATE',
                    requestId: msg.requestId,
                    channelId: msg.channelId,
                    chunk
                });
            });

            sendResponse({
                type: 'DONE',
                requestId: msg.requestId,
                channelId: msg.channelId,
                result
            });
        } catch (error) {
            postError(msg.requestId, msg.channelId, error, sendResponse);
        } finally {
            clearActiveRequest(msg.requestId);
        }
    };

    const handleGetHistoryList = async (msg: GetHistoryListRequest, sendResponse: ResponseSender) => {
        try {
            const provider = await resolveHistoryProvider(msg.providerId);
            const result = await provider.getHistoryList({ query: msg.query });
            sendResponse({
                type: 'DONE',
                requestId: msg.requestId,
                channelId: msg.channelId,
                result
            });
        } catch (error) {
            postError(msg.requestId, msg.channelId, error, sendResponse);
        }
    };

    const handleGetHistoryDetail = async (msg: GetHistoryDetailRequest, sendResponse: ResponseSender) => {
        try {
            const provider = await resolveHistoryProvider(msg.providerId);
            const result = await provider.getHistoryDetail(msg.externalId);
            sendResponse({
                type: 'DONE',
                requestId: msg.requestId,
                channelId: msg.channelId,
                result
            });
        } catch (error) {
            postError(msg.requestId, msg.channelId, error, sendResponse);
        }
    };

    const handleAbort = (msg: AbortRequest) => {
        if (msg.targetRequestId) {
            abortRequest(msg.targetRequestId);
            return;
        }

        for (const requestId of Array.from(requestIdsByChannel.get(msg.channelId) ?? [])) {
            abortRequest(requestId);
        }
    };

    return {
        async handleRequest(message: ProxyRequest, sendResponse: ResponseSender) {
            switch (message.action) {
                case 'CHECK_AUTH':
                    await handleCheckAuth(message, sendResponse);
                    break;
                case 'SEND_MESSAGE':
                    await handleSendMessage(message, sendResponse);
                    break;
                case 'GENERATE_CONVERSATION_TITLE':
                    await handleGenerateConversationTitle(message, sendResponse);
                    break;
                case 'RUN_AGENT':
                    await handleRunAgent(message, sendResponse);
                    break;
                case 'ANALYZE_COMPARISON':
                    await handleAnalyzeComparison(message, sendResponse);
                    break;
                case 'GET_AVAILABLE_MODELS':
                    await handleGetAvailableModels(message, sendResponse);
                    break;
                case 'GET_DOCUMENT_CAPABILITY':
                    await handleGetDocumentCapability(message, sendResponse);
                    break;
                case 'GET_HISTORY_LIST':
                    await handleGetHistoryList(message, sendResponse);
                    break;
                case 'GET_HISTORY_DETAIL':
                    await handleGetHistoryDetail(message, sendResponse);
                    break;
                case 'ABORT':
                    handleAbort(message);
                    break;
                default: {
                    const unknownMsg = message as { requestId?: string; channelId?: string; action?: string };
                    postError(unknownMsg.requestId ?? '', unknownMsg.channelId ?? '', `Unknown action: ${unknownMsg.action}`, sendResponse);
                    break;
                }
            }
        },

        handleDisconnect(channelId: string) {
            for (const requestId of Array.from(requestIdsByChannel.get(channelId) ?? [])) {
                abortRequest(requestId);
            }
        }
    };
}
