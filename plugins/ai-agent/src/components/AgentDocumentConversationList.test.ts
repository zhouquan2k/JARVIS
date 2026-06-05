// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Conversation } from '@plugins/ai-agent/src/internal';
import AgentDocumentConversationList from './AgentDocumentConversationList.vue';

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
    return {
        id: 'conversation-1',
        title: 'Shared Conversation',
        origin: 'local',
        updatedAt: 1,
        messages: [],
        ...overrides
    };
}

describe('AgentDocumentConversationList', () => {
    it('emits open when clicking a conversation item', async () => {
        const wrapper = mount(AgentDocumentConversationList, {
            props: {
                conversations: [createConversation()]
            }
        });

        await wrapper.get('[data-testid="agent-document-conversation-item"]').trigger('click');

        expect(wrapper.emitted('open')).toEqual([['conversation-1']]);
    });

    it('shows inline editor for the editing conversation and emits rename', async () => {
        const wrapper = mount(AgentDocumentConversationList, {
            props: {
                conversations: [createConversation()],
                editingConversationId: 'conversation-1'
            }
        });

        expect(wrapper.get('[data-testid="agent-document-conversation-rename-form"]').exists()).toBe(true);
        await wrapper.get('[data-testid="agent-document-conversation-rename-input"]').setValue('新标题');
        await wrapper.get('[data-testid="agent-document-conversation-rename-confirm"]').trigger('click');

        expect(wrapper.emitted('rename')).toEqual([[{ id: 'conversation-1', title: '新标题' }]]);
    });

    it('emits cancel-rename when cancelling inline edit', async () => {
        const wrapper = mount(AgentDocumentConversationList, {
            props: {
                conversations: [createConversation()],
                editingConversationId: 'conversation-1'
            }
        });

        await wrapper.get('[data-testid="agent-document-conversation-rename-cancel"]').trigger('click');

        expect(wrapper.emitted('cancel-rename')).toEqual([[]]);
    });

    it('shows document label when enabled for agent-scoped list items', () => {
        const wrapper = mount(AgentDocumentConversationList, {
            props: {
                conversations: [createConversation({
                    documentPaths: ['/docs/guide.md']
                })],
                showDocumentLabel: true
            }
        });

        expect(wrapper.get('[data-testid="agent-document-conversation-label"]').text()).toBe('guide');
    });

    it('does not show document label when disabled', () => {
        const wrapper = mount(AgentDocumentConversationList, {
            props: {
                conversations: [createConversation({
                    documentPaths: ['/docs/guide.md']
                })],
                showDocumentLabel: false
            }
        });

        expect(wrapper.find('[data-testid="agent-document-conversation-label"]').exists()).toBe(false);
    });

    it('falls back to archive document path and bound node name for document labels', () => {
        const archiveWrapper = mount(AgentDocumentConversationList, {
            props: {
                conversations: [createConversation({
                    documentPaths: undefined,
                    archive: {
                        documentPath: '/archive/history.md',
                        archivedAt: 1,
                        sourceMessageCount: 1
                    }
                })],
                showDocumentLabel: true
            }
        });

        expect(archiveWrapper.get('[data-testid="agent-document-conversation-label"]').text()).toBe('history');

        const boundNodeWrapper = mount(AgentDocumentConversationList, {
            props: {
                conversations: [createConversation({
                    documentPaths: undefined,
                    boundNodeName: 'notes.md'
                })],
                showDocumentLabel: true
            }
        });

        expect(boundNodeWrapper.get('[data-testid="agent-document-conversation-label"]').text()).toBe('notes');
    });

    it('focuses and selects the full title when rename starts', async () => {
        const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus').mockImplementation(() => {});
        const selectionSpy = vi.spyOn(HTMLInputElement.prototype, 'setSelectionRange').mockImplementation(() => {});

        try {
            const wrapper = mount(AgentDocumentConversationList, {
                props: {
                    conversations: [createConversation({
                        title: '完整标题'
                    })]
                }
            });

            await wrapper.setProps({
                editingConversationId: 'conversation-1'
            });
            await wrapper.vm.$nextTick();

            expect(focusSpy).toHaveBeenCalled();
            expect(selectionSpy).toHaveBeenCalledWith(0, '完整标题'.length);
        } finally {
            focusSpy.mockRestore();
            selectionSpy.mockRestore();
        }
    });
});
