import type {
    BrowserAutomationCapability,
    ControlledPageCapability,
    IHostContext,
    PluginManifest,
    ProviderLoginCapability
} from '@plugins/ai-agent/src/internal';
import type { WorkspaceRuntimeContext } from '@plugins/ai-agent/src/internal';
import {
    DEFAULT_GEMINI_HISTORY_PAGE_URL,
    ExternalHistoryError,
    resolveSyncBaseUrl,
    resolveSyncKey,
    type HistoryListQueryOptions,
    type ExternalHistoryProviderEntry,
    type ExternalHistoryProviderId,
    type IExternalConversationProvider,
    type ModelProviderRuntime
} from '@plugins/ai-agent/src/internal';
import { resolveLightweightModelSelection } from '@packages/core/config';
import { createModelProviderRuntime } from '../createModelProviderRuntime';
import { createChatGPTBrowserAutomationOptions } from '../../providers/model/createChatGPTBrowserAutomationOptions';
import { FetchSyncTransport } from '../../providers/sync/FetchSyncTransport';
import { IndexedDBStorageProvider } from '../../providers/storage/IndexedDBStorageProvider';
import { SyncStorageProvider } from '../../providers/storage/SyncStorageProvider';
import { GeminiDomHistoryProvider } from '../../providers/history/gemini/GeminiDomHistoryProvider';
import { GeminiHistoryConfigLoader } from '../../providers/history/gemini/GeminiHistoryConfigLoader';
import type { GeminiHistoryBridge } from '../../providers/history/gemini/GeminiHistoryBridge';
import {
    assertGeminiContentResponse,
    type GeminiContentConversationDetail,
    type GeminiContentHistorySummary,
    type GeminiContentRequest
} from '../../providers/history/gemini/geminiContentProtocol';
import { createMockSyncTransport } from '../../testing/createMockSyncTransport';
import { createMockRuntime as createBuiltinMockRuntime } from '../../testing/createMockRuntime';
import { createMockHistoryProvider as createBuiltinMockHistoryProvider } from '../../testing/createMockHistoryProvider';
import { toConversationQueryProvider } from '../../providers/context/HttpConversationQueryProvider';
import { openConversationImportDialog } from '@packages/ui';
import AgentConversationPanel from '../../components/AgentConversationPanel.vue';
import WorkspaceAgentConfigPanel from '../../components/WorkspaceAgentConfigPanel.vue';
import { useCompareStore } from '../../store/compare';
import { useChatStore } from '../../store/chat';
import ConversationWorkspaceView from '../../views/ConversationWorkspaceView.vue';
import { createAgentRuntime } from '../agents/runtime/createAgentRuntime';
import { initializeAiAgentHostBridge } from './hostBridge';
import { registerAiAgentWorkspaceRuntimeBridge } from '../../store/workspaceBridge';

type RuntimeMode = 'web' | 'desktop' | 'extension';
type AppEnv = Record<string, string | undefined>;
type HostHistoryProviderId = Exclude<ExternalHistoryProviderId, 'external-file'>;

export interface AiAgentPluginOptions {
    runtimeMode: RuntimeMode;
    env?: AppEnv;
    isDevelopment?: boolean;
    storage?: Pick<Storage, 'getItem' | 'setItem'>;
    fetchImpl?: typeof fetch;
    codexBaseUrl?: string;
    useMockRuntime?: boolean;
    useMockSync?: boolean;
    useMockHistoryProviders?: boolean;
    mockSyncKeyFallback?: string;
}

class ControlledPageGeminiHistoryBridge implements GeminiHistoryBridge {
    constructor(
        private readonly controlledPage: ControlledPageCapability,
        private readonly pageUrl = DEFAULT_GEMINI_HISTORY_PAGE_URL
    ) {}

    async getHistoryList(
        config: Parameters<GeminiHistoryBridge['getHistoryList']>[0],
        options: HistoryListQueryOptions = {}
    ) {
        const response = await this.sendRequest({
            action: 'GET_HISTORY_LIST',
            config,
            query: options.query
        }, undefined, true);
        return assertGeminiContentResponse<GeminiContentHistorySummary[]>(response as any);
    }

