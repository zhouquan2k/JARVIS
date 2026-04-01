// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive, ref } from 'vue';

const mockOpenConversationImportDialog = vi.fn();
const mockSetRuntime = vi.fn().mockResolvedValue(undefined);
const mockAgentRuntime = {
    run: vi.fn(),
    abort: vi.fn()
};
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
const mockCurrentRoute = ref({ path: '/chat' });

const chatStore = reactive({
    currentProviderId: 'chatgpt-web',
    currentModelId: 'gpt-4o',
    currentError: null as string | null,
    currentHistoryErrorCode: null as string | null,
    historySource: 'local' as 'local' | 'external',
    activeExternalProviderId: 'chatgpt-web' as 'chatgpt-web' | 'gemini-web' | 'external-file',
    setProviderCatalog: vi.fn(),
    setAgentRuntime: vi.fn(),
    setModelProviderResolver: vi.fn(),
    setProviderModelsResolver: vi.fn(),
    setProviders: vi.fn(),
    setHistoryProviders: vi.fn(),
    setExternalFileImportHandler: vi.fn(),
    initializeProviderCatalog: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    checkAuth: vi.fn(),
    loadExternalHistory: vi.fn().mockResolvedValue(undefined),
    reloadProviderModels: vi.fn().mockResolvedValue(undefined)
});

const compareStore = reactive({
    stage: 'idle',
    analysisError: null as string | null,
    setRuntime: mockSetRuntime,
    startNewCompare: vi.fn()
});

vi.mock('@packages/ui', () => ({
    PRIMARY_WORKSPACE_ROUTES: [
        { path: '/', name: 'knowledge-workspace', label: '知识工作区' },
        { path: '/chat', name: 'normal-chat', label: '普通聊天' }
    ],
    AppTopBar: {
        template: `
          <div data-testid="topbar-stub">
            <button data-testid="topbar-knowledge" @click="$emit('navigate-workspace', '/')">知识</button>
            <button data-testid="topbar-chat" @click="$emit('navigate-workspace', '/chat')">聊天</button>
          </div>
        `
    },
    ConversationWorkspaceView: {
        props: [
            'isCompareMode',
            'showHistorySourceSwitch',
            'authStatusOverride',
            'authUnavailableMessage',
            'authRecoveryActionLabel',
            'authRecoveryActionDisabled',
            'hostRecoveryMessage',
            'hostRecoveryActionLabel',
            'hostRecoveryActionDisabled'
        ],
        template: `
          <div>
            <button
              data-testid="workspace-auth-stub"
              :data-auth-status="authStatusOverride === null ? 'null' : String(authStatusOverride)"
              :data-auth-message="authUnavailableMessage || ''"
              :data-auth-label="authRecoveryActionLabel || ''"
              :data-auth-disabled="String(authRecoveryActionDisabled)"
              @click="$emit('request-auth-recovery')"
            />
            <button
              data-testid="workspace-host-stub"
              :data-host-message="hostRecoveryMessage || ''"
              :data-host-label="hostRecoveryActionLabel || ''"
              :data-host-disabled="String(hostRecoveryActionDisabled)"
              @click="$emit('request-host-recovery')"
            />
          </div>
        `
    },
    KnowledgeWorkspaceView: {
        props: ['contextProvider'],
        template: '<div data-testid="knowledge-workspace-stub" />'
    },
    openConversationImportDialog: mockOpenConversationImportDialog,
    useChatStore: () => chatStore,
    useCompareStore: () => compareStore
}));

