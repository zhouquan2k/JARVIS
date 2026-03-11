import { describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db.js';
import { SyncRepository } from '../src/repositories/syncRepository.js';
import type { ServerConfig } from '../src/config.js';
import type { SyncConversation } from '../src/types/sync.js';

function createConfig(): ServerConfig {
    return {
        port: 8787,
        dbPath: ':memory:',
        isDevelopment: true,
        corsAllowlist: []
    };
}

function createConversation(
    id: string,
    updatedAt: number,
    deleted = false,
    overrides: Partial<SyncConversation> = {}
): SyncConversation {
    return {
        id,
        title: overrides.title ?? `Conversation ${id}`,
        updatedAt,
        messages: overrides.messages ?? [
            {
                id: `${id}-m1`,
                role: 'user',
                content: `message:${id}`
            }
        ],
        backendId: overrides.backendId,
        sourceType: overrides.sourceType,
        externalId: overrides.externalId,
        sync: deleted ? { deleted: true } : overrides.sync
    };
}

describe('SyncRepository', () => {
    it('persists aggregates and reads incremental rows by syncKey', () => {
        const database = createDatabase(createConfig());
        const repository = new SyncRepository(database);

        repository.runInTransaction(() => {
            const cursorA1 = repository.allocateNextCursor('alpha', 100);
            repository.saveConversation({
                syncKey: 'alpha',
                conversation: createConversation('conv-1', 100),
                serverCursor: cursorA1,
                receivedAt: 100,
                createdAt: 100
            });

            const cursorA2 = repository.allocateNextCursor('alpha', 200);
            repository.saveConversation({
                syncKey: 'alpha',
                conversation: createConversation('conv-2', 200, true),
                serverCursor: cursorA2,
                receivedAt: 200,
                createdAt: 200
            });

            const cursorB1 = repository.allocateNextCursor('beta', 300);
            repository.saveConversation({
                syncKey: 'beta',
                conversation: createConversation('conv-3', 300),
                serverCursor: cursorB1,
                receivedAt: 300,
                createdAt: 300
            });
        });

        expect(repository.getCurrentCursor('alpha')).toBe(2);
        expect(repository.getCurrentCursor('beta')).toBe(1);
        expect(repository.getConversation('alpha', 'conv-2')?.conversation.sync?.deleted).toBe(true);

        const alphaChanges = repository.listConversationsAfterCursor('alpha', 1);
        expect(alphaChanges).toHaveLength(1);
        expect(alphaChanges[0].conversation.id).toBe('conv-2');
        expect(alphaChanges[0].conversation.sync?.deleted).toBe(true);

        const betaChanges = repository.listConversationsAfterCursor('beta', null);
        expect(betaChanges).toHaveLength(1);
        expect(betaChanges[0].conversation.id).toBe('conv-3');
    });

    it('preserves attachments and annotations in raw database payloads', () => {
        const database = createDatabase(createConfig());
        const repository = new SyncRepository(database);

        repository.runInTransaction(() => {
            const cursor = repository.allocateNextCursor('alpha', 100);
            repository.saveConversation({
                syncKey: 'alpha',
                conversation: createConversation('conv-rich', 100, false, {
                    messages: [
                        {
                            id: 'conv-rich-m1',
                            role: 'user',
                            content: 'hello',
                            attachments: [
                                {
                                    id: 'file-1',
                                    type: 'file',
                                    name: 'notes.txt',
                                    mimeType: 'text/plain',
                                    size: 42,
                                    base64Data: 'aGVsbG8='
                                }
                            ]
                        },
                        {
                            id: 'conv-rich-m2',
                            role: 'assistant',
                            content: 'answer [1]',
                            annotations: [
                                {
                                    kind: 'cite',
                                    range: { start: 7, end: 10 },
                                    payload: {
                                        refId: 'turn0search0',
                                        label: '[1]',
                                        title: 'Example',
                                        url: 'https://example.com/article',
                                        snippet: 'Example snippet'
                                    }
                                }
                            ]
                        }
                    ]
                }),
                serverCursor: cursor,
                receivedAt: 100,
                createdAt: 100
            });
        });

        const rawRow = database
            .prepare('SELECT messages_json, payload_json FROM synced_conversations WHERE sync_key = ? AND conversation_id = ?')
            .get('alpha', 'conv-rich') as { messages_json: string; payload_json: string } | undefined;

        expect(rawRow).toBeDefined();

        const messages = JSON.parse(rawRow!.messages_json) as Array<Record<string, unknown>>;
        const payload = JSON.parse(rawRow!.payload_json) as { messages: Array<Record<string, unknown>> };

        expect(messages[0].attachments).toEqual([
            expect.objectContaining({
                id: 'file-1',
                name: 'notes.txt'
            })
        ]);
        expect(messages[1].annotations).toEqual([
            expect.objectContaining({
                kind: 'cite',
                payload: expect.objectContaining({
                    refId: 'turn0search0',
                    url: 'https://example.com/article'
                })
            })
        ]);
        expect(payload.messages[1].annotations).toEqual(messages[1].annotations);
    });
});