    async getHistoryDetail(config: Parameters<GeminiHistoryBridge['getHistoryDetail']>[0], externalId: string) {
        const response = await this.sendRequest({
            action: 'GET_HISTORY_DETAIL',
            config,
            externalId
        }, externalId, false);
        return assertGeminiContentResponse<GeminiContentConversationDetail>(response as any);
    }

    private async sendRequest(
        request: GeminiContentRequest,
        externalId?: string,
        forceReload = false
    ): Promise<unknown> {
        const targetUrl = externalId ? `${this.pageUrl.replace(/\/$/, '')}/${externalId}` : this.pageUrl;
        const requestJson = JSON.stringify(request);
        return this.controlledPage.evaluateInPage({
            providerId: 'gemini-web',
            targetUrl,
            visible: false,
            forceReload,
            script: `
                (() => {
                    const bridge = window.chatprismGeminiHistory;
                    if (!bridge || typeof bridge.request !== 'function') {
                        throw new Error('Gemini history preload bridge is unavailable');
                    }

                    return bridge.request(${requestJson});
                })()
            `
        });
    }
}

function resolveGeminiApiKey(env: AppEnv): string | undefined {
    return env.WXT_GEMINI_API_KEY
        || env.VITE_LLM_API_KEY
        || env.VITE_GEMINI_API_KEY
        || env.CHATPRISM_LLM_API_KEY;
}

function createHistoryProviders(
    hostContext: IHostContext,
    runtime: ModelProviderRuntime,
    options: AiAgentPluginOptions
): ExternalHistoryProviderEntry[] {
    const createProvider = (providerId: HostHistoryProviderId): IExternalConversationProvider | null => {
        if (options.useMockHistoryProviders) {
            return createBuiltinMockHistoryProvider(providerId);
        }

        if (providerId === 'gemini-web') {
            const controlledPage = hostContext.getCapability<ControlledPageCapability>('controlled-page');
            const storage = hostContext.getCapability<Pick<Storage, 'getItem' | 'setItem'>>('storage');
            if (controlledPage && storage) {
                return new GeminiDomHistoryProvider({
                    configLoader: new GeminiHistoryConfigLoader({
                        storage: {
                            async get(key: string) {
                                return storage.getItem(key);
                            },
                            async set(key: string, value: string) {
                                storage.setItem(key, value);
                            }
                        },
                        env: options.env ?? {}
                    }),
                    tabBridge: new ControlledPageGeminiHistoryBridge(controlledPage)
                });
            }
        }

        let provider: Partial<IExternalConversationProvider>;
        try {
            provider = runtime.getProvider(providerId, { fresh: true }) as Partial<IExternalConversationProvider>;
        } catch {
            // Provider is not available in the current runtime mode
            return null;
        }

        if (typeof provider.getHistoryList !== 'function' || typeof provider.getHistoryDetail !== 'function') {
            return null;
        }

        return provider as IExternalConversationProvider;
    };

    const entries: ExternalHistoryProviderEntry[] = [];

    const chatgptProvider = createProvider('chatgpt-web');
    if (chatgptProvider) {
        entries.push({
            id: 'chatgpt-web',
            label: 'ChatGPT',
            kind: 'history-provider',
            features: {
                historySearch: true,
                historySearchPlaceholder: '搜索 ChatGPT 历史'
            },
            provider: chatgptProvider
        });
    }

    const geminiProvider = createProvider('gemini-web');
    if (geminiProvider) {
        entries.push({
            id: 'gemini-web',
            label: 'Gemini',
            kind: 'history-provider',
            features: {
                historySearch: true,
                historySearchPlaceholder: '搜索 Gemini 历史'
            },
            provider: geminiProvider
        });
    }

    entries.push({
        id: 'external-file',
        label: '外部文件导入',
        kind: 'file-import'
    });

    return entries;
}

