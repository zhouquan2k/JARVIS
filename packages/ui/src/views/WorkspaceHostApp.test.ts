// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import WorkspaceHostApp from './WorkspaceHostApp.vue';
import type { WorkspaceRuntimeContext } from '@packages/core/src';
import { useDocumentWorkspaceStore } from '../store/documentWorkspace';
import { resetMockChatStore, useMockChatStore } from '../../test-support/mockChatStore';

const defaultAllTasksComponent = {
    props: ['contextProvider'],
    template: '<div data-testid="all-tasks-workspace-stub" :data-context-id="contextProvider?.id || \'\'" />'
};

const defaultChatComponent = {
    props: ['contextProvider'],
    template: '<div data-testid="conversation-workspace-stub" :data-context-id="contextProvider?.id || \'\'" />'
};

function createContributionQuery(options?: {
    allTasksComponent?: object;
    chatComponent?: object;
}) {
    return {
        getGlobalViews: () => [
            {
                id: 'all-tasks',
                routePath: '/all-tasks',
                routeName: 'all-tasks',
                label: 'All Tasks',
                component: options?.allTasksComponent ?? defaultAllTasksComponent
            },
            {
                id: 'chat',
                routePath: '/chat',
                routeName: 'normal-chat',
                label: 'Chat',
                component: options?.chatComponent ?? defaultChatComponent
            }
        ],
        getRightPanelTabs: () => [],
        getWorkspaceSelectionViews: () => [],
        getInsertLinkTypes: () => [],
        getDocumentCreationFlows: () => []
    };
}

function createRuntimeContext(): WorkspaceRuntimeContext {
    const chatStore = useMockChatStore();

    return {
        get currentError() {
            return chatStore.currentError;
        },
        clearCurrentError() {
            chatStore.clearCurrentError();
        },
        async beforeRouteNavigate(input) {
            const currentConversationId = chatStore.currentConversation?.id ?? null;
            chatStore.setWorkspaceMode(input.nextRoutePath === '/' ? 'agent' : 'conversation');
            if (input.nextRoutePath === '/chat' && input.nextRoutePath !== input.currentRoutePath) {
                chatStore.saveAgentViewStatus({
                    selectedNodePath: input.selectedNodePath,
                    activePath: input.activePath,
                    activeConversationId: currentConversationId
                });
                const routeAgent = input.activeScopeMetadata?.data as Record<string, unknown> | undefined;
                if (routeAgent) {
                    chatStore.saveWorkspaceAgentContext(routeAgent);
                }
                chatStore.setSidebarCollapsed(input.revealSidebar !== true);
                await chatStore.applyWorkspaceAgentContextSelection();
            }
            if (input.nextRoutePath === '/' && input.currentRoutePath === '/chat') {
                const saved = chatStore.restoreAgentViewStatus();
                if (saved && (saved.selectedNodePath || saved.activePath)) {
                    chatStore.saveAgentViewStatus({
                        selectedNodePath: saved.selectedNodePath,
                        activePath: saved.activePath,
                        activeConversationId: currentConversationId
                    });
                }
            }
        },
        async publishWorkspaceSelectionChanged(input) {
            chatStore.setWorkspaceContext(input);
        },
        registerCurrentErrorSource() {
            return () => undefined;
        },
        registerBeforeRouteNavigateHandler() {
            return () => undefined;
        },
        registerWorkspaceSelectionChangedHandler() {
            return () => undefined;
        },
        getPluginMessages() {
            return [];
        },
        subscribePluginMessages() {
            return () => undefined;
        },
        postPluginMessage() {
            return undefined;
        },
        postHostEvent() {
            return undefined;
        },
        subscribeHostEvent() {
            return () => undefined;
        }
    };
}

