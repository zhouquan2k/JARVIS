export { default as DocumentWorkspaceView } from './src/views/DocumentWorkspaceView.vue';
export { default as BuiltinWorkspaceHostApp } from './src/views/BuiltinWorkspaceHostApp.vue';
export { default as WorkspaceHostApp } from './src/views/WorkspaceHostApp.vue';
export { default as AppTopBar } from './src/components/AppTopBar.vue';
export { default as WorkspaceRightPane } from './src/components/WorkspaceRightPane.vue';
export { default as DocumentEditorPane } from './src/components/DocumentEditorPane.vue';
export { default as DropdownMenu } from './src/components/DropdownMenu.vue';
export { default as DocumentFileTree } from './src/components/DocumentFileTree.vue';
export { default as MarkdownContent } from './src/components/MarkdownContent.vue';
export { default as MessageFunctionalParts } from './src/components/MessageFunctionalParts.vue';
export { default as MessageAnnotationLayer } from './src/components/MessageAnnotationLayer.vue';
export { default as SwipeableListRow } from './src/components/SwipeableListRow.vue';
export { createWorkspaceI18n, translateWorkspaceMessage, useWorkspaceI18n, resolveWorkspaceText, resolveInitialLocale } from './src/i18n';
export { useDocumentWorkspaceStore } from './src/store/documentWorkspace';
export { CHAT_ROUTES, PRIMARY_WORKSPACE_ROUTES, type ChatRoute, type ChatRoutePath } from './src/routes';
export { createWorkspaceHostRouter, type WorkspaceHostRouter, type CreateWorkspaceHostRouterOptions } from './src/routing/createWorkspaceHostRouter';
export { installGlobalUnhandledErrorFallback } from './src/utils/installGlobalUnhandledErrorFallback';
export { formatHttpApiError } from './src/utils/formatHttpApiError';
export { isPromptSubmitHotkey } from './src/utils/promptHotkeys';
export { useIsNarrowViewport } from './src/composables/useIsNarrowViewport';
export {
    contributionQueryKey,
    workspaceNavigationApiKey,
    type WorkspaceNavigationApi
} from './src/plugins/injectionKeys';
export type {
    LinkableConversationEntry,
    MarkdownConversationLinkTarget,
    OpenConversationRequest
} from './src/types/conversationLink';
export type { ResolvedInsertLinkType } from './src/types/insertLink';
export { useDocumentImports } from './src/services/documentCreationFlows';
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