function createConversationStorageProvider(
    hostContext: IHostContext,
    options: AiAgentPluginOptions
): SyncStorageProvider {
    const env = options.env ?? {};
    const storage = hostContext.getCapability<Pick<Storage, 'getItem' | 'setItem'>>('storage')
        ?? options.storage
        ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const syncEnv = options.useMockSync && options.mockSyncKeyFallback && !env.VITE_SYNC_KEY && !env.CHATPRISM_SYNC_KEY
        ? {
            ...env,
            VITE_SYNC_KEY: options.mockSyncKeyFallback
        }
        : env;
    const syncKey = resolveSyncKey({
        storage,
        env: syncEnv,
        isDevelopment: options.isDevelopment
    });

    return new SyncStorageProvider({
        localStore: new IndexedDBStorageProvider(),
        transport: options.useMockSync
            ? createMockSyncTransport(syncKey, { storage })
            : new FetchSyncTransport({
                syncKey,
                baseUrl: resolveSyncBaseUrl({ env: syncEnv }),
                fetchImpl: options.fetchImpl
            }),
        syncKey
    });
}

function createRuntime(hostContext: IHostContext, options: AiAgentPluginOptions): ModelProviderRuntime {
    if (options.useMockRuntime) {
        return createBuiltinMockRuntime({
            runtimeMode: options.runtimeMode,
            defaultCharDelayMs: 2,
            slowCharDelayMs: 2
        });
    }

    const browserAutomation = hostContext.getCapability<BrowserAutomationCapability>('browser-automation');
    const controlledPage = hostContext.getCapability<ControlledPageCapability>('controlled-page');
    const lightweightModel = resolveLightweightModelSelection(options.runtimeMode);

    const env = options.env ?? {};
    const domProviderUrls: Partial<Record<'chatgpt-dom' | 'gemini-dom', string>> = {};
    if (env.CHATPRISM_DOM_CHATGPT_URL) domProviderUrls['chatgpt-dom'] = env.CHATPRISM_DOM_CHATGPT_URL;
    if (env.CHATPRISM_DOM_GEMINI_URL) domProviderUrls['gemini-dom'] = env.CHATPRISM_DOM_GEMINI_URL;

    return createModelProviderRuntime({
        runtimeMode: options.runtimeMode,
        credentials: {
            geminiApiKey: resolveGeminiApiKey(env)
        },
        controlledPageCapability: controlledPage ?? undefined,
        domProviderUrls: Object.keys(domProviderUrls).length > 0 ? domProviderUrls : undefined,
        providerOptionsResolver(providerId) {
            if (providerId === 'chatgpt-web' && browserAutomation) {
                return {
                    ...createChatGPTBrowserAutomationOptions(browserAutomation, providerId),
                    lightweightModel
                };
            }

            if (providerId !== 'chatgpt-codex' || !options.codexBaseUrl) {
                return providerId === lightweightModel.providerId ? { lightweightModel } : undefined;
            }

            return {
                baseUrl: options.codexBaseUrl,
                lightweightModel
            };
        }
    });
}

function buildConversationLinkMarkdown(title: string, conversationId: string): string {
    return `[${title}](chatprism://conversation/${encodeURIComponent(conversationId)})`;
}

function resolveSavedConversationIdForSelection(input: {
    selectedNodePath?: string | null;
    activeDocumentPath?: string | null;
}): string | null {
    const chatStore = useChatStore();
    const savedStatus = chatStore.restoreAgentViewStatus();
    if (!savedStatus?.activeConversationId) {
        return null;
    }

    const matchesSavedSelection = savedStatus.activePath
        ? input.activeDocumentPath === savedStatus.activePath
        : (input.selectedNodePath ?? null) === savedStatus.selectedNodePath;

    return matchesSavedSelection ? savedStatus.activeConversationId : null;
}

