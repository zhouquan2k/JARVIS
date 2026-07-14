// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import SwipeableListRow from './SwipeableListRow.vue';

function mountRow(props: Record<string, unknown> = {}) {
    return mount(SwipeableListRow, {
        props,
        slots: {
            default: () => h('button', { class: 'row-body', 'data-testid': 'row-body' }, 'Body'),
            actions: (slotProps: { close: () => void }) =>
                h(
                    'button',
                    {
                        class: 'row-delete',
                        'data-testid': 'row-delete',
                        onClick: () => slotProps.close()
                    },
                    'Delete'
                )
        }
    });
}

describe('SwipeableListRow', () => {
    it('renders as a plain pass-through when disabled (desktop)', () => {
        const wrapper = mountRow({ enabled: false });

        expect(wrapper.find('[data-testid="row-body"]').exists()).toBe(true);
        // Reveal actions panel is not rendered at all when disabled.
        expect(wrapper.find('[data-testid="swipeable-row-actions"]').exists()).toBe(false);
        expect(wrapper.classes()).not.toContain('swipeable-row--enabled');
        // No transform is applied to the track in pass-through mode.
        const track = wrapper.find('.swipeable-row__track').element as HTMLElement;
        expect(track.getAttribute('style') ?? '').not.toContain('translateX');
    });

    it('renders the reveal actions panel when enabled', () => {
        const wrapper = mountRow({ enabled: true });

        expect(wrapper.find('[data-testid="row-body"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="swipeable-row-actions"]').exists()).toBe(true);
        expect(wrapper.classes()).toContain('swipeable-row--enabled');
    });

    it('reflects the controlled open prop in the track transform', async () => {
        const wrapper = mountRow({ enabled: true, open: true, revealWidth: 84 });

        let track = wrapper.find('.swipeable-row__track').element as HTMLElement;
        expect(track.getAttribute('style') ?? '').toContain('translateX(-84px)');
        expect(wrapper.classes()).toContain('swipeable-row--open');

        await wrapper.setProps({ open: false });
        track = wrapper.find('.swipeable-row__track').element as HTMLElement;
        expect(track.getAttribute('style') ?? '').toContain('translateX(0px)');
        expect(wrapper.classes()).not.toContain('swipeable-row--open');
    });

    it('emits update:open and closes when the actions close callback runs', async () => {
        const wrapper = mountRow({ enabled: true, open: true, revealWidth: 84 });

        await wrapper.find('[data-testid="row-delete"]').trigger('click');

        const events = wrapper.emitted('update:open');
        expect(events).toBeTruthy();
        expect(events?.at(-1)).toEqual([false]);
        const track = wrapper.find('.swipeable-row__track').element as HTMLElement;
        expect(track.getAttribute('style') ?? '').toContain('translateX(0px)');
    });

    it('resets the revealed state when swipe becomes disabled', async () => {
        const wrapper = mountRow({ enabled: true, open: true, revealWidth: 84 });
        expect(wrapper.classes()).toContain('swipeable-row--open');

        await wrapper.setProps({ enabled: false });

        const events = wrapper.emitted('update:open');
        expect(events?.at(-1)).toEqual([false]);
        expect(wrapper.classes()).not.toContain('swipeable-row--open');
    });
});
