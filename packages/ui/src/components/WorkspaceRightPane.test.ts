// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import type { WorkspaceRuntimeContext } from '@packages/core/src';
import { contributionQueryKey, workspaceRuntimeContextKey } from '../plugins/injectionKeys';
import WorkspaceRightPane from './WorkspaceRightPane.vue';

const workspaceRightPaneContributionQuery = {
    getGlobalViews: () => [],
    getRightPanelTabs: () => [
        {
            id: 'tasks',
            title: 'Tasks',
            titleKey: 'shared.taskTab',
            component: { template: '<div data-testid="agent-task-panel" />' },
            defaultActive: true,
            getBadgeCount: () => 0
        },
        {
            id: 'conversations',
            title: 'Conversations',
            titleKey: 'shared.conversationTab',
            component: { template: '<div data-testid="agent-conversation-panel" />' },
            getBadgeCount: () => 1,
            shouldAutoActivate: (input: any) => !!input.openConversationId
        }
    ],
    getWorkspaceSelectionViews: () => [],
    getInsertLinkTypes: () => [],
    getDocumentCreationFlows: () => []
};

describe('WorkspaceRightPane', () => {
    it('defaults to task tab and switches between task and conversation tabs', async () => {
        setActivePinia(createPinia());
        const runtimeContext: WorkspaceRuntimeContext = {
            currentError: null,
            clearCurrentError: vi.fn(),
            beforeRouteNavigate: vi.fn(),
            publishWorkspaceSelectionChanged: vi.fn(async () => undefined),
            registerCurrentErrorSource: vi.fn(() => () => undefined),
            registerBeforeRouteNavigateHandler: vi.fn(() => () => undefined),
            registerWorkspaceSelectionChangedHandler: vi.fn(() => () => undefined),
            getPluginMessages: vi.fn(() => []),
            subscribePluginMessages: vi.fn(() => () => undefined),
            postPluginMessage: vi.fn(),
            postHostEvent: vi.fn(),
            subscribeHostEvent: vi.fn(() => () => undefined)
        };

        const wrapper = mount(WorkspaceRightPane, {
            props: {
                activeAgent: {
                    name: 'Docs Agent',
                    effectiveInstructions: 'Use docs context',
                    modelProviderName: 'gemini-api',
                    modelName: 'gemini-2.5-flash',
                    scopePath: '/docs',
                    sourcePaths: ['/docs/.agent.json']
                },
                activeAgentKey: '/docs/',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                contextProvider: {
                    id: 'ctx',
                    initializeAccess: vi.fn(),
                    getContext: vi.fn(),
                    getConversations: vi.fn(async () => []),
                    getTaskProvider: vi.fn(() => ({
                        getTasks: vi.fn(async () => []),
                        createTask: vi.fn(),
                        updateTask: vi.fn(),
                        deleteTask: vi.fn(),
                        setTaskCompleted: vi.fn()
                    })),
                    getProjectDocuments: vi.fn(),
                    readDocument: vi.fn(),
                    writeDocument: vi.fn(),
                    createNode: vi.fn(),
                    deleteNode: vi.fn(),
                    renameNode: vi.fn(),
                    searchInScope: vi.fn()
                } as any
            },
            global: {
                provide: {
                    [contributionQueryKey as symbol]: ref(workspaceRightPaneContributionQuery),
                    [workspaceRuntimeContextKey as symbol]: ref(runtimeContext)
                }
            }
        });

        await flushPromises();
        const tabs = wrapper.findAll('.workspace-right-pane__tab');
        expect(tabs).toHaveLength(2);
        expect(wrapper.find('[data-testid="agent-task-panel"]').exists()).toBe(true);

        await wrapper.get('[data-testid="workspace-right-pane-tab-tasks"]').trigger('click');
        expect(wrapper.find('[data-testid="agent-task-panel"]').exists()).toBe(true);

        await wrapper.get('[data-testid="workspace-right-pane-tab-conversations"]').trigger('click');
        expect(wrapper.find('[data-testid="agent-conversation-panel"]').exists()).toBe(true);
    });

    it('keeps the default task tab when there is no open conversation request', async () => {
        setActivePinia(createPinia());
        const runtimeContext: WorkspaceRuntimeContext = {
            currentError: null,
            clearCurrentError: vi.fn(),
            beforeRouteNavigate: vi.fn(),
            publishWorkspaceSelectionChanged: vi.fn(async () => undefined),
            registerCurrentErrorSource: vi.fn(() => () => undefined),
            registerBeforeRouteNavigateHandler: vi.fn(() => () => undefined),
            registerWorkspaceSelectionChangedHandler: vi.fn(() => () => undefined),
            getPluginMessages: vi.fn(() => []),
            subscribePluginMessages: vi.fn(() => () => undefined),
            postPluginMessage: vi.fn(),
            postHostEvent: vi.fn(),
            subscribeHostEvent: vi.fn(() => () => undefined)
        };

        const wrapper = mount(WorkspaceRightPane, {
            props: {
                activeAgentKey: '/docs/',
                showAgentConversationList: true,
                contextProvider: {
                    id: 'ctx',
                    initializeAccess: vi.fn(),
                    getContext: vi.fn(),
                    getConversations: vi.fn(async () => []),
                    getTaskProvider: vi.fn(() => ({
                        getTasks: vi.fn(async () => []),
                        createTask: vi.fn(),
                        updateTask: vi.fn(),
                        deleteTask: vi.fn(),
                        setTaskCompleted: vi.fn()
                    })),
                    getProjectDocuments: vi.fn(),
                    readDocument: vi.fn(),
                    writeDocument: vi.fn(),
                    createNode: vi.fn(),
                    deleteNode: vi.fn(),
                    renameNode: vi.fn(),
                    searchInScope: vi.fn()
                } as any
            },
            global: {
                provide: {
                    [contributionQueryKey as symbol]: ref(workspaceRightPaneContributionQuery),
                    [workspaceRuntimeContextKey as symbol]: ref(runtimeContext)
                }
            }
        });

        await flushPromises();

        expect(wrapper.find('[data-testid="agent-task-panel"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="agent-conversation-panel"]').exists()).toBe(false);
    });

    it('switches to the conversation tab when an open conversation request is provided', async () => {
        setActivePinia(createPinia());
        const runtimeContext: WorkspaceRuntimeContext = {
            currentError: null,
            clearCurrentError: vi.fn(),
            beforeRouteNavigate: vi.fn(),
            publishWorkspaceSelectionChanged: vi.fn(async () => undefined),
            registerCurrentErrorSource: vi.fn(() => () => undefined),
            registerBeforeRouteNavigateHandler: vi.fn(() => () => undefined),
            registerWorkspaceSelectionChangedHandler: vi.fn(() => () => undefined),
            getPluginMessages: vi.fn(() => []),
            subscribePluginMessages: vi.fn(() => () => undefined),
            postPluginMessage: vi.fn(),
            postHostEvent: vi.fn(),
            subscribeHostEvent: vi.fn(() => () => undefined)
        };

        const wrapper = mount(WorkspaceRightPane, {
            props: {
                activeAgentKey: '/docs/',
                showAgentConversationList: true,
                openConversationRequest: {
                    conversationId: 'conversation-1',
                    nonce: 1
                },
                contextProvider: {
                    id: 'ctx',
                    initializeAccess: vi.fn(),
                    getContext: vi.fn(),
                    getConversations: vi.fn(async () => []),
                    getTaskProvider: vi.fn(() => ({
                        getTasks: vi.fn(async () => []),
                        createTask: vi.fn(),
                        updateTask: vi.fn(),
                        deleteTask: vi.fn(),
                        setTaskCompleted: vi.fn()
                    })),
                    getProjectDocuments: vi.fn(),
                    readDocument: vi.fn(),
                    writeDocument: vi.fn(),
                    createNode: vi.fn(),
                    deleteNode: vi.fn(),
                    renameNode: vi.fn(),
                    searchInScope: vi.fn()
                } as any
            },
            global: {
                provide: {
                    [contributionQueryKey as symbol]: ref(workspaceRightPaneContributionQuery),
                    [workspaceRuntimeContextKey as symbol]: ref(runtimeContext)
                }
            }
        });

        await flushPromises();

        expect(wrapper.find('[data-testid="agent-task-panel"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="agent-conversation-panel"]').exists()).toBe(true);
    });
});
