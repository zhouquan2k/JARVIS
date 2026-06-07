import { describe, expect, it, vi } from 'vitest';
import type { IHostContext, PluginManifest, WorkspaceRuntimeContext } from '@packages/core';
import { PluginManager } from './PluginManager';
import { PluginRegistry } from './PluginRegistry';

function createHostContextStub(): IHostContext {
    return {
        environment: {
            platform: 'web'
        },
        hasCapability() {
            return false;
        },
        getCapability() {
            return null;
        }
    };
}

function createRuntimeContextStub(): WorkspaceRuntimeContext {
    return {
        currentError: null,
        clearCurrentError() {},
        beforeRouteNavigate() {},
        publishWorkspaceSelectionChanged() {},
        registerCurrentErrorSource() {
            return () => undefined;
        },
        registerBeforeRouteNavigateHandler() {
            return () => undefined;
        },
        registerWorkspaceSelectionChangedHandler() {
            return () => undefined;
        },
        getPluginMessages() {
            return [];
        },
        subscribePluginMessages() {
            return () => undefined;
        },
        postPluginMessage() {},
        postHostEvent() {},
        subscribeHostEvent() {
            return () => undefined;
        }
    };
}

describe('PluginManager', () => {
    it('activates only config-enabled plugins and keeps deterministic ordering', async () => {
        const registry = new PluginRegistry();
        const manager = new PluginManager(registry, createRuntimeContextStub(), createHostContextStub());

        const taskPlugin: PluginManifest = {
            id: 'task-mgr',
            name: 'Task Manager',
            version: '1.0.0',
            setup(api) {
                api.registerGlobalView({
                    id: 'all-tasks',
                    routePath: '/all-tasks',
                    routeName: 'all-tasks',
                    label: 'All Tasks',
                    component: {},
                    order: 1
                });
            }
        };
        const aiPlugin: PluginManifest = {
            id: 'ai-agent',
            name: 'AI Agent',
            version: '1.0.0',
            defaultEnabled: true,
            setup(api) {
                api.registerGlobalView({
                    id: 'chat',
                    routePath: '/chat',
                    routeName: 'normal-chat',
                    label: 'Chat',
                    component: {},
                    order: 5
                });
                api.registerGlobalView({
                    id: 'compare',
                    routePath: '/compare',
                    routeName: 'compare-chat',
                    label: 'Compare Chat',
                    component: {},
                    order: 10
                });
            }
        };

        manager.register(taskPlugin);
        manager.register(aiPlugin);

        await manager.activateEnabledPlugins({
            enabledPluginIds: ['task-mgr']
        });

        expect(manager.getEnabledPluginIds()).toEqual(['task-mgr', 'ai-agent']);
        expect(registry.getGlobalViews().map((entry) => entry.id)).toEqual(['all-tasks', 'chat', 'compare']);
    });

    it('can disable manifest defaults when config requires an exact whitelist', async () => {
        const registry = new PluginRegistry();
        const manager = new PluginManager(registry, createRuntimeContextStub(), createHostContextStub());

        manager.register({
            id: 'task-mgr',
            name: 'Task Manager',
            version: '1.0.0',
            setup(api) {
                api.registerGlobalView({
                    id: 'all-tasks',
                    routePath: '/all-tasks',
                    routeName: 'all-tasks',
                    label: 'All Tasks',
                    component: {}
                });
            }
        });
        manager.register({
            id: 'ai-agent',
            name: 'AI Agent',
            version: '1.0.0',
            defaultEnabled: true,
            setup(api) {
                api.registerGlobalView({
                    id: 'chat',
                    routePath: '/chat',
                    routeName: 'normal-chat',
                    label: 'Chat',
                    component: {}
                });
            }
        });

        await manager.activateEnabledPlugins({
            enabledPluginIds: [],
            fallbackToDefaultEnabled: false
        });

        expect(manager.getEnabledPluginIds()).toEqual([]);
        expect(registry.getGlobalViews()).toHaveLength(0);
    });

    it('isolates plugin failures and rolls back duplicate ids for the failing plugin', async () => {
        const registry = new PluginRegistry();
        const logger = { error: vi.fn() };
        const manager = new PluginManager(registry, createRuntimeContextStub(), createHostContextStub(), logger);

        manager.register({
            id: 'good',
            name: 'Good',
            version: '1.0.0',
            setup(api) {
                api.registerGlobalView({
                    id: 'chat',
                    routePath: '/chat',
                    routeName: 'normal-chat',
                    label: 'Chat',
                    component: {}
                });
            }
        });
        manager.register({
            id: 'bad',
            name: 'Bad',
            version: '1.0.0',
            setup(api) {
                api.registerGlobalView({
                    id: 'all-tasks',
                    routePath: '/all-tasks',
                    routeName: 'all-tasks',
                    label: 'All Tasks',
                    component: {}
                });
                api.registerGlobalView({
                    id: 'chat',
                    routePath: '/chat-duplicate',
                    routeName: 'duplicate-chat',
                    label: 'Duplicate',
                    component: {}
                });
            }
        });

        await manager.activateEnabledPlugins({
            enabledPluginIds: ['good', 'bad']
        });

        expect(manager.getEnabledPluginIds()).toEqual(['good']);
        expect(registry.getGlobalViews().map((entry) => entry.id)).toEqual(['chat']);
        expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('supports removeByPlugin cleanup through deactivation', async () => {
        const registry = new PluginRegistry();
        const dispose = vi.fn();
        const manager = new PluginManager(registry, createRuntimeContextStub(), createHostContextStub());

        manager.register({
            id: 'task-mgr',
            name: 'Task Manager',
            version: '1.0.0',
            setup(api) {
                api.registerRightPanelTab({
                    id: 'tasks',
                    title: 'Tasks',
                    component: {}
                });
                api.registerWorkspaceSelectionView({
                    id: 'task-owner-view',
                    component: {},
                    matches: () => false
                });
                api.registerDocumentImport({
                    id: 'bilibili-import',
                    title: 'Bilibili Import',
                    formComponent: {},
                    run: async () => ({
                        primaryDocumentPath: '/guide.md',
                        createdPaths: ['/guide.md']
                    })
                });
                api.registerLanguageModel({
                    id: 'default-model',
                    generateText: async () => 'summary'
                });
                api.registerNodePresentation({
                    id: 'task-owner-node',
                    supports: () => false,
                    getPresentation: () => null
                });
            },
            dispose
        });

        await manager.activateEnabledPlugins({
            enabledPluginIds: ['task-mgr']
        });

        expect(registry.getRightPanelTabs()).toHaveLength(1);
        expect(registry.getWorkspaceSelectionViews()).toHaveLength(1);
        expect(registry.getDocumentImports()).toHaveLength(1);
        expect(registry.getLanguageModels()).toHaveLength(1);
        expect(registry.getNodePresentations()).toHaveLength(1);
        await manager.deactivatePlugin('task-mgr');
        expect(registry.getRightPanelTabs()).toHaveLength(0);
        expect(registry.getWorkspaceSelectionViews()).toHaveLength(0);
        expect(registry.getDocumentImports()).toHaveLength(0);
        expect(registry.getLanguageModels()).toHaveLength(0);
        expect(registry.getNodePresentations()).toHaveLength(0);
        expect(dispose).toHaveBeenCalledTimes(1);
    });
});
