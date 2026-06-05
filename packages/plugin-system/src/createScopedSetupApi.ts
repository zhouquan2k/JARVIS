import type { IHostContext, PluginSetupApi, WorkspaceRuntimeContext } from '@packages/core';
import type { PluginRegistry } from './PluginRegistry';

export function createScopedSetupApi(
    pluginId: string,
    registry: PluginRegistry,
    runtimeContext: WorkspaceRuntimeContext,
    hostContext: IHostContext
): PluginSetupApi {
    return {
        registerGlobalView(view) {
            registry.registerGlobalView(pluginId, view);
        },
        registerRightPanelTab(tab) {
            registry.registerRightPanelTab(pluginId, tab);
        },
        registerWorkspaceSelectionView(view) {
            registry.registerWorkspaceSelectionView(pluginId, view);
        },
        registerInsertLinkType(type) {
            registry.registerInsertLinkType(pluginId, type);
        },
        registerDocumentCreationFlow(flow) {
            registry.registerDocumentCreationFlow(pluginId, flow);
        },
        registerNodePresentation(contribution) {
            registry.registerNodePresentation(pluginId, contribution);
        },
        getRuntimeContext() {
            return runtimeContext;
        },
        getHostContext() {
            return hostContext;
        }
    };
}
