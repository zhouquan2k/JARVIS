// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';

const mockCurrentRoute = ref({ path: '/chat' });
const mockResolveOfflineSupportWarning = vi.fn(() => null);

vi.mock('@packages/ui', () => ({
    BuiltinWorkspaceHostApp: {
        props: ['currentRoutePath', 'contextProvider', 'runtimeOptions'],
        template: `
          <div
            data-testid="web2-host-stub"
            :data-route="currentRoutePath"
            :data-context-id="contextProvider?.id || ''"
            :data-enabled-plugins="runtimeOptions?.pluginEnablement?.enabledPluginIds?.join(',') || ''"
          />
        `
    },
    loadPluginEnablementConfig: vi.fn((options: { defaultEnabledPluginIds: string[] }) => ({
        enabledPluginIds: options.defaultEnabledPluginIds,
        fallbackToDefaultEnabled: true
    }))
}));

vi.mock('./router', () => ({
    currentRoute: mockCurrentRoute,
    navigateTo: vi.fn()
}));

vi.mock('./context/createWeb2ContextProvider', () => ({
    createWeb2ContextProvider: vi.fn(() => ({ id: 'web2-context' }))
}));

vi.mock('./pwa/offlineSupport', () => ({
    resolveOfflineSupportWarning: mockResolveOfflineSupportWarning
}));

describe('Web2 App shell', () => {
    it('boots through shared ui surfaces with the configured default plugin set', async () => {
        mockResolveOfflineSupportWarning.mockReturnValue(null);
        const { default: App } = await import('./App.vue');
        const wrapper = mount(App);
        await flushPromises();

        const host = wrapper.get('[data-testid="web2-host-stub"]');
        expect(host.attributes('data-route')).toBe('/chat');
        expect(host.attributes('data-context-id')).toBe('web2-context');
        expect(host.attributes('data-enabled-plugins')).toBe('ai-agent,task-mgr,bilibili-import');
    });

    it('shows the offline warning briefly without affecting host boot', async () => {
        vi.useFakeTimers();
        mockResolveOfflineSupportWarning.mockReturnValue('当前入口是非 HTTPS 地址');

        try {
            const { default: App } = await import('./App.vue');
            const wrapper = mount(App);
            await flushPromises();

            expect(wrapper.get('[data-testid="web2-host-stub"]').exists()).toBe(true);
            expect(wrapper.get('[data-testid="web2-offline-warning"]').text()).toContain('当前入口是非 HTTPS 地址');

            await vi.advanceTimersByTimeAsync(5000);
            await flushPromises();

            expect(wrapper.find('[data-testid="web2-offline-warning"]').exists()).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
});
