import type { Conversation } from '@plugins/ai-agent/api';
import type { LinkableConversationEntry } from '../types/conversationLink';

export function buildLinkableConversationEntries(conversations: Conversation[]): LinkableConversationEntry[] {
    return conversations
        .filter((conversation) => {
            return !conversation.compare
                && !conversation.sync?.deleted
                && conversation.origin === 'local';
        })
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((conversation) => ({
            conversationId: conversation.id,
            title: conversation.title?.trim() || 'New Chat'
        }));
}
