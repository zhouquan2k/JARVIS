// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import KnowledgeAssistantPane from './KnowledgeAssistantPane.vue';

describe('KnowledgeAssistantPane', () => {
    it('mounts the normal chat view inside the knowledge assistant pane', () => {
        const wrapper = mount(KnowledgeAssistantPane, {
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="knowledge-assistant-pane"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="normal-chat-stub"]').exists()).toBe(true);
    });
});
