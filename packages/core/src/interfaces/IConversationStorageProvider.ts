import type { Conversation } from './IStorageProvider';

export interface IConversationStorageProvider {
    id: string;
    saveConversation(chat: Conversation): Promise<void>;
    getConversation(id: string): Promise<Conversation | null>;
    getAllConversations(): Promise<Conversation[]>;
    deleteConversation(id: string): Promise<void>;
}
