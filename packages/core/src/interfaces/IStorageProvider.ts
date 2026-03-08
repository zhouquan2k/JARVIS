import type { AnalysisResult } from '../analysis/types';
import type { ConversationSourceType } from './IHistoryProvider';

export interface Conversation {
    id: string; // Our internal UUID
    backendId?: string; // Real remote provider conversation ID
    title: string;
    sourceType?: ConversationSourceType;
    externalId?: string;
    messages: Array<{ role: 'user' | 'assistant', content: string, id: string }>;
    updatedAt: number;
    compare?: {
        prompt: string;
        modelAProviderId: string;
        modelAModelId: string;
        modelBProviderId: string;
        modelBModelId: string;
        outputA: string;
        outputB: string;
        analysisResult: AnalysisResult;
        analysisRaw?: string;
    };
}

export interface IStorageProvider {
    id: string; // 如：'indexeddb-storage', 'sqlite-storage'
    saveConversation(chat: Conversation): Promise<void>;
    getConversation(id: string): Promise<Conversation | null>;
    getAllConversations(): Promise<Conversation[]>;
    deleteConversation(id: string): Promise<void>;
}
