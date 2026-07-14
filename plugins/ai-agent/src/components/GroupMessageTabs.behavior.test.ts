// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createWorkspaceI18n } from '@packages/ui';
import GroupMessageTabs from './GroupMessageTabs.vue';
import type { GroupMemberPart, GroupSummaryPart } from '../interfaces/Conversation';

function mountTabs(input: {
    messageId?: string;
    groupMembers: GroupMemberPart[];
    groupSummary?: GroupSummaryPart;
}) {
    setActivePinia(createPinia());
    const i18n = createWorkspaceI18n({
        storage: { getItem: () => 'zh-CN', setItem: () => {} }
    });
    return mount(GroupMessageTabs, {
        props: { messageId: 'test-message', ...input },
        global: { plugins: [i18n] }
    });
}

describe('GroupMessageTabs behavior', () => {
    it('defaults to the first member while streaming and auto-switches to summary when done', async () => {
        const wrapper = mountTabs({
            groupMembers: [
                { name: 'ChatGPT', providerId: 'chatgpt-codex', modelId: 'auto', content: 'A', status: 'done' },
                { name: 'Gemini', providerId: 'gemini-api', modelId: 'pro', content: 'B', status: 'streaming' }
            ],
            groupSummary: {
                phase: 'streaming',
                content: '## Consensus\n整理中'
            }
        });

        expect(wrapper.get('[data-testid="group-tab-ChatGPT"]').attributes('aria-selected')).toBe('true');

        await wrapper.setProps({
            groupSummary: {
                phase: 'done',
                content: '## Consensus\n已完成\n\n## Complementary\n@ChatGPT 补充\n\n## Conflicts\n无'
            }
        });
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="group-tab-summary"]').attributes('aria-selected')).toBe('true');
    });

    it('respects manual tab selection and does not auto-switch on completion', async () => {
        const wrapper = mountTabs({
            groupMembers: [
                { name: 'ChatGPT', providerId: 'chatgpt-codex', modelId: 'auto', content: 'A', status: 'done' },
                { name: 'Gemini', providerId: 'gemini-api', modelId: 'pro', content: 'B', status: 'streaming' }
            ],
            groupSummary: {
                phase: 'streaming',
                content: '## Consensus\n整理中'
            }
        });

        await wrapper.get('[data-testid="group-tab-Gemini"]').trigger('click');
        await wrapper.setProps({
            groupSummary: {
                phase: 'done',
                content: '## Consensus\n已完成\n\n## Complementary\n@Gemini 补充\n\n## Conflicts\n无'
            }
        });
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="group-tab-Gemini"]').attributes('aria-selected')).toBe('true');
    });

    it('persists the selected tab to the store and restores it on remount', async () => {
        const pinia = createPinia();
        setActivePinia(pinia);
        const i18n = createWorkspaceI18n({ storage: { getItem: () => 'zh-CN', setItem: () => {} } });
        const props = {
            messageId: 'msg-1',
            groupMembers: [
                { name: 'ChatGPT', providerId: 'chatgpt-codex', modelId: 'auto', content: 'A', status: 'done' },
                { name: 'Gemini', providerId: 'gemini-api', modelId: 'pro', content: 'B', status: 'done' }
            ],
            groupSummary: { phase: 'done', content: '## Consensus\n done' }
        } as const;

        const first = mount(GroupMessageTabs, { props, global: { plugins: [pinia, i18n] } });
        await first.get('[data-testid="group-tab-Gemini"]').trigger('click');
        first.unmount();

        // Re-mount the same message id (simulates workspace/conversation view switch).
        const second = mount(GroupMessageTabs, { props, global: { plugins: [pinia, i18n] } });
        await second.vm.$nextTick();

        expect(second.get('[data-testid="group-tab-Gemini"]').attributes('aria-selected')).toBe('true');
    });

    it('clicking a member mention in summary switches to the member tab', async () => {
        const wrapper = mountTabs({
            groupMembers: [
                { name: 'ChatGPT', providerId: 'chatgpt-codex', modelId: 'auto', content: 'A', status: 'done' },
                { name: 'Gemini', providerId: 'gemini-api', modelId: 'pro', content: 'B', status: 'done' }
            ],
            groupSummary: {
                phase: 'done',
                content: '## Consensus\n@Gemini 观点被采纳'
            }
        });
        await wrapper.vm.$nextTick();

        await wrapper.get('.md-mention[data-member="Gemini"]').trigger('click');

        expect(wrapper.get('[data-testid="group-tab-Gemini"]').attributes('aria-selected')).toBe('true');
    });
});
