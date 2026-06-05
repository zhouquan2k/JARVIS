// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import type { Conversation } from '@plugins/ai-agent/src/internal';
import QuestionIndexPanel from './QuestionIndexPanel.vue';
import { useChatStore } from '../store/chat';

function createConversation(): Conversation {
    return {
        id: 'conversation-1',
        title: 'Question index',
        origin: 'local',
        updatedAt: 10,
        messages: [
            {
                id: 'user-1',
                role: 'user',
                content: '第一条问题\n补充说明',
                questionId: 'question-1',
                starred: true,
                createdAt: 1
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '第一条回答',
                questionId: 'question-1',
                createdAt: 2
            },
            {
                id: 'user-2',
                role: 'user',
                content: '第二条问题',
                questionId: 'question-2',
                createdAt: 3
            },
            {
                id: 'assistant-2',
                role: 'assistant',
                content: '第二条回答',
                questionId: 'question-2',
                createdAt: 4
            }
        ]
    };
}

describe('QuestionIndexPanel', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('filters starred questions and toggles star state from the panel', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation();

        const wrapper = mount(QuestionIndexPanel);
        expect(wrapper.get('h3').text()).toBe('Show outline');
        expect(wrapper.get('[data-testid="question-panel-close"]').attributes('aria-label')).toBe('Close question panel');
        expect(wrapper.findAll('[data-testid="question-item"]')).toHaveLength(2);
        expect(wrapper.text()).toContain('第一条问题');
        expect(wrapper.text()).not.toContain('补充说明');

        await wrapper.get('[data-testid="question-filter-starred"]').trigger('click');
        expect(wrapper.findAll('[data-testid="question-item"]')).toHaveLength(1);

        const row = wrapper.get('[data-testid="question-item"]');
        await row.get('[data-testid="question-star"]').trigger('click');

        expect(store.currentConversation?.messages[0]?.starred).toBe(false);
        expect(wrapper.findAll('[data-testid="question-item"]')).toHaveLength(0);
        expect(wrapper.get('[data-testid="question-index-empty"]').text()).toContain('No starred questions.');
    });

    it('closes the panel from the compact title bar', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation();
        store.isQuestionIndexPanelOpen = true;

        const wrapper = mount(QuestionIndexPanel);
        await wrapper.get('[data-testid="question-panel-close"]').trigger('click');

        expect(store.isQuestionIndexPanelOpen).toBe(false);
    });

    it('confirms delete inline and keeps the active question highlighted', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation();
        store.activeQuestionId = 'question-2';

        const wrapper = mount(QuestionIndexPanel);
        const rows = wrapper.findAll('[data-testid="question-item"]');
        expect(rows[1].classes()).toContain('active');

        await rows[0].get('[data-testid="question-delete"]').trigger('click');
        expect(rows[0].find('[data-testid="question-delete-confirm"]').exists()).toBe(true);

        await rows[0].get('[data-testid="question-delete-confirm"]').trigger('click');

        expect(store.visibleMessages.map((message) => message.id)).toEqual(['user-2', 'assistant-2']);
        const remainingRows = wrapper.findAll('[data-testid="question-item"]');
        expect(remainingRows).toHaveLength(1);
        expect(remainingRows[0].classes()).toContain('active');
        expect(remainingRows[0].text()).toContain('第二条问题');
    });
});
