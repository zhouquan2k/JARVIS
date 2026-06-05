export { default as DocumentWorkspaceView } from './src/views/DocumentWorkspaceView.vue';
export { default as BuiltinWorkspaceHostApp } from './src/views/BuiltinWorkspaceHostApp.vue';
export { default as WorkspaceHostApp } from './src/views/WorkspaceHostApp.vue';
export { default as AppTopBar } from './src/components/AppTopBar.vue';
export { default as WorkspaceRightPane } from './src/components/WorkspaceRightPane.vue';
export { default as DocumentEditorPane } from './src/components/DocumentEditorPane.vue';
export { default as DocumentFileTree } from './src/components/DocumentFileTree.vue';
export { default as MessageAnnotationLayer } from './src/components/MessageAnnotationLayer.vue';
export { createWorkspaceI18n, translateWorkspaceMessage, useWorkspaceI18n, resolveWorkspaceText, resolveInitialLocale } from './src/i18n';
export { useDocumentWorkspaceStore } from './src/store/documentWorkspace';
export { CHAT_ROUTES, PRIMARY_WORKSPACE_ROUTES, type ChatRoute, type ChatRoutePath } from './src/routes';
export { createWorkspaceHostRouter, type WorkspaceHostRouter, type CreateWorkspaceHostRouterOptions } from './src/routing/createWorkspaceHostRouter';
export { openConversationImportDialog, parseConversationImportPayload } from './src/utils/externalFileImport';
export { installGlobalUnhandledErrorFallback } from './src/utils/installGlobalUnhandledErrorFallback';
export { contributionQueryKey } from './src/plugins/injectionKeys';
export { useDocumentCreationFlows } from './src/services/documentCreationFlows';
export {
    createBuiltinWorkspaceRuntime,
    type BuiltinWorkspaceRuntimeResult,
    type CreateBuiltinWorkspaceRuntimeOptions,
    type WorkspaceHostRuntimeMode
} from './src/bootstrap/createBuiltinWorkspaceRuntime';
export {
    loadPluginEnablementConfig,
    type LoadPluginEnablementConfigOptions
} from './src/bootstrap/loadPluginEnablementConfig';
export {
    HttpContextProvider,
    resolveContextBaseUrl,
    type HttpContextProviderOptions,
    type ResolveContextBaseUrlOptions
} from './src/context/HttpContextProvider';
