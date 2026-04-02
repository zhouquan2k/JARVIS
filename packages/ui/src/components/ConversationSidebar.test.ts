// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Conversation, ExternalHistoryProviderEntry } from '@packages/core/src';
import ConversationSidebar from './ConversationSidebar.vue';

function createLocalConversation(id: string, title: string): Conversation {
    return {
        id,
        title,
        origin: 'local',
        updatedAt: 1,
        messages: []
    };
}

const externalProviders: ExternalHistoryProviderEntry[] = [
    {
        id: 'chatgpt-web',
        label: 'ChatGPT',
        kind: 'history-provider',
        features: {
            historySearch: true
        }
    }
];

describe('ConversationSidebar', () => {
    it('emits delete-local only after inline confirmation', async () => {
        const wrapper = mount(ConversationSidebar, {
            props: {
                collapsed: false,
                historySource: 'local',
                localItems: [createLocalConversation('local-1', '第一条会话')],
                externalProviders,
                externalItems: [],
                externalHistoryLoading: false,
                externalHistoryQuery: '',
                activeExternalProviderId: 'chatgpt-web',
                isCompareMode: false
            }
        });

        expect(wrapper.emitted('delete-local')).toBeUndefined();

        const deleteButton = wrapper.get('[data-testid="local-history-delete"]');
        expect(deleteButton.text()).toBe('x');

        await deleteButton.trigger('click');
        expect(wrapper.find('[data-testid="local-history-delete-confirm"]').exists()).toBe(true);

        await wrapper.get('[data-testid="local-history-delete-confirm"]').trigger('click');
        expect(wrapper.emitted('delete-local')).toEqual([['local-1']]);
    });

    it('does not render local delete actions in external history mode', () => {
        const wrapper = mount(ConversationSidebar, {
            props: {
                collapsed: false,
                historySource: 'external',
                localItems: [createLocalConversation('local-1', '第一条会话')],
                externalProviders,
                externalItems: [
                    {
                        id: 'remote-1',
                        title: '远端会话',
                        updatedAt: 1,
                        origin: 'chatgpt-web'
                    }
                ],
                externalHistoryLoading: false,
                externalHistoryQuery: '',
                activeExternalProviderId: 'chatgpt-web',
                isCompareMode: false
            }
        });

        expect(wrapper.find('[data-testid="local-history-delete"]').exists()).toBe(false);
        expect(wrapper.findAll('[data-testid="external-history-item"]')).toHaveLength(1);
    });

    it('renders the shared external history search box only for searchable providers', () => {
        const wrapper = mount(ConversationSidebar, {
            props: {
                collapsed: false,
                historySource: 'external',
                localItems: [],
                externalProviders: [
                    {
                        id: 'chatgpt-web',
                        label: 'ChatGPT',
                        kind: 'history-provider',
                        features: {
                            historySearch: true,
                            historySearchPlaceholder: '搜索 ChatGPT 历史'
                        }
                    },
                    {
                        id: 'external-file',
                        label: '外部文件导入',
                        kind: 'file-import'
                    }
                ],
                externalItems: [],
                externalHistoryLoading: false,
                externalHistoryQuery: 'incident',
                showExternalHistorySearch: true,
                externalHistorySearchPlaceholder: '搜索 ChatGPT 历史',
                activeExternalProviderId: 'chatgpt-web',
                isCompareMode: false
            }
        });

        expect(wrapper.find('[data-testid="external-history-search"]').exists()).toBe(true);
        expect((wrapper.get('[data-testid="external-history-search-input"]').element as HTMLInputElement).value).toBe('incident');
    });

    it('hides the shared external history search box for external-file provider', () => {
        const wrapper = mount(ConversationSidebar, {
            props: {
                collapsed: false,
                historySource: 'external',
                localItems: [],
                externalProviders: [
                    {
                        id: 'external-file',
                        label: '外部文件导入',
                        kind: 'file-import'
                    }
                ],
                externalItems: [],
                externalHistoryLoading: false,
                externalHistoryQuery: '',
                showExternalHistorySearch: false,
                activeExternalProviderId: 'external-file',
                isCompareMode: false
            }
        });

        expect(wrapper.find('[data-testid="external-history-search"]').exists()).toBe(false);
    });
});
