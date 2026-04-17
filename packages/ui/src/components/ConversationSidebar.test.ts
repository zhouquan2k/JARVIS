// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Conversation, ExternalHistoryProviderEntry } from '@packages/core/src';
import ConversationSidebar from './ConversationSidebar.vue';

function createLocalConversation(id: string, title: string): Conversation {
    return {
        id,
        title,
        boundNodeName: 'docs',
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

    it('prefixes local history titles with the bound node name', () => {
        const wrapper = mount(ConversationSidebar, {
            props: {
                collapsed: false,
                historySource: 'local',
                localItems: [
                    {
                        ...createLocalConversation('local-1', '第一条会话'),
                        boundNodeName: 'docs'
                    }
                ],
                externalProviders,
                externalItems: [],
                externalHistoryLoading: false,
                externalHistoryQuery: '',
                activeExternalProviderId: 'chatgpt-web',
                isCompareMode: false
            }
        });

        expect(wrapper.get('[data-testid="local-history-item"]').text()).toContain('docs - 第一条会话');
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
        expect(wrapper.find('[data-testid="local-history-star"]').exists()).toBe(false);
        expect(wrapper.findAll('[data-testid="external-history-item"]')).toHaveLength(1);
    });

    it('emits toggle-local-star for local conversations and shows starred filter toggle', async () => {
        const wrapper = mount(ConversationSidebar, {
            props: {
                collapsed: false,
                historySource: 'local',
                localItems: [
                    {
                        ...createLocalConversation('local-1', '第一条会话'),
                        starred: true
                    }
                ],
                localConversationFilter: 'all',
                externalProviders,
                externalItems: [],
                externalHistoryLoading: false,
                externalHistoryQuery: '',
                activeExternalProviderId: 'chatgpt-web',
                isCompareMode: false
            }
        });

        expect(wrapper.find('[data-testid="local-history-filter-toggle"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('★');

        await wrapper.get('[data-testid="local-history-star"]').trigger('click');
        expect(wrapper.emitted('toggle-local-star')).toEqual([['local-1']]);
    });

    it('emits set-local-filter when toggling starred-only filter', async () => {
        const wrapper = mount(ConversationSidebar, {
            props: {
                collapsed: false,
                historySource: 'local',
                localItems: [createLocalConversation('local-1', '第一条会话')],
                localConversationFilter: 'all',
                externalProviders,
                externalItems: [],
                externalHistoryLoading: false,
                externalHistoryQuery: '',
                activeExternalProviderId: 'chatgpt-web',
                isCompareMode: false
            }
        });

        await wrapper.get('[data-testid="local-history-filter-toggle"]').trigger('click');
        expect(wrapper.emitted('set-local-filter')).toEqual([['starred']]);
    });

    it('emits set-local-filter back to all when starred-only filter is active', async () => {
        const wrapper = mount(ConversationSidebar, {
            props: {
                collapsed: false,
                historySource: 'local',
                localItems: [createLocalConversation('local-1', '第一条会话')],
                localConversationFilter: 'starred',
                externalProviders,
                externalItems: [],
                externalHistoryLoading: false,
                externalHistoryQuery: '',
                activeExternalProviderId: 'chatgpt-web',
                isCompareMode: false
            }
        });

        await wrapper.get('[data-testid="local-history-filter-toggle"]').trigger('click');
        expect(wrapper.emitted('set-local-filter')).toEqual([['all']]);
    });

    it('opens the local agent binding panel and emits bind-local-agent for the selected option', async () => {
        const wrapper = mount(ConversationSidebar, {
            props: {
                collapsed: false,
                historySource: 'local',
                localItems: [createLocalConversation('local-1', '第一条会话')],
                localConversationFilter: 'all',
                agentBindingOptions: [
                    { key: null, label: '不绑定', title: '保持为普通会话' },
                    { key: '/docs/', label: 'Docs Agent', title: '作用域：/docs' }
                ],
                externalProviders,
                externalItems: [],
                externalHistoryLoading: false,
                externalHistoryQuery: '',
                activeExternalProviderId: 'chatgpt-web',
                isCompareMode: false
            }
        });

        await wrapper.get('[data-testid="local-history-agent-binding"]').trigger('click');

        expect(wrapper.emitted('open-local-agent-binding')).toEqual([['local-1']]);
        expect(wrapper.find('[data-testid="local-history-star"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="local-history-delete"]').exists()).toBe(false);

        const optionButtons = wrapper.findAll('[data-testid="local-history-agent-option"]');
        expect(optionButtons).toHaveLength(2);
        expect((optionButtons[1].element as HTMLButtonElement).dataset.agentKey).toBe('/docs/');

        await optionButtons[1].trigger('click');

        expect(wrapper.emitted('bind-local-agent')).toEqual([
            [{ conversationId: 'local-1', agentKey: '/docs/' }]
        ]);
    });

    it('renders the bound agent label on local conversations', () => {
        const wrapper = mount(ConversationSidebar, {
            props: {
                collapsed: false,
                historySource: 'local',
                localItems: [
                    {
                        ...createLocalConversation('local-1', '第一条会话'),
                        agentKey: '/docs/'
                    }
                ],
                agentBindingOptions: [
                    { key: null, label: '不绑定', title: '保持为普通会话' },
                    { key: '/docs/', label: 'Docs Agent', title: '作用域：/docs' }
                ],
                externalProviders,
                externalItems: [],
                externalHistoryLoading: false,
                externalHistoryQuery: '',
                activeExternalProviderId: 'chatgpt-web',
                isCompareMode: false
            }
        });

        expect(wrapper.get('[data-testid="local-history-item"]').text()).toContain('Docs Agent');
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
