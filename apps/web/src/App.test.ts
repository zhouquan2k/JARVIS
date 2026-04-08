// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive, ref } from 'vue';

const mockOpenConversationImportDialog = vi.fn();
const mockCurrentRoute = ref({ path: '/chat' });

const chatStore = reactive({
    currentError: null as string | null,
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
const workspaceHostProps = vi.fn();

vi.mock('@packages/ui', () => ({
    WorkspaceHostApp: {
        props: ['currentRoutePath', 'navigateTo', 'contextProvider'],
        template: `
          <div
            data-testid="workspace-host-stub"
            :data-route-path="currentRoutePath"
            :data-context-id="contextProvider?.id || ''"
          />
        `
    },
    openConversationImportDialog: mockOpenConversationImportDialog,
    useChatStore: () => chatStore,
    useCompareStore: () => compareStore
}));

vi.mock('./router', () => ({
    currentRoute: mockCurrentRoute,
    navigateTo: vi.fn((path: string) => {
        workspaceHostProps(path);
    })
}));

vi.mock('./context/createWebContextProvider', () => ({
    createWebContextProvider: vi.fn(() => ({ id: 'web-context' }))
}));

vi.mock('./modelProviderRuntime', () => ({
    agentRuntime: { run: vi.fn(), abort: vi.fn() },
    createWebHistoryProviders: vi.fn(() => []),
    modelProviderRuntime: {
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

    it('renders the shared workspace host with web route and context props', async () => {
        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        expect(wrapper.get('[data-testid="workspace-host-stub"]').attributes('data-route-path')).toBe('/chat');
        expect(wrapper.get('[data-testid="workspace-host-stub"]').attributes('data-context-id')).toBe('web-context');
    });
});
