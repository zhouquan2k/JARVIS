// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive, ref } from 'vue';

const mockOpenConversationImportDialog = vi.fn();
const mockInstallGlobalUnhandledErrorFallback = vi.fn();
const mockCurrentRoute = ref({ path: '/chat' });
const fetchMock = vi.fn();
const openMock = vi.fn();

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
    analysisError: null as string | null,
    setRuntime: vi.fn().mockResolvedValue(undefined)
});

vi.mock('@packages/ui', () => ({
    WorkspaceHostApp: {
        props: [
            'currentRoutePath',
            'navigateTo',
            'contextProvider',
            'authStatusOverride',
            'authUnavailableMessage',
            'authRecoveryActionLabel',
            'authRecoveryActionDisabled'
        ],
        template: `
          <button
            data-testid="workspace-host-stub"
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

vi.mock('./context/createWebContextProvider', () => ({
    createWebContextProvider: vi.fn(() => ({ id: 'web-context' }))
}));

vi.mock('./modelProviderRuntime', () => ({
    agentRuntime: { run: vi.fn(), abort: vi.fn() },
    createWebHistoryProviders: vi.fn(() => []),
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
    createWebSyncStorageProvider: vi.fn(() => ({
        hydrate: vi.fn().mockResolvedValue(undefined)
    })),
    resetWebSyncCache: vi.fn().mockResolvedValue(undefined)
}));

describe('Web App Codex auth recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        chatStore.currentProviderId = 'chatgpt-codex';
        chatStore.checkAuth = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValue(true) as typeof chatStore.checkAuth;
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

    it('shows the Codex login entry and triggers the server-backed login flow', async () => {
        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        const host = wrapper.get('[data-testid="workspace-host-stub"]');
        expect(host.attributes('data-auth-status')).toBe('false');
        expect(host.attributes('data-auth-message')).toContain('Codex provider');
        expect(host.attributes('data-auth-label')).toBe('登录 Codex');

        await host.trigger('click');
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/codex/auth/login'), expect.objectContaining({
            method: 'POST'
        }));
        expect(openMock).toHaveBeenCalledWith('https://chatgpt.com/auth/device', '_blank', 'noopener');
    });
});
