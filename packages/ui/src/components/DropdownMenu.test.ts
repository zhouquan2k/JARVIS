// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import DropdownMenu from './DropdownMenu.vue';

enableAutoUnmount(afterEach);

function mountDropdownMenu() {
    const Harness = defineComponent({
        components: { DropdownMenu },
        setup() {
            const open = ref(true);
            return { open };
        },
        template: `
          <div>
            <DropdownMenu v-model="open">
              <template #trigger="{ triggerProps }">
                <button data-testid="dropdown-trigger" v-bind="triggerProps">Open</button>
              </template>
              <template #menu>
                <div data-testid="dropdown-content">Menu</div>
              </template>
            </DropdownMenu>
            <button data-testid="outside">Outside</button>
          </div>
        `
    });

    return mount(Harness, { attachTo: document.body });
}

describe('DropdownMenu', () => {
    it('keeps an internal pointer interaction open and closes when the pointer is outside', async () => {
        const wrapper = mountDropdownMenu();

        expect(wrapper.get('[data-testid="dropdown-trigger"]').attributes('aria-expanded')).toBe('true');
        await wrapper.get('[data-testid="dropdown-content"]').trigger('pointerdown');
        expect(wrapper.find('[data-testid="dropdown-content"]').exists()).toBe(true);

        await wrapper.get('[data-testid="outside"]').trigger('pointerdown');
        await nextTick();

        expect(wrapper.find('[data-testid="dropdown-content"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="dropdown-trigger"]').attributes('aria-expanded')).toBe('false');
    });

    it('closes on Escape', async () => {
        const wrapper = mountDropdownMenu();

        await wrapper.get('[data-testid="dropdown-trigger"]').trigger('keydown', { key: 'Escape' });
        await nextTick();

        expect(wrapper.find('[data-testid="dropdown-content"]').exists()).toBe(false);
    });
});
