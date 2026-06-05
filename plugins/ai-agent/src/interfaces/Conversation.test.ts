import { describe, expect, it } from 'vitest';
import {
    cloneConversationMessage,
    normalizeConversationMessage,
    type ConversationMessage
} from './Conversation';

describe('Conversation message functional parts', () => {
    it('clones functional parts without sharing array entries', () => {
        const message: ConversationMessage = {
            id: 'message-1',
            role: 'assistant',
            content: 'Done.',
            functionalParts: [
                {
                    id: 'part-1',
                    kind: 'tool_exchange',
                    title: 'search',
                    content: '{"name":"search"}',
                    requestContent: '{"query":"docs"}',
                    responseContent: '{"hits":1}',
                    collapsed: false,
                    afterCharIndex: 12
                }
            ]
        };

        const cloned = cloneConversationMessage(message);

        expect(cloned).toEqual(message);
        expect(cloned.functionalParts).not.toBe(message.functionalParts);
        expect(cloned.functionalParts?.[0]).not.toBe(message.functionalParts?.[0]);
    });

    it('normalizes valid functional parts and keeps legacy messages compatible', () => {
        expect(normalizeConversationMessage({
            id: 'legacy-message',
            role: 'assistant',
            content: 'Legacy answer'
        })).toEqual({
            id: 'legacy-message',
            role: 'assistant',
            content: 'Legacy answer',
            createdAt: undefined,
            questionId: undefined,
            starred: undefined,
            deleted: undefined,
            attachments: undefined,
            requestSnapshot: undefined,
            annotations: undefined,
            functionalParts: undefined
        });

        expect(normalizeConversationMessage({
            id: 'message-2',
            role: 'assistant',
            content: 'Result',
            functionalParts: [
                {
                    kind: 'search',
                    title: ' Search results ',
                    content: 'https://example.com'
                },
                {
                    kind: 'unknown',
                    title: 'Invalid',
                    content: 'ignored'
                },
                {
                    kind: 'trace',
                    title: '',
                    content: 'ignored'
                }
            ]
        }, 2).functionalParts).toEqual([
            {
                id: 'functional-part-2-0',
                kind: 'search',
                title: 'Search results',
                content: 'https://example.com',
                collapsed: undefined,
                afterCharIndex: undefined
            }
        ]);
    });
});
