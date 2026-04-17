import { describe, expect, it } from 'vitest';
import { applyBoundNodeNameMigration, resolveBoundNodeNameFromConversation } from '../src/migrations/boundNodeNameMigration.js';
import type { SyncConversation } from '../src/types/sync.js';

function createConversation(overrides: Partial<SyncConversation> = {}): SyncConversation {
    return {
        id: 'conversation-1',
        title: 'Conversation 1',
        messages: [],
        updatedAt: 100,
        ...overrides
    };
}

describe('boundNodeNameMigration', () => {
    it('reuses an existing bound node name when present', () => {
        const conversation = createConversation({
            boundNodeName: 'Guide',
            documentPaths: ['/docs/guide.md']
        });

        expect(resolveBoundNodeNameFromConversation(conversation)).toEqual({
            boundNodeName: 'Guide',
            source: 'existing'
        });
        const result = applyBoundNodeNameMigration(conversation);
        expect(result.changed).toBe(false);
        expect(result.conversation.boundNodeName).toBe('Guide');
    });

    it('derives the node name from the first document path', () => {
        const conversation = createConversation({
            documentPaths: ['/docs/guide.md', '/docs/spec.pdf']
        });

        expect(resolveBoundNodeNameFromConversation(conversation)).toEqual({
            boundNodeName: 'guide.md',
            source: 'documentPaths'
        });
        const result = applyBoundNodeNameMigration(conversation);
        expect(result.changed).toBe(true);
        expect(result.conversation.boundNodeName).toBe('guide.md');
    });

    it('falls back to the first user attachment path when document paths are missing', () => {
        const conversation = createConversation({
            messages: [
                {
                    id: 'm1',
                    role: 'user',
                    content: 'hello',
                    attachments: [
                        {
                            id: 'active-document:/docs/spec.pdf',
                            type: 'file',
                            name: 'spec.pdf',
                            mimeType: 'application/pdf',
                            size: 42
                        }
                    ]
                }
            ]
        });

        expect(resolveBoundNodeNameFromConversation(conversation)).toEqual({
            boundNodeName: 'spec.pdf',
            source: 'active-document'
        });
        const result = applyBoundNodeNameMigration(conversation);
        expect(result.changed).toBe(true);
        expect(result.conversation.boundNodeName).toBe('spec.pdf');
    });
});
