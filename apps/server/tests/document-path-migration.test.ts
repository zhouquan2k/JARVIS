import { describe, expect, it } from 'vitest';
import { applyDocumentPathMigration, inferDocumentPathsFromConversation } from '../src/migrations/documentPathMigration.js';
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

describe('documentPathMigration', () => {
    it('infers document paths from the first user message active-document attachments', () => {
        const conversation = createConversation({
            messages: [
                {
                    id: 'm1',
                    role: 'user',
                    content: 'hello',
                    attachments: [
                        {
                            id: 'active-document:/docs/guide.md',
                            type: 'file',
                            name: 'guide.md',
                            mimeType: 'text/markdown',
                            size: 100
                        },
                        {
                            id: 'active-document:/docs/spec.pdf',
                            type: 'file',
                            name: 'spec.pdf',
                            mimeType: 'application/pdf',
                            size: 200
                        }
                    ]
                },
                {
                    id: 'm2',
                    role: 'user',
                    content: 'follow-up',
                    attachments: [
                        {
                            id: 'active-document:/docs/ignored.md',
                            type: 'file',
                            name: 'ignored.md',
                            mimeType: 'text/markdown',
                            size: 50
                        }
                    ]
                }
            ]
        });

        expect(inferDocumentPathsFromConversation(conversation)).toEqual([
            '/docs/guide.md',
            '/docs/spec.pdf'
        ]);
    });

    it('does not overwrite existing document paths', () => {
        const conversation = createConversation({
            documentPaths: ['/docs/already-bound.md'],
            messages: [
                {
                    id: 'm1',
                    role: 'user',
                    content: 'hello',
                    attachments: [
                        {
                            id: 'active-document:/docs/guide.md',
                            type: 'file',
                            name: 'guide.md',
                            mimeType: 'text/markdown',
                            size: 100
                        }
                    ]
                }
            ]
        });

        const result = applyDocumentPathMigration(conversation);
        expect(result.changed).toBe(false);
        expect(result.conversation.documentPaths).toEqual(['/docs/already-bound.md']);
    });

    it('marks conversations without legacy active-document attachments as unchanged', () => {
        const conversation = createConversation({
            messages: [
                {
                    id: 'm1',
                    role: 'user',
                    content: 'hello',
                    attachments: [
                        {
                            id: 'plain-file',
                            type: 'file',
                            name: 'guide.md',
                            mimeType: 'text/markdown',
                            size: 100
                        }
                    ]
                }
            ]
        });

        const result = applyDocumentPathMigration(conversation);
        expect(result.changed).toBe(false);
        expect(result.conversation.documentPaths).toBeUndefined();
    });
});