describe('WorkspaceHostApp', () => {
    beforeEach(() => {
        resetMockChatStore();
    });

    it('reacts to contribution query becoming available after mount', async () => {
        setActivePinia(createPinia());
        const contributionQuery = ref<ReturnType<typeof createContributionQuery> | null>(null);
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo: vi.fn(),
                contextProvider: { id: 'ctx' },
                contributionQuery: contributionQuery.value,
                runtimeContext: createRuntimeContext()
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<div data-testid="topbar-stub" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        expect(wrapper.find('[data-testid="conversation-workspace-stub"]').exists()).toBe(false);

        contributionQuery.value = createContributionQuery();
        await wrapper.setProps({ contributionQuery: contributionQuery.value });
        await flushPromises();

        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-context-id')).toBe('ctx');
    });

    it('syncs agent workspace mode on initial knowledge workspace mount', async () => {
        setActivePinia(createPinia());
        const chatStore = useMockChatStore();

        mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/',
                navigateTo: vi.fn(),
                contextProvider: { id: 'ctx' },
                contributionQuery: createContributionQuery(),
                runtimeContext: createRuntimeContext()
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<div data-testid="topbar-stub" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        await flushPromises();

        expect(chatStore.workspaceMode).toBe('agent');
    });

    it('syncs agent workspace mode when the runtime context becomes available after mount', async () => {
        setActivePinia(createPinia());
        const chatStore = useMockChatStore();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/',
                navigateTo: vi.fn(),
                contextProvider: { id: 'ctx' },
                contributionQuery: createContributionQuery(),
                runtimeContext: null
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<div data-testid="topbar-stub" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        await wrapper.setProps({ runtimeContext: createRuntimeContext() });
        await flushPromises();

        expect(chatStore.workspaceMode).toBe('agent');
    });

    it('saves the Agent view state and expands the sidebar before entering chat mode from the top bar', async () => {
        setActivePinia(createPinia());
        const chatStore = useMockChatStore();
        const documentStore = useDocumentWorkspaceStore();
        documentStore.selectedNodePath = '/docs';
        documentStore.activePath = '/docs/guide.md';
        documentStore.activeAgentKey = '/docs/';
        documentStore.activeAgent = {
            name: 'Docs Agent',
            effectiveInstructions: 'Use docs context',
            modelProviderName: 'gemini-api',
            modelName: 'gemini-2.5-pro',
            scopePath: '/docs',
            sourcePaths: ['/docs/.agent.json']
        };
        chatStore.providerCatalog = [
            {
                id: 'gemini-api',
                name: 'Gemini API',
                models: [{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }],
                defaultModel: 'gemini-2.5-pro',
                supportedRuntimeModes: ['web']
            }
        ];
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Workspace Chat',
            origin: 'local',
            updatedAt: Date.now(),
            messages: []
        };
        const navigateTo = vi.fn();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/',
                navigateTo,
                contextProvider: { id: 'ctx' },
                contributionQuery: createContributionQuery(),
                runtimeContext: createRuntimeContext()
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<button data-testid="go-chat" @click="$emit(\'navigate-workspace\', \'/chat\', { revealSidebar: true })">go</button>'
                    },
                    ConversationWorkspaceView: {
                        props: ['contextProvider'],
                        template: '<div data-testid="conversation-workspace-stub" :data-context-id="contextProvider?.id || \'\'" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Workspace Chat',
            origin: 'local',
            updatedAt: Date.now(),
            messages: []
        };
        await wrapper.get('[data-testid="go-chat"]').trigger('click');
        await flushPromises();
        await flushPromises();

        expect(chatStore.restoreAgentViewStatus()).toEqual({
            selectedNodePath: '/docs',
            activePath: '/docs/guide.md',
            activeConversationId: 'conversation-1'
        });
        expect(chatStore.workspaceAgentContext?.name).toBe('Docs Agent');
        expect(chatStore.workspaceMode).toBe('conversation');
        expect(chatStore.currentConversation?.id).toBe('conversation-1');
        expect(chatStore.sidebarCollapsed).toBe(false);
        expect(navigateTo).toHaveBeenCalledWith('/chat');

        await wrapper.setProps({ currentRoutePath: '/chat' });
        await flushPromises();

        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-context-id')).toBe('ctx');
        expect(chatStore.workspaceMode).toBe('conversation');
    });

    it('does not resave the Agent snapshot when navigating to the current workspace', async () => {
        setActivePinia(createPinia());
        const chatStore = useMockChatStore();
        const saveSpy = vi.spyOn(chatStore, 'saveAgentViewStatus');
        const navigateTo = vi.fn();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo,
                contextProvider: { id: 'ctx' },
                contributionQuery: createContributionQuery(),
                runtimeContext: createRuntimeContext()
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<button data-testid="go-chat" @click="$emit(\'navigate-workspace\', \'/chat\', { revealSidebar: true })">go</button>'
                    },
                    ConversationWorkspaceView: {
                        props: ['contextProvider'],
                        template: '<div data-testid="conversation-workspace-stub" :data-context-id="contextProvider?.id || \'\'" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        await wrapper.get('[data-testid="go-chat"]').trigger('click');

        expect(saveSpy).not.toHaveBeenCalled();
        expect(navigateTo).toHaveBeenCalledWith('/chat');
    });

    it('navigates to chat mode from the knowledge workspace switch button', async () => {
        setActivePinia(createPinia());
        const navigateTo = vi.fn();
        const chatStore = useMockChatStore();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/',
                navigateTo,
                contextProvider: { id: 'ctx' },
                contributionQuery: createContributionQuery(),
                runtimeContext: createRuntimeContext()
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<div data-testid="topbar-stub" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<button data-testid="workspace-switch" @click="$emit(\'request-workspace-switch\', \'/chat\')" />'
                    },
                    ConversationWorkspaceView: {
                        template: '<div data-testid="conversation-workspace-stub" />'
                    }
                }
            }
        });

        await wrapper.get('[data-testid="workspace-switch"]').trigger('click');
        await flushPromises();

        expect(chatStore.sidebarCollapsed).toBe(true);
        expect(navigateTo).toHaveBeenCalledWith('/chat');
    });

    it('navigates back to knowledge mode from the chat restore button', async () => {
        setActivePinia(createPinia());
        const navigateTo = vi.fn();
        const chatStore = useMockChatStore();
        chatStore.saveWorkspaceAgentContext({
            name: 'Docs Agent',
            effectiveInstructions: 'Use docs context',
            modelProviderName: 'gemini-api',
            modelName: 'gemini-2.5-pro',
            scopePath: '/docs',
            sourcePaths: ['/docs/.agent.json']
        });
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo,
                contextProvider: { id: 'ctx' },
                contributionQuery: createContributionQuery({
                    chatComponent: {
                        template: '<button data-testid="workspace-restore" @click="$emit(\'request-workspace-switch\', \'/\')" />'
                    }
                }),
                runtimeContext: createRuntimeContext()
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<div data-testid="topbar-stub" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    },
                    ConversationWorkspaceView: {
                        template: '<button data-testid="workspace-restore" @click="$emit(\'request-workspace-switch\', \'/\')" />'
                    }
                }
            }
        });

        chatStore.currentConversation = {
            id: 'conversation-2',
            title: 'Current Chat',
            origin: 'local',
            updatedAt: Date.now(),
            messages: []
        };
        await wrapper.get('[data-testid="workspace-restore"]').trigger('click');
        await flushPromises();

        expect(chatStore.workspaceAgentContext?.name).toBe('Docs Agent');
        expect(chatStore.workspaceMode).toBe('agent');
        expect(navigateTo).toHaveBeenCalledWith('/');
    });

    it('updates the saved agent conversation to the current chat before restoring the knowledge workspace', async () => {
        setActivePinia(createPinia());
        const navigateTo = vi.fn();
        const chatStore = useMockChatStore();
        chatStore.saveAgentViewStatus({
            selectedNodePath: '/docs',
            activePath: '/docs/guide.md',
            activeConversationId: 'conversation-1'
        });
        chatStore.currentConversation = {
            id: 'conversation-2',
            title: 'Current Chat',
            origin: 'local',
            updatedAt: Date.now(),
            messages: []
        };

        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo,
                contextProvider: { id: 'ctx' },
                contributionQuery: createContributionQuery({
                    chatComponent: {
                        template: '<button data-testid="workspace-restore" @click="$emit(\'request-workspace-switch\', \'/\')" />'
                    }
                }),
                runtimeContext: createRuntimeContext()
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<div data-testid="topbar-stub" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    },
                    ConversationWorkspaceView: {
                        template: '<button data-testid="workspace-restore" @click="$emit(\'request-workspace-switch\', \'/\')" />'
                    }
                }
            }
        });

        await wrapper.get('[data-testid="workspace-restore"]').trigger('click');
        await flushPromises();

        expect(chatStore.restoreAgentViewStatus()).toEqual({
            selectedNodePath: '/docs',
            activePath: '/docs/guide.md',
            activeConversationId: 'conversation-2'
        });
        expect(navigateTo).toHaveBeenCalledWith('/');
    });

    it('renders the all-tasks workspace for the dedicated route', async () => {
        setActivePinia(createPinia());
        const navigateTo = vi.fn();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/all-tasks',
                navigateTo,
                contextProvider: { id: 'ctx' },
                contributionQuery: createContributionQuery(),
                runtimeContext: createRuntimeContext()
            },
            global: {
                stubs: {
                    AllTasksWorkspaceView: {
                        props: ['contextProvider'],
                        template: '<div data-testid="all-tasks-workspace-stub" :data-context-id="contextProvider?.id || \'\'" />'
                    },
                    ConversationWorkspaceView: {
                        template: '<div data-testid="conversation-workspace-stub" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="all-tasks-workspace-stub"]').attributes('data-context-id')).toBe('ctx');
        expect(wrapper.find('[data-testid="conversation-workspace-stub"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="document-workspace-stub"]').exists()).toBe(false);
    });

    it('shows top bar node history controls in knowledge mode and forwards navigation to the document store', async () => {
        setActivePinia(createPinia());
        const navigateTo = vi.fn();
        const documentStore = useDocumentWorkspaceStore();
        documentStore.nodeHistory = ['/alpha.md', '/beta.md'];
        documentStore.nodeHistoryIndex = 1;
        const backSpy = vi.spyOn(documentStore, 'goBackNodeHistory').mockResolvedValue(undefined);
        const forwardSpy = vi.spyOn(documentStore, 'goForwardNodeHistory').mockResolvedValue(undefined);

        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/',
                navigateTo,
                contextProvider: { id: 'ctx' },
                contributionQuery: createContributionQuery(),
                runtimeContext: createRuntimeContext()
            },
            global: {
                stubs: {
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    },
                    ConversationWorkspaceView: {
                        template: '<div data-testid="conversation-workspace-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="topbar-node-history-controls"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="topbar-node-history-back"]').attributes('disabled')).toBeUndefined();
        expect(wrapper.get('[data-testid="topbar-node-history-forward"]').attributes('disabled')).toBeDefined();

        await wrapper.get('[data-testid="topbar-node-history-back"]').trigger('click');
        await flushPromises();
        expect(backSpy).toHaveBeenCalledTimes(1);
        expect(forwardSpy).not.toHaveBeenCalled();
    });

    it('maps compare route to chat in the top bar and forwards shared view props', async () => {
        setActivePinia(createPinia());
        const navigateTo = vi.fn();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/compare',
                navigateTo,
                contextProvider: { id: 'ctx' },
                runtimeContext: createRuntimeContext(),
                contributionQuery: createContributionQuery({
                    chatComponent: {
                        props: ['contextProvider', 'showHistorySourceSwitch'],
                        template: `
                          <div
                            data-testid="conversation-workspace-stub"
                            :data-context-id="contextProvider?.id || ''"
                            :data-switch="String(showHistorySourceSwitch)"
                          />
                        `
                    }
                }),
                showHistorySourceSwitch: true
            },
            global: {
                stubs: {
                    AppTopBar: {
                        props: ['activeWorkspacePath', 'isCompareMode'],
                        template: '<div data-testid="topbar-stub" :data-path="activeWorkspacePath" :data-compare="String(isCompareMode)" />'
                    },
                    ConversationWorkspaceView: {
                        props: ['contextProvider', 'showHistorySourceSwitch'],
                        template: `
                          <div
                            data-testid="conversation-workspace-stub"
                            :data-context-id="contextProvider?.id || ''"
                            :data-switch="String(showHistorySourceSwitch)"
                          />
                        `
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        await flushPromises();

        expect(wrapper.get('[data-testid="topbar-stub"]').attributes('data-path')).toBe('/chat');
        expect(wrapper.get('[data-testid="topbar-stub"]').attributes('data-compare')).toBe('true');
        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-context-id')).toBe('ctx');
        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-switch')).toBe('true');
    });

    it('shows a global error banner when chatStore.currentError is set', async () => {
        setActivePinia(createPinia());
        const chatStore = useMockChatStore();
        chatStore.currentError = 'Backend request failed.';

        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo: vi.fn(),
                contextProvider: { id: 'ctx' },
                contributionQuery: createContributionQuery(),
                runtimeContext: createRuntimeContext()
            },
            global: {
                stubs: {
                    ConversationWorkspaceView: {
                        template: '<div data-testid="conversation-workspace-stub" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        await flushPromises();

        expect(wrapper.get('[data-testid="workspace-global-error"]').text()).toContain('Backend request failed.');
    });

    it('clears the global error banner when the close button is clicked', async () => {
        setActivePinia(createPinia());
        const chatStore = useMockChatStore();
        chatStore.currentError = 'Backend request failed.';

        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo: vi.fn(),
                contextProvider: { id: 'ctx' },
                contributionQuery: createContributionQuery(),
                runtimeContext: createRuntimeContext()
            },
            global: {
                stubs: {
                    ConversationWorkspaceView: {
                        template: '<div data-testid="conversation-workspace-stub" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="workspace-global-error-close"]').trigger('click');

        expect(chatStore.currentError).toBeNull();
        expect(wrapper.find('[data-testid="workspace-global-error"]').exists()).toBe(false);
    });
});
