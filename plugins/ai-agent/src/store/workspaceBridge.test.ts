import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { WorkspaceRuntimeContext } from '@plugins/ai-agent/src/internal';
import { useChatStore } from './chat';
import { registerAiAgentWorkspaceRuntimeBridge } from './workspaceBridge';

describe('registerAiAgentWorkspaceRuntimeBridge', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('restores the saved workspace conversation instead of overwriting it with the temporary chat conversation', async () => {
        const store = useChatStore();
        const handlers: {
            beforeRouteNavigate?: NonNullable<WorkspaceRuntimeContext['beforeRouteNavigate']>;
        } = {};

        const runtimeContext = {
            registerCurrentErrorSource: vi.fn(),
            registerBeforeRouteNavigateHandler(handler) {
                handlers.beforeRouteNavigate = handler;
            },
            registerWorkspaceSelectionChangedHandler: vi.fn()
        } as unknown as WorkspaceRuntimeContext;

        registerAiAgentWorkspaceRuntimeBridge(runtimeContext);

        store.saveAgentViewStatus({
            selectedNodePath: '/guide.md',
            activePath: '/guide.md',
            activeConversationId: 'shared-conversation'
        });
        store.currentConversation = {
            id: 'temporary-chat',
            title: 'Temporary chat mode conversation',
            origin: 'local',
            updatedAt: Date.now(),
            messages: []
        };

        await handlers.beforeRouteNavigate?.({
            currentRoutePath: '/chat',
            nextRoutePath: '/',
            selectedNodePath: '/guide.md',
            activePath: '/guide.md',
            activeAgent: null
        });

        expect(store.restoreAgentViewStatus()).toEqual({
            selectedNodePath: '/guide.md',
            activePath: '/guide.md',
            activeConversationId: 'shared-conversation'
        });
    });
});
