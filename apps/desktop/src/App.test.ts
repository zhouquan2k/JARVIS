// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive, ref } from 'vue';

const mockOpenConversationImportDialog = vi.fn();
const mockSetRuntime = vi.fn().mockResolvedValue(undefined);
const mockProviderRuntime = {
    getProviderCatalog: vi.fn(() => [
        { id: 'chatgpt-web', name: 'ChatGPT (Web)' }
    ]),
    getProvider: vi.fn(() => ({ id: 'chatgpt-web' })),
    getProviderModels: vi.fn().mockResolvedValue({
        models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
        defaultModel: 'gpt-4o'
    })
};
const mockCreateDesktopSyncStorageProvider = vi.fn(() => ({
    hydrate: vi.fn().mockResolvedValue(undefined)
}));
const mockNavigateTo = vi.fn();
const mockCurrentRoute = ref({ path: '/' });

const chatStore = reactive({
    currentProviderId: 'chatgpt-web',
    currentModelId: 'gpt-4o',
    currentError: null as string | null,
    setProviderCatalog: vi.fn(),
    setModelProviderResolver: vi.fn(),
    setProviderModelsResolver: vi.fn(),
    setProviders: vi.fn(),
    setHistoryProviders: vi.fn(),
    setExternalFileImportHandler: vi.fn(),
    initializeProviderCatalog: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    checkAuth: vi.fn(),
    reloadProviderModels: vi.fn().mockResolvedValue(undefined)
});

const compareStore = reactive({
    stage: 'idle',
    analysisError: null as string | null,
    setRuntime: mockSetRuntime,
    startNewCompare: vi.fn()
});

vi.mock('@packages/ui', () => ({
    AppTopBar: {
        template: '<div data-testid="topbar-stub" />'
    },
    ConversationWorkspaceView: {
        props: [
            'isCompareMode',
            'showHistorySourceSwitch',
            'authStatusOverride',
            'authUnavailableMessage',
            'authRecoveryActionLabel',
            'authRecoveryActionDisabled'
        ],
        template: `
          <button
            data-testid="workspace-stub"
            :data-auth-status="authStatusOverride === null ? 'null' : String(authStatusOverride)"
            :data-auth-message="authUnavailableMessage || ''"
            :data-auth-label="authRecoveryActionLabel || ''"
            :data-auth-disabled="String(authRecoveryActionDisabled)"
            @click="$emit('request-auth-recovery')"
          />
        `
    },
    openConversationImportDialog: mockOpenConversationImportDialog,
    useChatStore: () => chatStore,
    useCompareStore: () => compareStore
}));

vi.mock('./providerRuntime', () => ({
    createDesktopHistoryProviders: vi.fn(() => []),
    providerRuntime: mockProviderRuntime
}));

vi.mock('./sync', () => ({
    createDesktopSyncStorageProvider: mockCreateDesktopSyncStorageProvider
}));

vi.mock('./router', () => ({
    currentRoute: mockCurrentRoute,
    navigateTo: mockNavigateTo
}));

describe('Desktop App auth recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        chatStore.currentProviderId = 'chatgpt-web';
        chatStore.currentModelId = 'gpt-4o';
        chatStore.currentError = null;
        compareStore.analysisError = null;
        window.chatprismDesktop = undefined;
    });

    afterEach(() => {
        delete window.chatprismDesktop;
    });

    it('shows the ChatGPT desktop login entry when auth is unavailable and requests host login', async () => {
        chatStore.checkAuth = vi.fn().mockResolvedValue(false) as typeof chatStore.checkAuth;
        const openProviderLoginWindow = vi.fn().mockResolvedValue(undefined);
        window.chatprismDesktop = {
            sendProxyRequest: vi.fn(),
            onProxyResponse: vi.fn(() => () => undefined),
            openProviderLoginWindow,
            onProviderLoginWindowOpened: vi.fn(() => () => undefined),
            onProviderLoginWindowClosed: vi.fn(() => () => undefined)
        };

        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        const workspace = wrapper.get('[data-testid="workspace-stub"]');
        expect(workspace.attributes('data-auth-status')).toBe('false');
        expect(workspace.attributes('data-auth-message')).toContain('当前桌面宿主的 ChatGPT 登录态不可用');
        expect(workspace.attributes('data-auth-label')).toBe('登录 ChatGPT');

        await workspace.trigger('click');
        expect(openProviderLoginWindow).toHaveBeenCalledWith('chatgpt-web');
    });

    it('refreshes auth status after the host login window closes', async () => {
        chatStore.checkAuth = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true) as typeof chatStore.checkAuth;
        chatStore.reloadProviderModels = vi.fn().mockResolvedValue(undefined) as typeof chatStore.reloadProviderModels;
        let closeListener: ((providerId: string) => void) | null = null;
        window.chatprismDesktop = {
            sendProxyRequest: vi.fn(),
            onProxyResponse: vi.fn(() => () => undefined),
            openProviderLoginWindow: vi.fn().mockResolvedValue(undefined),
            onProviderLoginWindowOpened: vi.fn(() => () => undefined),
            onProviderLoginWindowClosed: vi.fn((listener: (providerId: string) => void) => {
                closeListener = listener;
                return () => {
                    closeListener = null;
                };
            })
        };

        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        expect(wrapper.get('[data-testid="workspace-stub"]').attributes('data-auth-status')).toBe('false');

        closeListener?.('chatgpt-web');
        await flushPromises();

        expect(chatStore.checkAuth).toHaveBeenCalledTimes(2);
        expect(chatStore.reloadProviderModels).toHaveBeenCalledWith('chatgpt-web');
        expect(wrapper.get('[data-testid="workspace-stub"]').attributes('data-auth-status')).toBe('true');
    });
});