vi.mock('./providerRuntime', () => ({
    createDesktopHistoryProviders: vi.fn(() => []),
    providerRuntime: mockProviderRuntime,
    agentRuntime: mockAgentRuntime
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
        chatStore.currentHistoryErrorCode = null;
        chatStore.historySource = 'local';
        chatStore.activeExternalProviderId = 'chatgpt-web';
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
            onProviderLoginCompleted: vi.fn(() => () => undefined),
            onProviderLoginWindowClosed: vi.fn(() => () => undefined)
        };

        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        const workspace = wrapper.get('[data-testid="workspace-auth-stub"]');
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
            onProviderLoginCompleted: vi.fn(() => () => undefined),
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

        expect(wrapper.get('[data-testid="workspace-auth-stub"]').attributes('data-auth-status')).toBe('false');

        closeListener?.('chatgpt-web');
        await flushPromises();

        expect(chatStore.checkAuth).toHaveBeenCalledTimes(2);
        expect(chatStore.reloadProviderModels).toHaveBeenCalledWith('chatgpt-web');
        expect(wrapper.get('[data-testid="workspace-auth-stub"]').attributes('data-auth-status')).toBe('true');
    });

    it('shows the Gemini history recovery entry when external history requires auth', async () => {
        chatStore.currentProviderId = 'gemini-api';
        chatStore.historySource = 'external';
        chatStore.activeExternalProviderId = 'gemini-web';
        chatStore.currentHistoryErrorCode = 'AUTH_REQUIRED';
        const openProviderLoginWindow = vi.fn().mockResolvedValue(undefined);
        window.chatprismDesktop = {
            sendProxyRequest: vi.fn(),
            onProxyResponse: vi.fn(() => () => undefined),
            openProviderLoginWindow,
            onProviderLoginWindowOpened: vi.fn(() => () => undefined),
            onProviderLoginCompleted: vi.fn(() => () => undefined),
            onProviderLoginWindowClosed: vi.fn(() => () => undefined)
        };

        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        const workspace = wrapper.get('[data-testid="workspace-host-stub"]');
        expect(workspace.attributes('data-host-message')).toContain('Gemini 登录态不可用');
        expect(workspace.attributes('data-host-label')).toBe('登录 Gemini');

        await workspace.trigger('click');
        expect(openProviderLoginWindow).toHaveBeenCalledWith('gemini-web');
    });

    it('refreshes Gemini external history after the Gemini login window closes', async () => {
        chatStore.currentProviderId = 'gemini-api';
        chatStore.historySource = 'external';
        chatStore.activeExternalProviderId = 'gemini-web';
        chatStore.currentHistoryErrorCode = 'AUTH_REQUIRED';
        chatStore.loadExternalHistory = vi.fn().mockResolvedValue(undefined) as typeof chatStore.loadExternalHistory;
        let closeListener: ((providerId: string) => void) | null = null;
        window.chatprismDesktop = {
            sendProxyRequest: vi.fn(),
            onProxyResponse: vi.fn(() => () => undefined),
            openProviderLoginWindow: vi.fn().mockResolvedValue(undefined),
            onProviderLoginWindowOpened: vi.fn(() => () => undefined),
            onProviderLoginCompleted: vi.fn(() => () => undefined),
            onProviderLoginWindowClosed: vi.fn((listener: (providerId: string) => void) => {
                closeListener = listener;
                return () => {
                    closeListener = null;
                };
            })
        };

        const { default: App } = await import('./App.vue');
        mount(App);
        await flushPromises();

        closeListener?.('gemini-web');
        await flushPromises();

        expect(chatStore.loadExternalHistory).toHaveBeenCalledWith('gemini-web');
    });

    it('refreshes Gemini external history after the Gemini login completes', async () => {
        chatStore.currentProviderId = 'gemini-api';
        chatStore.historySource = 'external';
        chatStore.activeExternalProviderId = 'gemini-web';
        chatStore.currentHistoryErrorCode = 'AUTH_REQUIRED';
        chatStore.loadExternalHistory = vi.fn().mockResolvedValue(undefined) as typeof chatStore.loadExternalHistory;
        let completedListener: ((providerId: string) => void) | null = null;
        window.chatprismDesktop = {
            sendProxyRequest: vi.fn(),
            onProxyResponse: vi.fn(() => () => undefined),
            openProviderLoginWindow: vi.fn().mockResolvedValue(undefined),
            onProviderLoginWindowOpened: vi.fn(() => () => undefined),
            onProviderLoginCompleted: vi.fn((listener: (providerId: string) => void) => {
                completedListener = listener;
                return () => {
                    completedListener = null;
                };
            }),
            onProviderLoginWindowClosed: vi.fn(() => () => undefined)
        };

        const { default: App } = await import('./App.vue');
        mount(App);
        await flushPromises();

        completedListener?.('gemini-web');
        await flushPromises();

        expect(chatStore.loadExternalHistory).toHaveBeenCalledWith('gemini-web');
    });

    it('mounts the knowledge workspace route without touching the chat workspace', async () => {
        mockCurrentRoute.value = { path: '/' };
        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        expect(wrapper.find('[data-testid="workspace-auth-stub"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="knowledge-workspace-stub"]').exists()).toBe(true);

        mockCurrentRoute.value = { path: '/chat' };
    });

    it('routes top-bar workspace navigation through the host router', async () => {
        mockCurrentRoute.value = { path: '/chat' };
        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        await wrapper.get('[data-testid="topbar-knowledge"]').trigger('click');
        expect(mockNavigateTo).toHaveBeenCalledWith('/');
    });
});