async function initializeAiAgentPlugin(hostContext: IHostContext, options: AiAgentPluginOptions): Promise<ModelProviderRuntime | null> {
    const chatStore = useChatStore();
    const compareStore = useCompareStore();
    const runtime = createRuntime(hostContext, options);
    const providerCatalog = runtime.getProviderCatalog();

    await compareStore.setRuntime(runtime);

    if (providerCatalog.length === 0) {
        chatStore.setProviderCatalog([]);
        return runtime;
    }

    let storageProvider: SyncStorageProvider | null = null;
    let initializationError: string | null = null;
    try {
        storageProvider = createConversationStorageProvider(hostContext, options);
    } catch (error) {
        initializationError = error instanceof Error ? error.message : String(error);
    }

    if (!storageProvider) {
        chatStore.setProviderCatalog([]);
        chatStore.setHistoryProviders([]);
        chatStore.currentError = initializationError || 'AI Agent plugin failed to initialize.';
        return runtime;
    }

    const historyProviders = createHistoryProviders(hostContext, runtime, options);
    const agentRuntime = createAgentRuntime({
        modelProviderRuntime: runtime
    });

    chatStore.setAgentRuntime(agentRuntime);
    chatStore.setRuntimeMode(options.runtimeMode);
    chatStore.setModelProviderResolver((providerId: string) => runtime.getProvider(providerId));
    chatStore.setProviderModelsResolver((providerId: string) => runtime.getProviderModels(providerId));
    chatStore.setControlledPageCapability(hostContext.getCapability<ControlledPageCapability>('controlled-page'));
    chatStore.setProviders(
        runtime.getProvider(providerCatalog[0].id),
        storageProvider
    );
    chatStore.setHistoryProviders(historyProviders);
    chatStore.setExternalFileImportHandler(async () => {
        return openConversationImportDialog();
    });

    await storageProvider.hydrate().catch((error) => {
        console.warn(`${options.runtimeMode} sync hydration failed, continuing with local data only.`, error);
    });
    await chatStore.initializeProviderCatalog(providerCatalog);
    await chatStore.init();
    if (options.runtimeMode === 'extension') {
        const { initializeExtensionComparePersistence } = await import('./extensionComparePersistence');
        await initializeExtensionComparePersistence(storageProvider);
    }

    return runtime;
}

function initializeAiAgentRuntimeBridge(
    runtimeContext: WorkspaceRuntimeContext,
    hostContext: IHostContext,
    options: AiAgentPluginOptions
): void {
    registerAiAgentWorkspaceRuntimeBridge(runtimeContext);
    initializeAiAgentHostBridge({
        runtimeMode: options.runtimeMode,
        codexBaseUrl: options.codexBaseUrl,
        providerLoginCapability: hostContext.getCapability<ProviderLoginCapability>('provider-login') ?? undefined
    }, runtimeContext);
}

