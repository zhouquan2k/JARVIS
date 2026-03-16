// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import type { Conversation } from '@packages/core/src';
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
                        props: ['showQuestionIndex'],
                        template: '<div data-testid="thread-stub" :data-show-question-index="String(showQuestionIndex)" />'
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
        store.workspaceMode = 'active';
        store.isQuestionIndexPanelOpen = true;

        const wrapper = mountWorkspace();
        expect(wrapper.get('[data-testid="thread-stub"]').attributes('data-show-question-index')).toBe('true');
        expect(wrapper.find('[data-testid="question-index-panel"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="question-panel-open"]').exists()).toBe(false);
    });

    it('does not render normal chat shell affordances outside active normal chat', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation();
        store.workspaceMode = 'preview';
        store.isQuestionIndexPanelOpen = true;

        const previewWrapper = mountWorkspace();
        expect(previewWrapper.get('[data-testid="thread-stub"]').attributes('data-show-question-index')).toBe('true');

        store.workspaceMode = 'active';
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
        store.workspaceMode = 'active';
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
                        props: ['showQuestionIndex'],
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
});
