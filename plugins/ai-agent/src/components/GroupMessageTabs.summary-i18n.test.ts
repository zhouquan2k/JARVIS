// @vitest-environment happy-dom

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createWorkspaceI18n } from '@packages/ui';
import GroupMessageTabs from './GroupMessageTabs.vue';
import type { GroupMemberPart, GroupSummaryPart } from '../interfaces/Conversation';

function mountWithLocale(content: string, locale: 'en' | 'zh-CN') {
    // 通过 storage 注入初始 locale，避免在 setup 外调用 setLocale
    const storage = { getItem: () => locale, setItem: () => {} };
    const i18n = createWorkspaceI18n({ storage });
    const members: GroupMemberPart[] = [
        { name: 'ChatGPT', modelId: 'gpt', content: 'a', status: 'done' },
        { name: 'Gemini', modelId: 'gem', content: 'b', status: 'done' }
    ];
    const groupSummary: GroupSummaryPart = { phase: 'done', content };

    return mount(GroupMessageTabs, {
        props: { groupMembers: members, groupSummary },
        global: { plugins: [i18n] }
    });
}

describe('GroupMessageTabs summary heading localization', () => {
    const content = [
        '## Consensus',
        'all agree',
        '',
        '## Complementary',
        '@ChatGPT unique point',
        '',
        '## Conflicts',
        'they differ'
    ].join('\n');

    it('renders Chinese section headings under zh-CN', async () => {
        const wrapper = mountWithLocale(content, 'zh-CN');
        await wrapper.vm.$nextTick();
        const html = wrapper.find('[data-testid="group-tab-content-summary"]').html();
        expect(html).toContain('共识');
        expect(html).toContain('互补');
        expect(html).toContain('冲突');
        expect(html).not.toContain('Consensus');
        expect(html).not.toContain('Complementary');
    });

    it('keeps English headings under en', async () => {
        const wrapper = mountWithLocale(content, 'en');
        await wrapper.vm.$nextTick();
        const html = wrapper.find('[data-testid="group-tab-content-summary"]').html();
        expect(html).toContain('Consensus');
        expect(html).toContain('Complementary');
    });

    it('localizes bold-style headings too', async () => {
        const boldContent = ['**Consensus**', 'x', '', '**Complementary:**', 'y'].join('\n');
        const wrapper = mountWithLocale(boldContent, 'zh-CN');
        await wrapper.vm.$nextTick();
        const html = wrapper.find('[data-testid="group-tab-content-summary"]').html();
        expect(html).toContain('共识');
        expect(html).toContain('互补');
    });
});
