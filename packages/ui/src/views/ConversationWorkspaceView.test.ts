// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import type { Conversation, IContextProvider, WorkspaceContext } from '@packages/core/src';
import ConversationWorkspaceView from './ConversationWorkspaceView.vue';
import { useChatStore } from '../store/chat';

function createConversation(): Conversation {
    return {
        id: 'conversation-1',
        title: 'Workspace Question Index',
        origin: 'local',
        updatedAt: 10,
        messages: [
            {
                id: 'user-1',
                role: 'user',
                content: '第一条问题',
                questionId: 'question-1',
                createdAt: 1
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '第一条回答',
                questionId: 'question-1',
                createdAt: 2
            }
        ]
    };
}

function createWorkspaceContextProvider(context: WorkspaceContext): IContextProvider {
    return {
        id: 'workspace-context',
        initializeAccess: vi.fn().mockResolvedValue(undefined),
        getContext: vi.fn().mockResolvedValue(context),
        getConversations: vi.fn(),
        getProjectDocuments: vi.fn().mockResolvedValue([]),
        readDocument: vi.fn(),
        writeDocument: vi.fn(),
        createNode: vi.fn(),
        deleteNode: vi.fn(),
        renameNode: vi.fn(),
        searchInScope: vi.fn()
    } as unknown as IContextProvider;
}

function createDeferredContextProvider() {
    let resolveContext: ((value: WorkspaceContext) => void) | null = null;
    const contextPromise = new Promise<WorkspaceContext>((resolve) => {
        resolveContext = resolve;
    });
    const provider = {
        id: 'workspace-context',
        initializeAccess: vi.fn().mockResolvedValue(undefined),
        getContext: vi.fn().mockReturnValue(contextPromise),
        getConversations: vi.fn(),
        getProjectDocuments: vi.fn().mockResolvedValue([]),
        readDocument: vi.fn(),
        writeDocument: vi.fn(),
        createNode: vi.fn(),
        deleteNode: vi.fn(),
        renameNode: vi.fn(),
        searchInScope: vi.fn()
    } as unknown as IContextProvider;

    return { provider, resolveContext: resolveContext as NonNullable<typeof resolveContext> };
}

