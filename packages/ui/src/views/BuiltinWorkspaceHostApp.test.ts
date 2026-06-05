// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const mockCreateBuiltinWorkspaceRuntime = vi.fn();
const mockInstallGlobalUnhandledErrorFallback = vi.fn();

vi.mock('../bootstrap/createBuiltinWorkspaceRuntime', () => ({
    createBuiltinWorkspaceRuntime: mockCreateBuiltinWorkspaceRuntime
}));

vi.mock('../utils/installGlobalUnhandledErrorFallback', () => ({
    installGlobalUnhandledErrorFallback: mockInstallGlobalUnhandledErrorFallback
}));

describe('BuiltinWorkspaceHostApp', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInstallGlobalUnhandledErrorFallback.mockReturnValue(() => undefined);
    });

    it('creates the builtin runtime and passes it into WorkspaceHostApp', { timeout: 10000 }, async () => {
        const runtime = {
            contributionQuery: {
                getGlobalViews: () => [],
                getRightPanelTabs: () => [],
                getWorkspaceSelectionViews: () => [],
                getInsertLinkTypes: () => [],
                getDocumentCreationFlows: () => [],
                getNodePresentations: () => []
            },
            runtimeContext: {
                currentError: null,
                clearCurrentError: vi.fn(),
                beforeRouteNavigate: vi.fn(),
                publishWorkspaceSelectionChanged: vi.fn(),
                registerCurrentErrorSource: vi.fn(() => () => undefined),
                registerBeforeRouteNavigateHandler: vi.fn(() => () => undefined),
                registerWorkspaceSelectionChangedHandler: vi.fn(() => () => undefined),
                getPluginMessages: vi.fn(() => []),
                subscribePluginMessages: vi.fn(() => () => undefined),
                postPluginMessage: vi.fn(),
                postHostEvent: vi.fn(),
                subscribeHostEvent: vi.fn(() => () => undefined)
            }
        };
        mockCreateBuiltinWorkspaceRuntime.mockResolvedValue(runtime);

        const onRuntimeReady = vi.fn();
        const { default: BuiltinWorkspaceHostApp } = await import('./BuiltinWorkspaceHostApp.vue');
        const wrapper = mount(BuiltinWorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo: vi.fn(),
                contextProvider: { id: 'ctx' },
                runtimeOptions: {
                    hostContext: { environment: { platform: 'web' } },
                    runtimeMode: 'web',
                    pluginEnablement: {
                        enabledPluginIds: ['ai-agent']
                    }
                },
                onRuntimeReady
            },
            global: {
                stubs: {
                    WorkspaceHostApp: {
                        props: ['currentRoutePath', 'contextProvider', 'contributionQuery', 'runtimeContext'],
                        template: `
                          <div
                            data-testid="workspace-host"
                            :data-route="currentRoutePath"
                            :data-has-query="String(!!contributionQuery)"
                            :data-has-runtime="String(!!runtimeContext)"
                          />
                        `
                    }
                }
            }
        });

        await flushPromises();

        expect(mockCreateBuiltinWorkspaceRuntime).toHaveBeenCalledWith(expect.objectContaining({
            runtimeMode: 'web'
        }));
        expect(onRuntimeReady).toHaveBeenCalledWith(runtime);
        expect(wrapper.get('[data-testid="workspace-host"]').attributes('data-route')).toBe('/chat');
        expect(wrapper.get('[data-testid="workspace-host"]').attributes('data-has-query')).toBe('true');
        expect(wrapper.get('[data-testid="workspace-host"]').attributes('data-has-runtime')).toBe('true');
    });
});
