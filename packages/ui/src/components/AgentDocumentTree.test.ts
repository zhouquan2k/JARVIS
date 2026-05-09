// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AgentDocumentTree from './AgentDocumentTree.vue';

describe('AgentDocumentTree', () => {
    it('uses shared markdown display names and non-markdown icons', async () => {
        const wrapper = mount(AgentDocumentTree, {
            props: {
                nodes: [
                    { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                    { path: '/docs/notes.txt', name: 'notes.txt', kind: 'file', parentPath: '/docs' }
                ]
            }
        });

        const buttons = wrapper.findAll('[data-testid="agent-view-document"]');
        expect(buttons[0].text()).toBe('guide');
        expect(buttons[1].text()).toBe('notes.txt');
        expect(buttons[1].find('[data-testid="agent-view-document-icon"]').attributes('data-icon-kind')).toBe('text');
    });
});
