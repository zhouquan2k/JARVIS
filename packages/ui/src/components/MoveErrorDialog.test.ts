// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MoveErrorDialog from './MoveErrorDialog.vue';

describe('MoveErrorDialog', () => {
    it('renders cross-agent message', () => {
        const wrapper = mount(MoveErrorDialog, {
            props: { reason: 'cross-agent' }
        });

        const message = wrapper.get('[data-testid="move-error-message"]').text();
        expect(message).toContain('Agent');
    });

    it('renders references-dir message', () => {
        const wrapper = mount(MoveErrorDialog, {
            props: { reason: 'references-dir' }
        });

        const message = wrapper.get('[data-testid="move-error-message"]').text();
        expect(message).toContain('references');
    });

    it('emits dismiss on OK button click', async () => {
        const wrapper = mount(MoveErrorDialog, {
            props: { reason: 'cross-agent' }
        });

        await wrapper.get('[data-testid="move-error-ok"]').trigger('click');
        expect(wrapper.emitted('dismiss')).toHaveLength(1);
    });

    it('emits dismiss on Escape key', async () => {
        const wrapper = mount(MoveErrorDialog, {
            props: { reason: 'cross-agent' }
        });

        await wrapper.trigger('keydown', { key: 'Escape' });
        expect(wrapper.emitted('dismiss')).toHaveLength(1);
    });
});
