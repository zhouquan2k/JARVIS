// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AgentRightPane from './AgentRightPane.vue';
import { useChatStore } from '../store/chat';

describe('AgentRightPane', () => {
    it('defaults to task tab and switches between task and conversation tabs while preserving workspace context sync', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();

        const wrapper = mount(AgentRightPane, {
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
            }
        });

        await flushPromises();
        expect(chatStore.activeWorkspaceAgentKey).toBe('/docs/');
        const tabs = wrapper.findAll('.agent-right-pane__tab');
        expect(tabs).toHaveLength(2);
        expect(wrapper.find('[data-testid="agent-task-panel"]').exists()).toBe(true);

        await wrapper.get('[data-testid="agent-right-pane-tab-tasks"]').trigger('click');
        expect(wrapper.find('[data-testid="agent-task-panel"]').exists()).toBe(true);

        await wrapper.get('[data-testid="agent-right-pane-tab-conversations"]').trigger('click');
        expect(wrapper.find('[data-testid="agent-conversation-panel"]').exists()).toBe(true);
    });
});
