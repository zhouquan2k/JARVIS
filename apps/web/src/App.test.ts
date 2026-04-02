// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive, ref } from 'vue';

const mockOpenConversationImportDialog = vi.fn();
const mockNavigateTo = vi.fn();
const mockCurrentRoute = ref({ path: '/chat' });

const chatStore = reactive({
    currentError: null as string | null,
    resetWorkspaceConversationState: vi.fn(),
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
        props: ['isCompareMode', 'showHistorySourceSwitch'],
        template: '<div data-testid="conversation-workspace-stub" />'
    },
    KnowledgeWorkspaceView: {
        props: ['contextProvider'],
        template: '<div data-testid="knowledge-workspace-stub" />'
    },
    openConversationImportDialog: mockOpenConversationImportDialog,
    useChatStore: () => chatStore,
    useCompareStore: () => compareStore
}));

vi.mock('./router', () => ({
    currentRoute: mockCurrentRoute,
    navigateTo: mockNavigateTo
}));

vi.mock('./context/createWebContextProvider', () => ({
    createWebContextProvider: vi.fn(() => ({ id: 'web-context' }))
}));

vi.mock('./providerRuntime', () => ({
    agentRuntime: { run: vi.fn(), abort: vi.fn() },
    createWebHistoryProviders: vi.fn(() => []),
    providerRuntime: {
        getProviderCatalog: vi.fn(() => []),
        getProvider: vi.fn(),
        getProviderModels: vi.fn()
    }
}));

vi.mock('./sync', () => ({
    createWebSyncStorageProvider: vi.fn(() => ({
        hydrate: vi.fn().mockResolvedValue(undefined)
    }))
}));

describe('Web App workspace navigation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCurrentRoute.value = { path: '/chat' };
        chatStore.currentError = null;
    });

    it('resets the chat workspace state before navigating to another workspace', async () => {
        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        await wrapper.get('[data-testid="topbar-knowledge"]').trigger('click');

        expect(chatStore.resetWorkspaceConversationState).toHaveBeenCalledTimes(1);
        expect(mockNavigateTo).toHaveBeenCalledWith('/');
    });

    it('does not reset the chat workspace state when navigating to the current workspace', async () => {
        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        await wrapper.get('[data-testid="topbar-chat"]').trigger('click');

        expect(chatStore.resetWorkspaceConversationState).not.toHaveBeenCalled();
        expect(mockNavigateTo).toHaveBeenCalledWith('/chat');
    });
});
