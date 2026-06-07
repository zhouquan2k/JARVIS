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
        registerDocumentImport(contribution) {
            registry.registerDocumentImport(pluginId, contribution);
        },
        registerLanguageModel(contribution) {
            registry.registerLanguageModel(pluginId, contribution);
        },
        registerNodePresentation(contribution) {
            registry.registerNodePresentation(pluginId, contribution);
        },
        getContributionQuery() {
            return registry;
        },
        getRuntimeContext() {
            return runtimeContext;
        },
        getHostContext() {
            return hostContext;
        }
    };
}
