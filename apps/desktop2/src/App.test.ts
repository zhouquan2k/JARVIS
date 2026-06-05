// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';

const mockCurrentRoute = ref({ path: '/chat' });

vi.mock('@packages/ui', () => ({
    BuiltinWorkspaceHostApp: {
        props: ['currentRoutePath', 'contextProvider', 'runtimeOptions', 'showHistorySourceSwitch'],
        template: `
          <div
            data-testid="desktop2-host-stub"
            :data-route="currentRoutePath"
            :data-context-id="contextProvider?.id || ''"
            :data-enabled-plugins="runtimeOptions?.pluginEnablement?.enabledPluginIds?.join(',') || ''"
            :data-switch="String(showHistorySourceSwitch)"
          />
        `
    },
    loadPluginEnablementConfig: vi.fn((options: { defaultEnabledPluginIds: string[] }) => ({
        enabledPluginIds: options.defaultEnabledPluginIds,
        fallbackToDefaultEnabled: true
    }))
}));

vi.mock('./context/createDesktop2ContextProvider', () => ({
    createDesktop2ContextProvider: vi.fn(() => ({ id: 'desktop2-context' }))
}));

vi.mock('./router', () => ({
    currentRoute: mockCurrentRoute,
    navigateTo: vi.fn()
}));

describe('Desktop2 App shell', () => {
    it('boots through shared ui surfaces with desktop runtime options and http context wiring', async () => {
        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        const host = wrapper.get('[data-testid="desktop2-host-stub"]');
        expect(host.attributes('data-route')).toBe('/chat');
        expect(host.attributes('data-context-id')).toBe('desktop2-context');
        expect(host.attributes('data-enabled-plugins')).toBe('ai-agent,task-mgr');
        expect(host.attributes('data-switch')).toBe('true');
    });
});
