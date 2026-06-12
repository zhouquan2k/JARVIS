import type { ResolvedAgentConfig, WorkspaceRuntimeContext } from '@plugins/ai-agent/src/internal';
import { useChatStore } from './chat';

function scopeMetadataToAgent(metadata: { data: Record<string, unknown> } | null | undefined): ResolvedAgentConfig | null {
    if (!metadata) {
        return null;
    }

    const data = metadata.data as unknown as ResolvedAgentConfig;
    if (!Array.isArray(data.sourcePaths)) {
        return null;
    }

    return data;
}

function matchesSavedSelection(
    input: {
        selectedNodePath: string | null;
        activePath: string | null;
    },
    savedStatus: ReturnType<ReturnType<typeof useChatStore>['restoreAgentViewStatus']>
): boolean {
    if (!savedStatus) {
        return false;
    }

    return savedStatus.activePath
        ? input.activePath === savedStatus.activePath
        : input.selectedNodePath === savedStatus.selectedNodePath;
}

export function registerAiAgentWorkspaceRuntimeBridge(runtimeContext: WorkspaceRuntimeContext): void {
    const chatStore = useChatStore();

    runtimeContext.registerCurrentErrorSource({
        getCurrentError() {
            return chatStore.currentError;
        },
        clearCurrentError() {
            chatStore.clearCurrentError();
        }
    });

    runtimeContext.registerBeforeRouteNavigateHandler(async (input) => {
        const currentConversationId = chatStore.currentConversation?.id ?? null;
        chatStore.setWorkspaceMode(input.nextRoutePath === '/' ? 'agent' : 'conversation');
        if (input.nextRoutePath === '/chat' && input.nextRoutePath !== input.currentRoutePath) {
            chatStore.saveAgentViewStatus({
                selectedNodePath: input.selectedNodePath,
                activePath: input.activePath,
                activeConversationId: currentConversationId
            });
            const routeActiveAgent = scopeMetadataToAgent(input.activeScopeMetadata);
            if (routeActiveAgent) {
                chatStore.saveWorkspaceAgentContext(routeActiveAgent);
            }
            chatStore.setSidebarCollapsed(input.revealSidebar !== true);
            await chatStore.applyWorkspaceAgentContextSelection();
        }

        if (input.nextRoutePath === '/' && input.currentRoutePath === '/chat') {
            const savedAgentViewStatus = chatStore.restoreAgentViewStatus();
            if (savedAgentViewStatus && (savedAgentViewStatus.selectedNodePath || savedAgentViewStatus.activePath)) {
                chatStore.saveAgentViewStatus(savedAgentViewStatus);
            }
        }
    });

    runtimeContext.registerWorkspaceSelectionChangedHandler(async (input) => {
        const previousSelection = {
            activeAgentKey: chatStore.activeWorkspaceAgentKey ?? null,
            selectedNodePath: chatStore.activeWorkspaceSelectedNodePath ?? null,
            activePath: chatStore.activeWorkspacePath
        };
        chatStore.setWorkspaceContext({
            activeAgentKey: input.activeScopeKey,
            selectedNodePath: input.selectedNodePath,
            activePath: input.activePath,
            activeDocument: input.activeDocument,
            contextProvider: input.contextProvider,
            onFileChanged: input.onFileChanged
        });

        if (input.activeScopeMetadata !== undefined) {
            chatStore.saveWorkspaceAgentContext(scopeMetadataToAgent(input.activeScopeMetadata));
        }

        const savedAgentViewStatus = chatStore.restoreAgentViewStatus();
        const sameSelection = matchesSavedSelection({
            selectedNodePath: input.selectedNodePath ?? null,
            activePath: input.activePath
        }, savedAgentViewStatus);
        const sameWorkspaceSelection = previousSelection.activeAgentKey === (input.activeScopeKey ?? null)
            && previousSelection.selectedNodePath === (input.selectedNodePath ?? null)
            && previousSelection.activePath === input.activePath;

        if (sameSelection || sameWorkspaceSelection) {
            if (!savedAgentViewStatus?.activeConversationId) {
                if (chatStore.currentConversation && !sameWorkspaceSelection) {
                    chatStore.clearWorkspaceConversationSelection();
                }
                return;
            }

            if (chatStore.currentConversation?.id !== savedAgentViewStatus.activeConversationId) {
                try {
                    await chatStore.selectLocalConversation(savedAgentViewStatus.activeConversationId);
                } catch {
                    chatStore.clearWorkspaceConversationSelection();
                }
            }
            return;
        }

        if (chatStore.currentConversation) {
            chatStore.clearWorkspaceConversationSelection();
        }
    });
}
