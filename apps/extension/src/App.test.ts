// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive, ref } from 'vue';

const mockOpenConversationImportDialog = vi.fn();
const mockCurrentRoute = ref({ path: '/chat' });
const mockInstallGlobalUnhandledErrorFallback = vi.fn();
const fetchMock = vi.fn();
const openMock = vi.fn();

async function flushApp() {
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
}

const chatStore = reactive({
    currentProviderId: 'chatgpt-codex',
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
    init: vi.fn().mockResolvedValue(undefined),
    checkAuth: vi.fn().mockResolvedValue(false),
    reloadProviderModels: vi.fn().mockResolvedValue(undefined)
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
        props: [
            'currentRoutePath',
            'navigateTo',
            'contextProvider',
            'showHistorySourceSwitch',
            'authStatusOverride',
            'authUnavailableMessage',
            'authRecoveryActionLabel',
            'authRecoveryActionDisabled'
        ],
        template: `
          <button
            data-testid="workspace-host-stub"
            :data-route-path="currentRoutePath"
            :data-context-id="contextProvider?.id || ''"
            :data-switch="String(showHistorySourceSwitch)"
            :data-auth-status="authStatusOverride === null ? 'null' : String(authStatusOverride)"
            :data-auth-message="authUnavailableMessage || ''"
            :data-auth-label="authRecoveryActionLabel || ''"
            :data-auth-disabled="String(authRecoveryActionDisabled)"
            @click="$emit('request-auth-recovery')"
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
        getProviderCatalog: vi.fn(() => [{ id: 'chatgpt-codex', name: 'ChatGPT (Codex)' }]),
        getProvider: vi.fn(() => ({ id: 'chatgpt-codex' })),
        getProviderModels: vi.fn().mockResolvedValue({
            models: [{ id: 'gpt-5.4', name: 'GPT-5.4' }],
            defaultModel: 'gpt-5.4'
        })
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
        chatStore.currentProviderId = 'chatgpt-codex';
        chatStore.currentError = null;
        chatStore.checkAuth = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValue(true) as typeof chatStore.checkAuth;
        mockInstallGlobalUnhandledErrorFallback.mockImplementation(({ reportError }: { reportError: (message: string) => void }) => {
            mockInstallGlobalUnhandledErrorFallback.reportError = reportError;
            return vi.fn();
        });
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ verificationUri: 'https://chatgpt.com/auth/device' })
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('open', openMock);
        vi.stubGlobal('setTimeout', ((handler: TimerHandler) => {
            if (typeof handler === 'function') {
                handler();
            }
            return 0;
        }) as typeof setTimeout);
    });

    it('renders the shared workspace host with extension context and switch props', async () => {
        const { default: App } = await import('./App.vue');
        const container = document.createElement('div');
        document.body.appendChild(container);
        createApp(App).mount(container);
        await flushApp();

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

    it('starts the Codex auth recovery flow through the local server', async () => {
        const { default: App } = await import('./App.vue');
        const container = document.createElement('div');
        document.body.appendChild(container);
        createApp(App).mount(container);
        await flushApp();

        const host = container.querySelector('[data-testid="workspace-host-stub"]') as HTMLButtonElement;
        host.click();
        await flushApp();

        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/codex/auth/login'), expect.objectContaining({
            method: 'POST'
        }));
        expect(openMock).toHaveBeenCalledWith('https://chatgpt.com/auth/device', '_blank', 'noopener');
    });
});