describe('ConversationWorkspaceView', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    function mountWorkspace(isCompareMode = false) {
        return mount(ConversationWorkspaceView, {
            props: {
                isCompareMode
            },
            global: {
                stubs: {
                    ConversationSidebar: {
                        template: '<div data-testid="sidebar-stub" />'
                    },
                    NormalChatView: {
                        props: [
                            'showQuestionIndex',
                            'authStatusOverride',
                            'authUnavailableMessage',
                            'authRecoveryActionLabel',
                            'authRecoveryActionDisabled'
                        ],
                        template: '<div data-testid="thread-stub" :data-show-question-index="String(showQuestionIndex)" :data-auth-status="String(authStatusOverride)" />'
                    },
                    CompareChatView: {
                        template: '<div data-testid="compare-stub" />'
                    }
                }
            }
        });
    }

    it('passes question index rendering to NormalChatView in normal mode', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation();
        store.workspaceMode = 'conversation';
        store.isQuestionIndexPanelOpen = true;

        const wrapper = mountWorkspace();
        expect(wrapper.get('[data-testid="thread-stub"]').attributes('data-show-question-index')).toBe('true');
        expect(wrapper.find('[data-testid="question-index-panel"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="question-panel-open"]').exists()).toBe(false);
    });

    it('registers the conversation execution context on the chat store while mounted', async () => {
        const store = useChatStore();
        const provider = createWorkspaceContextProvider({
            nodes: [],
            agentConfigs: {}
        });

        const wrapper = mount(ConversationWorkspaceView, {
            props: {
                isCompareMode: false,
                contextProvider: provider
            },
            global: {
                stubs: {
                    ConversationSidebar: {
                        template: '<div data-testid="sidebar-stub" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="thread-stub" />'
                    },
                    CompareChatView: {
                        template: '<div data-testid="compare-stub" />'
                    }
                }
            }
        });

        expect(store.conversationContextProvider).toBe(provider);
        expect(store.conversationOnFileChanged).toBeNull();

        wrapper.unmount();

        expect(store.conversationContextProvider).toBeNull();
        expect(store.conversationOnFileChanged).toBeNull();
    });

    it('forwards workspace switch requests from the normal chat view', async () => {
        const wrapper = mount(ConversationWorkspaceView, {
            props: {
                isCompareMode: false
            },
            global: {
                stubs: {
                    ConversationSidebar: {
                        template: '<div data-testid="sidebar-stub" />'
                    },
                    NormalChatView: {
                        template: '<button data-testid="thread-stub" @click="$emit(\'request-workspace-switch\', \'/\')" />'
                    },
                    CompareChatView: {
                        template: '<div data-testid="compare-stub" />'
                    }
                }
            }
        });

        await wrapper.get('[data-testid="thread-stub"]').trigger('click');
        expect(wrapper.emitted('request-workspace-switch')).toEqual([['/']]);
    });

    it('keeps the shared current conversation attached while switching workspace mode', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation();
        store.workspaceMode = 'conversation';
        store.isQuestionIndexPanelOpen = true;

        const wrapper = mount(ConversationWorkspaceView, {
            props: {
                isCompareMode: false
            },
            global: {
                stubs: {
                    ConversationSidebar: {
                        props: ['activeLocalId', 'activeExternalId'],
                        template: `
                          <div
                            data-testid="sidebar-stub"
                            :data-active-local="activeLocalId ?? ''"
                            :data-active-external="activeExternalId ?? ''"
                          />
                        `
                    },
                    NormalChatView: {
                        props: [
                            'showQuestionIndex',
                            'authStatusOverride',
                            'authUnavailableMessage',
                            'authRecoveryActionLabel',
                            'authRecoveryActionDisabled'
                        ],
                        template: '<div data-testid="thread-stub" :data-show-question-index="String(showQuestionIndex)" />'
                    },
                    CompareChatView: {
                        template: '<div data-testid="compare-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="sidebar-stub"]').attributes('data-active-local')).toBe('conversation-1');
        expect(wrapper.get('[data-testid="sidebar-stub"]').attributes('data-active-external')).toBe('');
        expect(store.currentConversation?.id).toBe('conversation-1');

        store.previewConversation = {
            id: 'preview-conversation',
            externalId: 'preview-conversation',
            title: 'Preview',
            origin: 'external-file',
            updatedAt: 12,
            messages: []
        };
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="sidebar-stub"]').attributes('data-active-local')).toBe('');
        expect(wrapper.get('[data-testid="sidebar-stub"]').attributes('data-active-external')).toBe('preview-conversation');
        expect(store.currentConversation?.id).toBe('conversation-1');
    });

    it('does not render normal chat shell affordances outside active normal chat', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation();
        store.isQuestionIndexPanelOpen = true;

        const previewWrapper = mountWorkspace();
        expect(previewWrapper.get('[data-testid="thread-stub"]').attributes('data-show-question-index')).toBe('true');

        store.workspaceMode = 'conversation';
        await previewWrapper.vm.$nextTick();
        previewWrapper.unmount();

        const compareWrapper = mountWorkspace(true);
        expect(compareWrapper.find('[data-testid="thread-stub"]').exists()).toBe(false);
        expect(compareWrapper.find('[data-testid="question-index-panel"]').exists()).toBe(false);
        expect(compareWrapper.find('[data-testid="question-panel-open"]').exists()).toBe(false);
    });

    it('routes sidebar delete events through the chat store', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation();
        store.workspaceMode = 'conversation';
        store.deleteLocalConversation = vi.fn().mockResolvedValue(undefined);

        const wrapper = mount(ConversationWorkspaceView, {
            props: {
                isCompareMode: false
            },
            global: {
                stubs: {
                    ConversationSidebar: {
                        template: '<button data-testid="sidebar-delete-stub" @click="$emit(\'delete-local\', \'conversation-1\')" />'
                    },
                    NormalChatView: {
                        props: [
                            'showQuestionIndex',
                            'authStatusOverride',
                            'authUnavailableMessage',
                            'authRecoveryActionLabel',
                            'authRecoveryActionDisabled'
                        ],
                        template: '<div data-testid="thread-stub" :data-show-question-index="String(showQuestionIndex)" />'
                    },
                    CompareChatView: {
                        template: '<div data-testid="compare-stub" />'
                    }
                }
            }
        });

        await wrapper.get('[data-testid="sidebar-delete-stub"]').trigger('click');
        expect(store.deleteLocalConversation).toHaveBeenCalledWith('conversation-1');
    });

    it('passes local starred filter state and routes sidebar star events through the chat store', async () => {
        const store = useChatStore();
        store.localConversationFilter = 'starred';
        store.conversations = [{
            ...createConversation(),
            starred: true
        }];
        store.toggleConversationStar = vi.fn().mockResolvedValue(undefined);

        const wrapper = mount(ConversationWorkspaceView, {
            props: {
                isCompareMode: false
            },
            global: {
                stubs: {
                    ConversationSidebar: {
                        props: ['localItems', 'localConversationFilter'],
                        template: `
                          <button
                            data-testid="sidebar-star-stub"
                            :data-local-count="localItems.length"
                            :data-filter="localConversationFilter"
                            @click="$emit('toggle-local-star', 'conversation-1')"
                          />
                        `
                    },
                    NormalChatView: {
                        props: [
                            'showQuestionIndex',
                            'authStatusOverride',
                            'authUnavailableMessage',
                            'authRecoveryActionLabel',
                            'authRecoveryActionDisabled'
                        ],
                        template: '<div data-testid="thread-stub" :data-show-question-index="String(showQuestionIndex)" />'
                    },
                    CompareChatView: {
                        template: '<div data-testid="compare-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="sidebar-star-stub"]').attributes('data-filter')).toBe('starred');
        expect(wrapper.get('[data-testid="sidebar-star-stub"]').attributes('data-local-count')).toBe('1');

        await wrapper.get('[data-testid="sidebar-star-stub"]').trigger('click');
        expect(store.toggleConversationStar).toHaveBeenCalledWith('conversation-1');
    });

    it('lazily loads agent binding options when the binding panel opens', async () => {
        const { provider, resolveContext } = createDeferredContextProvider();

        const wrapper = mount(ConversationWorkspaceView, {
            props: {
                isCompareMode: false,
                contextProvider: provider
            },
            global: {
                stubs: {
                    ConversationSidebar: {
                        props: ['agentBindingOptions', 'agentBindingLoading', 'agentBindingError'],
                        template: `
                          <div
                            data-testid="sidebar-binding-stub"
                            :data-loading="String(agentBindingLoading)"
                            :data-error="agentBindingError || ''"
                            :data-options="String(agentBindingOptions.length)"
                            @click="$emit('open-local-agent-binding', 'conversation-1')"
                          />
                        `
                    },
                    NormalChatView: {
                        props: [
                            'showQuestionIndex',
                            'authStatusOverride',
                            'authUnavailableMessage',
                            'authRecoveryActionLabel',
                            'authRecoveryActionDisabled'
                        ],
                        template: '<div data-testid="thread-stub" :data-show-question-index="String(showQuestionIndex)" />'
                    },
                    CompareChatView: {
                        template: '<div data-testid="compare-stub" />'
                    }
                }
            }
        });

        await wrapper.get('[data-testid="sidebar-binding-stub"]').trigger('click');

        expect(provider.initializeAccess).toHaveBeenCalledTimes(1);
        expect(provider.getContext).toHaveBeenCalledTimes(1);
        expect(wrapper.get('[data-testid="sidebar-binding-stub"]').attributes('data-loading')).toBe('true');

        resolveContext({
            nodes: [],
            agentConfigs: {
                '/': {
                    name: 'Default Agent',
                    scopePath: '/',
                    sourcePaths: ['/.agent.json'],
                    effectiveInstructions: '',
                    description: 'root'
                },
                '/docs/': {
                    name: 'Docs Agent',
                    scopePath: '/docs/',
                    sourcePaths: ['/docs/.agent.json'],
                    effectiveInstructions: '',
                    description: 'docs'
                }
            }
        });
        await flushPromises();

        expect(wrapper.get('[data-testid="sidebar-binding-stub"]').attributes('data-loading')).toBe('false');
        expect(wrapper.get('[data-testid="sidebar-binding-stub"]').attributes('data-options')).toBe('3');
        expect(wrapper.get('[data-testid="sidebar-binding-stub"]').attributes('data-error')).toBe('');
    });

    it('surfaces agent binding provider errors in the sidebar props', async () => {
        const provider = createWorkspaceContextProvider({
            nodes: [],
            agentConfigs: {
                '/': {
                    name: 'Default Agent',
                    scopePath: '/',
                    sourcePaths: ['/.agent.json'],
                    effectiveInstructions: '',
                    description: 'root'
                }
            }
        });
        vi.mocked(provider.getContext).mockRejectedValueOnce(new Error('load failed'));

        const wrapper = mount(ConversationWorkspaceView, {
            props: {
                isCompareMode: false,
                contextProvider: provider
            },
            global: {
                stubs: {
                    ConversationSidebar: {
                        props: ['agentBindingOptions', 'agentBindingLoading', 'agentBindingError'],
                        template: `
                          <div
                            data-testid="sidebar-binding-error-stub"
                            :data-loading="String(agentBindingLoading)"
                            :data-error="agentBindingError || ''"
                            :data-options="String(agentBindingOptions.length)"
                            @click="$emit('open-local-agent-binding', 'conversation-1')"
                          />
                        `
                    },
                    NormalChatView: {
                        props: [
                            'showQuestionIndex',
                            'authStatusOverride',
                            'authUnavailableMessage',
                            'authRecoveryActionLabel',
                            'authRecoveryActionDisabled'
                        ],
                        template: '<div data-testid="thread-stub" :data-show-question-index="String(showQuestionIndex)" />'
                    },
                    CompareChatView: {
                        template: '<div data-testid="compare-stub" />'
                    }
                }
            }
        });

        await wrapper.get('[data-testid="sidebar-binding-error-stub"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="sidebar-binding-error-stub"]').attributes('data-loading')).toBe('false');
        expect(wrapper.get('[data-testid="sidebar-binding-error-stub"]').attributes('data-options')).toBe('0');
        expect(wrapper.get('[data-testid="sidebar-binding-error-stub"]').attributes('data-error')).toBe('load failed');
    });

    it('routes bind-local-agent events through the chat store', async () => {
        const store = useChatStore();
        store.bindConversationToAgent = vi.fn().mockResolvedValue(undefined);

        const wrapper = mount(ConversationWorkspaceView, {
            props: {
                isCompareMode: false
            },
            global: {
                stubs: {
                    ConversationSidebar: {
                        template: '<button data-testid="sidebar-bind-stub" @click="$emit(\'bind-local-agent\', { conversationId: \'conversation-1\', agentKey: \'/docs/\' })" />'
                    },
                    NormalChatView: {
                        props: [
                            'showQuestionIndex',
                            'authStatusOverride',
                            'authUnavailableMessage',
                            'authRecoveryActionLabel',
                            'authRecoveryActionDisabled'
                        ],
                        template: '<div data-testid="thread-stub" :data-show-question-index="String(showQuestionIndex)" />'
                    },
                    CompareChatView: {
                        template: '<div data-testid="compare-stub" />'
                    }
                }
            }
        });

        await wrapper.get('[data-testid="sidebar-bind-stub"]').trigger('click');
        expect(store.bindConversationToAgent).toHaveBeenCalledWith('conversation-1', '/docs/');
    });
});
