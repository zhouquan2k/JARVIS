export interface Conversation {
    id: string; // Our internal UUID
    backendId?: string; // Real remote provider conversation ID
    title: string;
    messages: Array<{ role: 'user' | 'assistant', content: string, id: string }>;
    updatedAt: number;
}

export interface IStorageProvider {
    id: string; // 如：'indexeddb-storage', 'sqlite-storage'
    saveConversation(chat: Conversation): Promise<void>;
    getConversation(id: string): Promise<Conversation | null>;
    getAllConversations(): Promise<Conversation[]>;
    deleteConversation(id: string): Promise<void>;
}
