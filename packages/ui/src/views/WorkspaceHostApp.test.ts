// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WorkspaceHostApp from './WorkspaceHostApp.vue';
import { useChatStore } from '../store/chat';
import { useCompareStore } from '../store/compare';
import { useDocumentWorkspaceStore } from '../store/documentWorkspace';

describe('WorkspaceHostApp', () => {
    it('saves the Agent view state and collapses the sidebar before entering chat mode', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const documentStore = useDocumentWorkspaceStore();
        documentStore.selectedNodePath = '/docs';
        documentStore.activePath = '/docs/guide.md';
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
                contextProvider: { id: 'ctx' }
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<button data-testid="go-chat" @click="$emit(\'navigate-workspace\', \'/chat\')">go</button>'
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
        expect(chatStore.sidebarCollapsed).toBe(true);
        expect(navigateTo).toHaveBeenCalledWith('/chat');

        await wrapper.setProps({ currentRoutePath: '/chat' });
        await flushPromises();

        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-context-id')).toBe('ctx');
        expect(chatStore.workspaceMode).toBe('conversation');
    });

    it('does not resave the Agent snapshot when navigating to the current workspace', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const saveSpy = vi.spyOn(chatStore, 'saveAgentViewStatus');
        const navigateTo = vi.fn();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo,
                contextProvider: { id: 'ctx' }
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<button data-testid="go-chat" @click="$emit(\'navigate-workspace\', \'/chat\')">go</button>'
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
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/',
                navigateTo,
                contextProvider: { id: 'ctx' }
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

        expect(navigateTo).toHaveBeenCalledWith('/chat');
    });

    it('navigates back to knowledge mode from the chat restore button', async () => {
        setActivePinia(createPinia());
        const navigateTo = vi.fn();
        const chatStore = useChatStore();
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
                contextProvider: { id: 'ctx' }
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

        expect(chatStore.workspaceAgentContext?.name).toBe('Docs Agent');
        expect(chatStore.workspaceMode).toBe('agent');
        expect(navigateTo).toHaveBeenCalledWith('/');
    });

    it('renders the all-tasks workspace for the dedicated route', async () => {
        setActivePinia(createPinia());
        const navigateTo = vi.fn();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/all-tasks',
                navigateTo,
                contextProvider: { id: 'ctx' }
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
                contextProvider: { id: 'ctx' }
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

    it('maps compare route to chat in the top bar and forwards recovery props', async () => {
        setActivePinia(createPinia());
        const compareStore = useCompareStore();
        compareStore.stage = 'analyzing';
        const navigateTo = vi.fn();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/compare',
                navigateTo,
                contextProvider: { id: 'ctx' },
                showHistorySourceSwitch: true,
                authStatusOverride: false,
                authUnavailableMessage: 'auth-msg',
                authRecoveryActionLabel: 'login',
                authRecoveryActionDisabled: true,
                hostRecoveryMessage: 'host-msg',
                hostRecoveryActionLabel: 'host-login',
                hostRecoveryActionDisabled: true
            },
            global: {
                stubs: {
                    AppTopBar: {
                        props: ['activeWorkspacePath', 'isCompareMode', 'compareStage'],
                        template: '<div data-testid="topbar-stub" :data-path="activeWorkspacePath" :data-compare="String(isCompareMode)" :data-stage="compareStage" />'
                    },
                    ConversationWorkspaceView: {
                        props: ['contextProvider', 'showHistorySourceSwitch', 'authStatusOverride', 'authUnavailableMessage', 'authRecoveryActionLabel', 'authRecoveryActionDisabled', 'hostRecoveryMessage', 'hostRecoveryActionLabel', 'hostRecoveryActionDisabled'],
                        template: `
                          <div
                            data-testid="conversation-workspace-stub"
                            :data-context-id="contextProvider?.id || ''"
                            :data-switch="String(showHistorySourceSwitch)"
                            :data-auth-status="authStatusOverride === null ? 'null' : String(authStatusOverride)"
                            :data-auth-message="authUnavailableMessage || ''"
                            :data-auth-label="authRecoveryActionLabel || ''"
                            :data-auth-disabled="String(authRecoveryActionDisabled)"
                            :data-host-message="hostRecoveryMessage || ''"
                            :data-host-label="hostRecoveryActionLabel || ''"
                            :data-host-disabled="String(hostRecoveryActionDisabled)"
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
        expect(wrapper.get('[data-testid="topbar-stub"]').attributes('data-stage')).toBe('analyzing');
        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-context-id')).toBe('ctx');
        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-switch')).toBe('true');
        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-auth-status')).toBe('false');
        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-auth-message')).toBe('auth-msg');
        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-host-message')).toBe('host-msg');
    });

    it('shows a global error banner when chatStore.currentError is set', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        chatStore.currentError = 'Backend request failed.';

        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo: vi.fn(),
                contextProvider: { id: 'ctx' }
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
        const chatStore = useChatStore();
        chatStore.currentError = 'Backend request failed.';

        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo: vi.fn(),
                contextProvider: { id: 'ctx' }
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
