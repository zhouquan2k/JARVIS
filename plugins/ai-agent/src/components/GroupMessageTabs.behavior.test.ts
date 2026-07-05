// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createWorkspaceI18n } from '@packages/ui';
import GroupMessageTabs from './GroupMessageTabs.vue';
import type { GroupMemberPart, GroupSummaryPart } from '../interfaces/Conversation';

function mountTabs(input: {
    groupMembers: GroupMemberPart[];
    groupSummary?: GroupSummaryPart;
}) {
    const i18n = createWorkspaceI18n({
        storage: { getItem: () => 'zh-CN', setItem: () => {} }
    });
    return mount(GroupMessageTabs, {
        props: input,
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
