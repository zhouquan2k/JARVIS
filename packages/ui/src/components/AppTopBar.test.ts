// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AppTopBar from './AppTopBar.vue';
import { PRIMARY_WORKSPACE_ROUTES } from '../routes';

describe('AppTopBar', () => {
    it('highlights the active workspace and emits navigation for another workspace', async () => {
        const wrapper = mount(AppTopBar, {
            props: {
                isCompareMode: false,
                compareStage: 'idle',
                activeWorkspacePath: '/',
                workspaceOptions: PRIMARY_WORKSPACE_ROUTES
            }
        });

        const knowledgeButton = wrapper.get('[data-testid="topbar-workspace-knowledge-workspace"]');
        const chatButton = wrapper.get('[data-testid="topbar-workspace-normal-chat"]');

        expect(wrapper.get('.brand-title').text()).toBe('JARVIS');
        expect(wrapper.get('.brand-icon').attributes('src')).toBe('/jarvis.png');
        expect(knowledgeButton.attributes('aria-pressed')).toBe('true');
        expect(chatButton.attributes('aria-pressed')).toBe('false');

        await chatButton.trigger('click');
        expect(wrapper.emitted('navigate-workspace')).toEqual([[ '/chat' ]]);
    });
});
