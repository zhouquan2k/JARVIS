import type { Conversation } from '../interfaces';
import type { LinkableConversationEntry } from '@packages/ui';

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
