import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useChatStore } from '@packages/ui';
import type {
    Conversation,
    ConversationHistorySummary,
    IConversationPersistProvider,
    IExternalConversationProvider,
    IModelProvider
} from '@packages/core/src';

class MemoryStorageProvider implements IConversationPersistProvider {
    id = 'memory-storage';
    private readonly conversations = new Map<string, Conversation>();

    async saveConversation(chat: Conversation): Promise<void> {
        this.conversations.set(chat.id, structuredClone(chat));
    }

    async getConversation(id: string): Promise<Conversation | null> {
        return this.conversations.has(id) ? structuredClone(this.conversations.get(id)!) : null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        return Array.from(this.conversations.values()).map((conversation) => structuredClone(conversation));
    }

    async deleteConversation(id: string): Promise<void> {
        this.conversations.delete(id);
    }
}

class StaticHistoryProvider implements IExternalConversationProvider {
    id = 'gemini-web' as const;

    async getHistoryList(): Promise<ConversationHistorySummary[]> {
        return [
            {
                id: 'gemini-history-1',
                title: 'Gemini Imported Chat',
                updatedAt: 100,
                origin: 'gemini-web'
            }
        ];
    }

    async getHistoryDetail(): Promise<Conversation> {
        return {
            id: 'preview-gemini-1',
            title: 'Gemini Imported Chat',
            origin: 'gemini-web',
            externalId: 'gemini-history-1',
            backendId: 'gemini-history-1',
            updatedAt: 100,
            messages: [
                { id: 'm1', role: 'user', content: 'hello' }
            ]
        };
    }
}

const dummyModelProvider: IModelProvider = {
    id: 'dummy',
    async getAvailableModels() {
        return {
            models: [{ id: 'dummy-model', name: 'Dummy Model' }],
            defaultModel: 'dummy-model'
        };
    },
    async checkAuth() {
        return true;
    },
    async sendMessage() {
        return {
            text: 'ok',
            conversationId: 'dummy-conversation',
            messageId: 'dummy-message'
        };
    },
    abort() {}
};

describe('chat store integration', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('preserves external origin metadata after importing preview conversations', async () => {
        const storage = new MemoryStorageProvider();
        const chatStore = useChatStore();
        chatStore.setProviders(dummyModelProvider, storage, new StaticHistoryProvider());

        await chatStore.previewExternalConversation('gemini-web', 'gemini-history-1');
        await chatStore.importPreviewConversation();

        expect(chatStore.currentConversation?.origin).toBe('gemini-web');
        expect((await storage.getAllConversations())[0]?.origin).toBe('gemini-web');
    });
});
