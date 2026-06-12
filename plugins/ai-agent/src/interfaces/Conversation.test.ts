import { describe, expect, it } from 'vitest';
import {
    cloneConversation,
    cloneConversationMessage,
    normalizeConversation,
    normalizeConversationMessage,
    type Conversation,
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

describe('Conversation group member selection', () => {
    const groupConversation: Conversation = {
        id: 'group-conv',
        title: 'Group chat',
        origin: 'local',
        messages: [],
        updatedAt: 1,
        modelSelection: {
            providerId: 'group',
            modelId: 'dom',
            modelOptions: {},
            groupMembers: [
                { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' },
                { providerId: 'claude-dom', modelId: 'dom', name: 'Claude' }
            ]
        }
    };

    it('clones groupMembers without sharing array entries', () => {
        const cloned = cloneConversation(groupConversation);
        expect(cloned.modelSelection?.groupMembers).toEqual(groupConversation.modelSelection?.groupMembers);
        expect(cloned.modelSelection?.groupMembers).not.toBe(groupConversation.modelSelection?.groupMembers);
        expect(cloned.modelSelection?.groupMembers?.[0]).not.toBe(groupConversation.modelSelection?.groupMembers?.[0]);
    });

    it('normalizes groupMembers and drops malformed entries', () => {
        const normalized = normalizeConversation({
            ...groupConversation,
            modelSelection: {
                providerId: 'group',
                modelId: 'dom',
                modelOptions: {},
                groupMembers: [
                    { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' },
                    { providerId: 'gemini-dom', name: 'Gemini' },
                    { modelId: 'dom', name: 'NoProvider' }
                ]
            }
        } as unknown as Conversation);

        expect(normalized.modelSelection?.groupMembers).toEqual([
            { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' }
        ]);
    });
});
