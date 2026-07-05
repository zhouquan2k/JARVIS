import type { Conversation, ResolvedAgentConfig, WorkspaceRuntimeContext } from '@plugins/ai-agent/src/internal';
import { useDocumentWorkspaceStore } from '@packages/ui';
import { resolveScopedAgentConfigFromWorkspaceContext } from '../runtime/agents/config/resolveScopedAgentConfig';
import { useChatStore } from './chat';

function scopeMetadataToAgent(input: {
    scopeKey?: string | null;
    metadata?: { scopeKey?: string; data: Record<string, unknown> } | null;
    context?: { folderMetadata: Record<string, { scopeKey: string; data: Record<string, unknown> }> } | null;
}): ResolvedAgentConfig | null {
    const metadata = input.metadata;
    if (!metadata && !input.scopeKey) {
        return null;
    }

    const scopeKey = input.scopeKey?.trim() || metadata?.scopeKey?.trim() || null;
    if (scopeKey && input.context) {
        return resolveScopedAgentConfigFromWorkspaceContext(input.context as any, scopeKey);
    }

    const data = metadata?.data as unknown;
    return data && Array.isArray((data as ResolvedAgentConfig).sourcePaths)
        ? (data as ResolvedAgentConfig)
        : null;
}

function normalizeWorkspaceNodePath(path: string | null | undefined): string | null {
    if (!path) {
        return null;
    }

    const trimmed = path.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed === '/' || trimmed === '/.agent.json') {
        return '/';
    }

    if (trimmed.endsWith('/')) {
        return trimmed.slice(0, -1) || '/';
    }

    if (trimmed.endsWith('/.agent.json')) {
        const ownerPath = trimmed.slice(0, -'/.agent.json'.length);
        return ownerPath || '/';
    }

    return trimmed;
}

function resolveWorkspaceTargetFromConversation(conversation: Conversation | null | undefined): {
    selectedNodePath: string | null;
    activePath: string | null;
} | null {
    if (!conversation) {
        return null;
    }

    const primaryDocumentPath = normalizeWorkspaceNodePath(conversation.documentPaths?.[0] ?? null);
    if (primaryDocumentPath) {
        return {
            selectedNodePath: primaryDocumentPath,
            activePath: primaryDocumentPath
        };
    }

    const agentOwnerPath = normalizeWorkspaceNodePath(conversation.agentKey ?? null);
    if (agentOwnerPath) {
        return {
            selectedNodePath: agentOwnerPath,
            activePath: null
        };
    }

    return null;
}

export function registerAiAgentWorkspaceRuntimeBridge(runtimeContext: WorkspaceRuntimeContext): void {
    const chatStore = useChatStore();
    const documentStore = useDocumentWorkspaceStore();

    runtimeContext.registerCurrentErrorSource({
        getCurrentError() {
            return chatStore.currentError;
        },
        clearCurrentError() {
            chatStore.clearCurrentError();
        }
    });

    runtimeContext.registerConversationDocumentIdsSource({
        getDocumentIds() {
            return chatStore.currentConversation?.documentIds ?? null;
        }
    });

    runtimeContext.registerBeforeRouteNavigateHandler(async (input) => {
        const currentConversationId = chatStore.currentConversation?.id ?? null;
        chatStore.setWorkspaceMode(input.nextRoutePath === '/' ? 'agent' : 'conversation');
        if (input.nextRoutePath === '/chat' && input.nextRoutePath !== input.currentRoutePath) {
            // 切换前持久化当前对话的模型选择，保证已有对话重新打开时沿用上次使用的模型。
            await chatStore.persistCurrentConversation();
            chatStore.saveAgentViewStatus({
                selectedNodePath: input.selectedNodePath,
                activePath: input.activePath,
                activeConversationId: currentConversationId
            });
            const routeActiveAgent = scopeMetadataToAgent({
                metadata: input.activeScopeMetadata,
                context: documentStore.context
            });
            if (routeActiveAgent) {
                chatStore.saveWorkspaceAgentContext(routeActiveAgent);
            }
            chatStore.setSidebarCollapsed(input.revealSidebar !== true);
            await chatStore.applyWorkspaceAgentContextSelection();
        }

        if (input.nextRoutePath === '/' && input.currentRoutePath === '/chat') {
            // 切换前持久化当前对话的模型选择，保证已有对话重新打开时沿用上次使用的模型。
            await chatStore.persistCurrentConversation();
            const currentConversationTarget = resolveWorkspaceTargetFromConversation(chatStore.currentConversation);
            if (currentConversationTarget) {
                chatStore.saveAgentViewStatus({
                    selectedNodePath: currentConversationTarget.selectedNodePath,
                    activePath: currentConversationTarget.activePath,
                    activeConversationId: currentConversationId
                });
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
            chatStore.saveWorkspaceAgentContext(scopeMetadataToAgent({
                scopeKey: input.activeScopeKey,
                metadata: input.activeScopeMetadata,
                context: documentStore.context
            }));
        }

        const sameWorkspaceSelection = previousSelection.activeAgentKey === (input.activeScopeKey ?? null)
            && previousSelection.selectedNodePath === (input.selectedNodePath ?? null)
            && previousSelection.activePath === input.activePath;
        if (sameWorkspaceSelection) {
            return;
        }
    });
}
