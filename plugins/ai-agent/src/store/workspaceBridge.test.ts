import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { WorkspaceRuntimeContext } from '@plugins/ai-agent/src/internal';
import { useChatStore } from './chat';
import { registerAiAgentWorkspaceRuntimeBridge } from './workspaceBridge';

describe('registerAiAgentWorkspaceRuntimeBridge', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('keeps the current conversation stable when the workspace selection is republished', async () => {
        const store = useChatStore();
        const handlers: {
            beforeRouteNavigate?: NonNullable<WorkspaceRuntimeContext['beforeRouteNavigate']>;
            workspaceSelectionChanged?: NonNullable<WorkspaceRuntimeContext['publishWorkspaceSelectionChanged']>;
        } = {};

        const runtimeContext = {
            registerCurrentErrorSource: vi.fn(),
            registerConversationDocumentIdsSource: vi.fn(),
            registerBeforeRouteNavigateHandler(handler) {
                handlers.beforeRouteNavigate = handler;
            },
            registerWorkspaceSelectionChangedHandler(handler) {
                handlers.workspaceSelectionChanged = handler;
            }
        } as unknown as WorkspaceRuntimeContext;

        registerAiAgentWorkspaceRuntimeBridge(runtimeContext);

        store.currentConversation = {
            id: 'temporary-chat',
            title: 'Temporary chat mode conversation',
            origin: 'local',
            updatedAt: Date.now(),
            messages: []
        };

        await handlers.workspaceSelectionChanged?.({
            selectedNodePath: '/guide.md',
            activePath: '/guide.md',
            activeScopeKey: '/docs/',
            activeScopeMetadata: null,
            activeDocument: null,
            contextProvider: null
        });

        expect(store.currentConversation?.id).toBe('temporary-chat');
    });

    it('stores the current conversation workspace target when leaving chat mode', async () => {
        const store = useChatStore();
        const handlers: {
            beforeRouteNavigate?: NonNullable<WorkspaceRuntimeContext['beforeRouteNavigate']>;
        } = {};

        const runtimeContext = {
            registerCurrentErrorSource: vi.fn(),
            registerConversationDocumentIdsSource: vi.fn(),
            registerBeforeRouteNavigateHandler(handler) {
                handlers.beforeRouteNavigate = handler;
            },
            registerWorkspaceSelectionChangedHandler: vi.fn()
        } as unknown as WorkspaceRuntimeContext;

        registerAiAgentWorkspaceRuntimeBridge(runtimeContext);

        store.currentConversation = {
            id: 'conversation-doc-bound',
            title: 'Doc Bound Chat',
            origin: 'local',
            updatedAt: Date.now(),
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md'],
            messages: []
        };

        await handlers.beforeRouteNavigate?.({
            currentRoutePath: '/chat',
            nextRoutePath: '/',
            selectedNodePath: '/stale-node',
            activePath: '/stale-node',
            activeScopeMetadata: null
        });

        expect(store.restoreAgentViewStatus()).toEqual({
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeConversationId: 'conversation-doc-bound'
        });
    });
});
