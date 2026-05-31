import type { Conversation } from './Conversation';

export interface ConversationQuery {
    documentPath?: string;
    documentId?: string;
}

export interface IConversationQueryProvider {
    getConversations(query: ConversationQuery): Promise<Conversation[]>;
}

export interface IConversationPersistProvider {
    id: string;
    saveConversation(chat: Conversation): Promise<void>;
    getConversation(id: string): Promise<Conversation | null>;
    getAllConversations(): Promise<Conversation[]>;
    deleteConversation(id: string): Promise<void>;
    clear?(): Promise<void>;
}
