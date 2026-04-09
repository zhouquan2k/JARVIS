// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import type { Conversation, IContextProvider } from '@packages/core/src';
import AgentConversationPanel from './AgentConversationPanel.vue';
import { useChatStore } from '../store/chat';

function createContextProvider(): IContextProvider {
    return {
        id: 'agent-panel-context',
        initializeAccess: vi.fn().mockResolvedValue(undefined),
        getContext: vi.fn().mockResolvedValue({ nodes: [], agentConfigs: {} }),
        getConversations: vi.fn().mockResolvedValue([]),
        readDocument: vi.fn(),
        writeDocument: vi.fn(),
        createNode: vi.fn(),
        deleteNode: vi.fn(),
        renameNode: vi.fn(),
        searchInScope: vi.fn()
    } as unknown as IContextProvider;
}

describe('AgentConversationPanel', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('emits a workspace switch request when expanding to chat mode', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            updatedAt: 1,
            messages: []
        };

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createContextProvider()
            },
            global: {
                stubs: {
                    AgentDocumentConversationList: {
                        template: '<div data-testid="agent-document-conversation-list-stub" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-conversation-expand"]').trigger('click');

        expect(wrapper.emitted('request-workspace-switch')).toEqual([['/chat']]);
    });

    it('restores the previous conversation detail when returning from chat mode on an agent directory', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            updatedAt: 1,
            messages: []
        };

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createContextProvider(),
                restoreConversationId: 'conversation-1'
            },
            global: {
                stubs: {
                    AgentDocumentConversationList: {
                        template: '<div data-testid="agent-document-conversation-list-stub" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="agent-conversation-toolbar"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toContain('Shared Conversation');
        expect(wrapper.find('[data-testid="agent-document-conversation-list-stub"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="normal-chat-stub"]').exists()).toBe(true);
    });

    it('keeps the agent directory list as the default when no restore id is provided', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            updatedAt: 1,
            messages: []
        };

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createContextProvider()
            },
            global: {
                stubs: {
                    AgentDocumentConversationList: {
                        template: '<div data-testid="agent-document-conversation-list-stub" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="agent-document-conversation-list-stub"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="normal-chat-stub"]').exists()).toBe(false);
    });

    it('switches to the conversation detail when the restore id arrives after mount', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            updatedAt: 1,
            messages: []
        };

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createContextProvider(),
                restoreConversationId: null
            },
            global: {
                stubs: {
                    AgentDocumentConversationList: {
                        template: '<div data-testid="agent-document-conversation-list-stub" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();
        expect(wrapper.get('[data-testid="agent-document-conversation-list-stub"]').exists()).toBe(true);

        await wrapper.setProps({ restoreConversationId: 'conversation-1' });
        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="agent-conversation-toolbar"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toContain('Shared Conversation');
        expect(wrapper.find('[data-testid="agent-document-conversation-list-stub"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="normal-chat-stub"]').exists()).toBe(true);
    });
});
