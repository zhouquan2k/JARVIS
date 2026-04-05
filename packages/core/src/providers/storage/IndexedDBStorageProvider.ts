import localforage from 'localforage';
import { type Conversation, normalizeConversation } from '../../interfaces/IStorageProvider';
import type { IConversationPersistProvider } from '../../interfaces/IConversationPersistProvider';

export class IndexedDBStorageProvider implements IConversationPersistProvider {
    public id = 'indexeddb-storage';
    private store: LocalForage;

    constructor() {
        this.store = localforage.createInstance({
            name: 'chatprism',
            storeName: 'conversations'
        });
    }

    async saveConversation(chat: Conversation): Promise<void> {
        const normalized = normalizeConversation(chat);
        await this.store.setItem(normalized.id, normalized);
    }

    async getConversation(id: string): Promise<Conversation | null> {
        const chat = await this.store.getItem<Conversation>(id);
        return chat ? normalizeConversation(chat) : null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        const conversations: Conversation[] = [];
        await this.store.iterate((value: Conversation) => {
            conversations.push(normalizeConversation(value));
        });
        // Sort by updatedAt descending
        return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async deleteConversation(id: string): Promise<void> {
        await this.store.removeItem(id);
    }
}