export function createAiAgentPlugin(options: AiAgentPluginOptions): PluginManifest {
    let initializationPromise: Promise<ModelProviderRuntime | null> | null = null;

    return {
        id: 'ai-agent',
        name: 'AI Agent',
        version: '1.0.0',
        defaultEnabled: true,
        async setup(api) {
            const hostContext = api.getHostContext();
            if (!initializationPromise) {
                initializationPromise = initializeAiAgentPlugin(hostContext, options).catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    const chatStore = useChatStore();
                    const compareStore = useCompareStore();
                    chatStore.currentError = message;
                    compareStore.analysisError = message;
                    throw error;
                });
            }

            await initializationPromise;
            initializeAiAgentRuntimeBridge(api.getRuntimeContext(), hostContext, options);
            const chatStore = useChatStore();
            api.registerLanguageModel({
                id: 'ai-agent-default-language-model',
                async generateText(prompt, generateOptions = {}) {
                    if (generateOptions.signal?.aborted) {
                        throw new Error('Language model request was aborted.');
                    }

                    const { provider, modelId, modelOptions, reasoningEffort } = await chatStore.resolveSendTarget();
                    const abortHandler = () => provider.abort();
                    generateOptions.signal?.addEventListener('abort', abortHandler, { once: true });
                    try {
                        const fullPrompt = generateOptions.system?.trim()
                            ? `System:\n${generateOptions.system.trim()}\n\nUser:\n${prompt}`
                            : prompt;
                        const result = await provider.sendMessage(fullPrompt, {
                            modelId,
                            modelOptions,
                            reasoningEffort
                        }, () => undefined);
                        return result.text;
                    } finally {
                        generateOptions.signal?.removeEventListener('abort', abortHandler);
                    }
                }
            });
            api.registerGlobalView({
                id: 'chat',
                routePath: '/chat',
                routeName: 'normal-chat',
                label: 'Chat',
                labelKey: 'routes.normalChat',
                workspaceMode: 'conversation',
                component: ConversationWorkspaceView,
                order: 20
            });
            api.registerRightPanelTab({
                id: 'conversations',
                title: 'Conversations',
                titleKey: 'shared.conversationTab',
                component: AgentConversationPanel,
                order: 20,
                async getBadgeCount(input) {
                    const documentPath = input.activeDocument?.path?.trim() || '';
                    const activeAgentKey = input.activeScopeKey?.trim() || '';
                    const contextProvider = input.contextProvider;
                    const documentId = input.activeDocument?.documentId;
                    if (documentPath && contextProvider) {
                        try {
                            const conversations = await toConversationQueryProvider(contextProvider, options.env).getConversations({ documentPath, documentId });
                            return conversations.filter(
                                (conversation) => !conversation.compare
                                    && !conversation.sync?.deleted
                                    && (!activeAgentKey || conversation.agentKey === activeAgentKey)
                            ).length;
                        } catch {
                            return 0;
                        }
                    }

                    if (activeAgentKey && input.showAgentConversationList) {
                        return chatStore.getConversationsByAgent(activeAgentKey).length;
                    }

                    return 0;
                },
                shouldAutoActivate(input) {
                    const hasConversationContext = !!input.activeDocument?.path
                        || (!!input.activeScopeKey && input.showAgentConversationList === true);
                    if (!hasConversationContext) {
                        return false;
                    }

                    return !!resolveSavedConversationIdForSelection({
                        selectedNodePath: input.selectedNodePath,
                        activeDocumentPath: input.activeDocument?.path ?? input.activePath
                    })
                        || (!!input.openConversationId && input.openConversationNonce !== null);
                }
            });
            api.registerWorkspaceSelectionView({
                id: 'ai-agent-workspace-config',
                component: WorkspaceAgentConfigPanel,
                order: 20,
                matches(input) {
                    return !!input.selectedOwnerNode
                        && !!input.activeScopeMetadata
                        && !!input.activeScopeKey
                        && !input.activePath;
                }
            });
            api.registerInsertLinkType({
                id: 'conversation',
                title: 'Conversations',
                titleKey: 'shared.markdownLinkTabConversations',
                order: 20,
                supports(input) {
                    return !!input.activePath && !!input.activeScopeKey;
                },
                getRefreshKey(input) {
                    const activeAgentKey = input.activeScopeKey?.trim() || '';
                    if (!activeAgentKey) {
                        return '';
                    }

                    return chatStore.getConversationsByAgent(activeAgentKey).map((conversation) => ({
                        id: conversation.id,
                        title: conversation.title?.trim() || 'New Chat',
                        updatedAt: conversation.updatedAt
                    }));
                },
                getItems(input) {
                    const activeAgentKey = input.activeScopeKey?.trim() || '';
                    if (!activeAgentKey) {
                        return [];
                    }

                    return chatStore.getConversationsByAgent(activeAgentKey).map((conversation) => {
                        const title = conversation.title?.trim() || 'New Chat';
                        return {
                            id: conversation.id,
                            title,
                            markdown: buildConversationLinkMarkdown(title, conversation.id)
                        };
                    });
                }
            });
            api.registerNodePresentation({
                id: 'ai-agent-owner-node',
                priority: 20,
                supports(node) {
                    return node.kind === 'directory' && node.ownsMetadata === true;
                },
                getPresentation() {
                    return {
                        icon: 'bot'
                    };
                }
            });
        }
    };
}
