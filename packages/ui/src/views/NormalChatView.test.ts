// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import type { Conversation } from '@packages/core/src';
import NormalChatView from './NormalChatView.vue';
import { useChatStore } from '../store/chat';

function createConversation(messages: Conversation['messages']): Conversation {
    return {
        id: 'conversation-1',
        title: 'Normal Chat Workspace',
        origin: 'local',
        updatedAt: 10,
        messages
    };
}

function mountView() {
    return mount(NormalChatView, {
        props: {
            showQuestionIndex: true
        },
        global: {
            stubs: {
                AttachmentComposer: {
                    template: '<div data-testid="attachment-composer-stub" />'
                },
                ProviderModelSelector: {
                    template: '<div data-testid="provider-selector-stub" />'
                },
                MessageAttachmentStrip: {
                    template: '<div data-testid="attachment-strip-stub" />'
                },
                MarkdownContent: {
                    props: ['source'],
                    template: '<div data-testid="markdown-stub">{{ source }}</div>'
                },
                QuestionIndexPanel: {
                    template: '<aside data-testid="question-index-panel">panel</aside>'
                }
            }
        }
    });
}

describe('NormalChatView', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('renders question index controls inside the normal chat layout', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation([
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
        ]);
        store.workspaceMode = 'active';
        store.isQuestionIndexPanelOpen = true;
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="question-index-panel"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="question-panel-open"]').exists()).toBe(false);
        expect(wrapper.find('.chat-container > .chat-main').exists()).toBe(true);
        expect(wrapper.find('.chat-container > .chat-inputarea').exists()).toBe(true);
        expect(wrapper.find('.chat-main .chat-inputarea').exists()).toBe(false);

        store.setQuestionIndexPanelOpen(false);
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="question-index-panel"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="question-panel-open"]').text()).toContain('显示大纲');
    });

    it('hides question index affordances while previewing', async () => {
        const store = useChatStore();
        store.previewConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '预览问题',
                questionId: 'preview-question-1',
                createdAt: 1
            }
        ]);
        store.workspaceMode = 'preview';
        store.isQuestionIndexPanelOpen = true;
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="question-index-panel"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="question-panel-open"]').exists()).toBe(false);
    });

    it('hides question index affordances when there are no user questions', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation([
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '只有回答，没有问题',
                createdAt: 1
            }
        ]);
        store.workspaceMode = 'active';
        store.isQuestionIndexPanelOpen = true;
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="question-index-panel"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="question-panel-open"]').exists()).toBe(false);
    });
});
