// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MoveConfirmDialog from './MoveConfirmDialog.vue';

describe('MoveConfirmDialog', () => {
    it('renders node name and destination', () => {
        const wrapper = mount(MoveConfirmDialog, {
            props: {
                nodeName: 'note.md',
                destinationPath: '/agent/archive',
                hasOutgoingLinks: false
            }
        });

        expect(wrapper.get('[data-testid="move-confirm-message"]').text()).toContain('note.md');
        expect(wrapper.get('[data-testid="move-confirm-message"]').text()).toContain('/agent/archive');
    });

    it('shows links warning when hasOutgoingLinks is true', () => {
        const wrapper = mount(MoveConfirmDialog, {
            props: {
                nodeName: 'note.md',
                destinationPath: '/agent/archive',
                hasOutgoingLinks: true
            }
        });

        expect(wrapper.find('[data-testid="move-confirm-links-warning"]').exists()).toBe(true);
    });

    it('hides links warning when hasOutgoingLinks is false', () => {
        const wrapper = mount(MoveConfirmDialog, {
            props: {
                nodeName: 'note.md',
                destinationPath: '/agent/archive',
                hasOutgoingLinks: false
            }
        });

        expect(wrapper.find('[data-testid="move-confirm-links-warning"]').exists()).toBe(false);
    });

    it('emits confirm on confirm button click', async () => {
        const wrapper = mount(MoveConfirmDialog, {
            props: {
                nodeName: 'note.md',
                destinationPath: '/agent/archive',
                hasOutgoingLinks: false
            }
        });

        await wrapper.get('[data-testid="move-confirm-ok"]').trigger('click');
        expect(wrapper.emitted('confirm')).toHaveLength(1);
    });

    it('emits cancel on cancel button click', async () => {
        const wrapper = mount(MoveConfirmDialog, {
            props: {
                nodeName: 'note.md',
                destinationPath: '/agent/archive',
                hasOutgoingLinks: false
            }
        });

        await wrapper.get('[data-testid="move-confirm-cancel"]').trigger('click');
        expect(wrapper.emitted('cancel')).toHaveLength(1);
    });

    it('emits cancel on Escape key', async () => {
        const wrapper = mount(MoveConfirmDialog, {
            props: {
                nodeName: 'note.md',
                destinationPath: '/agent/archive',
                hasOutgoingLinks: false
            }
        });

        await wrapper.trigger('keydown', { key: 'Escape' });
        expect(wrapper.emitted('cancel')).toHaveLength(1);
    });
});
