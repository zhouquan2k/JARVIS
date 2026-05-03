// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive, ref } from 'vue';

const mockOpenConversationImportDialog = vi.fn();
const mockCurrentRoute = ref({ path: '/chat' });
const mockInstallGlobalUnhandledErrorFallback = vi.fn();

const chatStore = reactive({
    currentError: null as string | null,
    reportUnhandledBackendError: vi.fn(function (this: typeof chatStore, error: unknown) {
        this.currentError = error instanceof Error ? error.message : String(error);
    }),
    setProviderCatalog: vi.fn(),
    setAgentRuntime: vi.fn(),
    setModelProviderResolver: vi.fn(),
    setProviderModelsResolver: vi.fn(),
    setProviders: vi.fn(),
    setHistoryProviders: vi.fn(),
    setExternalFileImportHandler: vi.fn(),
    initializeProviderCatalog: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined)
});

const compareStore = reactive({
    stage: 'idle',
    analysisError: null as string | null,
    setRuntime: vi.fn().mockResolvedValue(undefined),
    startNewCompare: vi.fn(),
    setModelA: vi.fn().mockResolvedValue(undefined),
    setModelB: vi.fn().mockResolvedValue(undefined),
    prompt: '',
    outputA: '',
    outputB: '',
    analysisResult: null as object | null,
    analysisRaw: '',
    hasAnalysisStartedStreaming: false,
    activeTab: 'analysis'
});

vi.mock('@packages/ui', () => ({
    WorkspaceHostApp: {
        props: ['currentRoutePath', 'navigateTo', 'contextProvider', 'showHistorySourceSwitch'],
        template: `
          <div
            data-testid="workspace-host-stub"
            :data-route-path="currentRoutePath"
            :data-context-id="contextProvider?.id || ''"
            :data-switch="String(showHistorySourceSwitch)"
          />
        `
    },
    openConversationImportDialog: mockOpenConversationImportDialog,
    installGlobalUnhandledErrorFallback: mockInstallGlobalUnhandledErrorFallback,
    useChatStore: () => chatStore,
    useCompareStore: () => compareStore
}));

vi.mock('./router', () => ({
    currentRoute: mockCurrentRoute,
    navigateTo: vi.fn()
}));

vi.mock('./context/createExtensionContextProvider', () => ({
    createExtensionContextProvider: vi.fn(() => ({ id: 'extension-context' }))
}));

vi.mock('./modelProviderRuntime', () => ({
    agentRuntime: { run: vi.fn(), abort: vi.fn() },
    createExtensionHistoryProviders: vi.fn(() => []),
    modelProviderRuntime: {
        getProviderCatalog: vi.fn(() => []),
        getProvider: vi.fn(),
        getProviderModels: vi.fn()
    }
}));

vi.mock('./sync', () => ({
    createExtensionSyncStorageProvider: vi.fn(() => ({
        hydrate: vi.fn().mockResolvedValue(undefined),
        syncNow: vi.fn().mockResolvedValue(undefined)
    }))
}));

vi.mock('./persistence/saveCompareConversation', () => ({
    loadLatestCompareConversation: vi.fn().mockResolvedValue(null),
    saveCompareConversation: vi.fn().mockResolvedValue(undefined)
}));

describe('Extension App workspace host', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCurrentRoute.value = { path: '/chat' };
        chatStore.currentError = null;
        mockInstallGlobalUnhandledErrorFallback.mockImplementation(({ reportError }: { reportError: (message: string) => void }) => {
            mockInstallGlobalUnhandledErrorFallback.reportError = reportError;
            return vi.fn();
        });
    });

    it('renders the shared workspace host with extension context and switch props', async () => {
        const { default: App } = await import('./App.vue');
        const container = document.createElement('div');
        document.body.appendChild(container);
        createApp(App).mount(container);
        await nextTick();

        const host = container.querySelector('[data-testid="workspace-host-stub"]');
        expect(host?.getAttribute('data-route-path')).toBe('/chat');
        expect(host?.getAttribute('data-context-id')).toBe('extension-context');
        expect(host?.getAttribute('data-switch')).toBe('true');
    });

    it('reports unhandled global errors through chatStore', async () => {
        const { default: App } = await import('./App.vue');
        const container = document.createElement('div');
        document.body.appendChild(container);
        createApp(App).mount(container);
        await nextTick();

        expect(mockInstallGlobalUnhandledErrorFallback).toHaveBeenCalledTimes(1);
        mockInstallGlobalUnhandledErrorFallback.reportError('Extension backend request failed.');

        expect(chatStore.reportUnhandledBackendError).toHaveBeenCalledWith('Extension backend request failed.');
        expect(chatStore.currentError).toBe('Extension backend request failed.');
    });
});
