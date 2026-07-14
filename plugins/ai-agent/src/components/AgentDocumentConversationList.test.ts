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

    it('reveals a swipe delete action on narrow viewports that enters the confirm step', async () => {
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = ((query: string) => ({
            matches: true,
            media: query,
            onchange: null,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => false
        })) as unknown as typeof window.matchMedia;

        try {
            const wrapper = mount(AgentDocumentConversationList, {
                props: {
                    conversations: [createConversation()]
                }
            });

            const swipeDelete = wrapper.get('[data-testid="agent-document-conversation-swipe-delete"]');
            expect(wrapper.emitted('delete')).toBeUndefined();

            await swipeDelete.trigger('click');
            expect(wrapper.emitted('delete')).toBeUndefined();
            expect(wrapper.find('[data-testid="agent-document-conversation-delete-confirm"]').exists()).toBe(true);

            await wrapper.get('[data-testid="agent-document-conversation-delete-confirm"]').trigger('click');
            expect(wrapper.emitted('delete')).toEqual([['conversation-1']]);
        } finally {
            window.matchMedia = originalMatchMedia;
        }
    });

    it('hides the desktop delete button on narrow viewports, leaving only swipe delete', async () => {
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = ((query: string) => ({
            matches: true,
            media: query,
            onchange: null,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => false
        })) as unknown as typeof window.matchMedia;

        try {
            const wrapper = mount(AgentDocumentConversationList, {
                props: {
                    conversations: [createConversation()]
                }
            });

            expect(wrapper.find('[data-testid="agent-document-conversation-delete"]').exists()).toBe(false);
            expect(wrapper.find('[data-testid="agent-document-conversation-swipe-delete"]').exists()).toBe(true);
        } finally {
            window.matchMedia = originalMatchMedia;
        }
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
