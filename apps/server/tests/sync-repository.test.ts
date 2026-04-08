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
        agentKey: overrides.agentKey,
        updatedAt,
        messages: overrides.messages ?? [
            {
                id: `${id}-m1`,
                role: 'user',
                content: `message:${id}`
            }
        ],
        backendId: overrides.backendId,
        origin: overrides.origin,
        externalId: overrides.externalId,
        sync: deleted ? { deleted: true } : overrides.sync
    };
}

describe('SyncRepository', () => {
    it('persists aggregates and deleted events independently by syncKey', () => {
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
            repository.deleteConversationAggregate('alpha', 'conv-2');
            repository.saveDeletedConversation({
                syncKey: 'alpha',
                deletedConversation: {
                    id: 'conv-2',
                    updatedAt: 200
                },
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
        expect(repository.getConversation('alpha', 'conv-1')?.conversation.id).toBe('conv-1');
        expect(repository.getDeletedConversation('alpha', 'conv-2')?.deletedConversation.updatedAt).toBe(200);

        const alphaConversations = repository.listConversationsAfterCursor('alpha', null);
        expect(alphaConversations).toHaveLength(1);
        expect(alphaConversations[0].conversation.id).toBe('conv-1');

        const alphaDeletes = repository.listDeletedConversationsAfterCursor('alpha', 1);
        expect(alphaDeletes).toHaveLength(1);
        expect(alphaDeletes[0].deletedConversation).toEqual({
            id: 'conv-2',
            updatedAt: 200
        });

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
                            createdAt: 100,
                            questionId: 'question-rich',
                            starred: true,
                            deleted: false,
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
                            createdAt: 101,
                            questionId: 'question-rich',
                            deleted: true,
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
        expect(messages[0]).toEqual(expect.objectContaining({
            createdAt: 100,
            questionId: 'question-rich',
            starred: true,
            deleted: false
        }));
        expect(messages[1]).toEqual(expect.objectContaining({
            createdAt: 101,
            questionId: 'question-rich',
            deleted: true
        }));
        expect(messages[1].annotations).toEqual([
            expect.objectContaining({
                kind: 'cite',
                payload: expect.objectContaining({
                    refId: 'turn0search0',
                    url: 'https://example.com/article'
                })
            })
        ]);
        expect(payload.messages[0].questionId).toBe('question-rich');
        expect(payload.messages[1].deleted).toBe(true);
        expect(payload.messages[1].annotations).toEqual(messages[1].annotations);
    });

    it('stores agentKey in both the dedicated column and payload json', () => {
        const database = createDatabase(createConfig());
        const repository = new SyncRepository(database);

        repository.runInTransaction(() => {
            const cursor = repository.allocateNextCursor('alpha', 100);
            repository.saveConversation({
                syncKey: 'alpha',
                conversation: createConversation('conv-agent', 100, false, {
                    agentKey: '/workspace/archive/.agent.json'
                }),
                serverCursor: cursor,
                receivedAt: 100,
                createdAt: 100
            });
        });

        const rawRow = database
            .prepare('SELECT agent_key, payload_json FROM synced_conversations WHERE sync_key = ? AND conversation_id = ?')
            .get('alpha', 'conv-agent') as { agent_key: string | null; payload_json: string } | undefined;

        expect(rawRow).toBeDefined();
        expect(rawRow?.agent_key).toBe('/workspace/archive/.agent.json');
        expect(JSON.parse(rawRow!.payload_json)).toEqual(expect.objectContaining({
            agentKey: '/workspace/archive/.agent.json'
        }));
    });

    it('falls back to the dedicated agent_key column when payload_json omits agentKey', () => {
        const database = createDatabase(createConfig());
        const repository = new SyncRepository(database);

        database
            .prepare(`
                INSERT INTO synced_conversations (
                    sync_key,
                    conversation_id,
                    title,
                    agent_key,
                    backend_id,
                    source_type,
                    external_id,
                    messages_json,
                    updated_at,
                    deleted,
                    synced_at,
                    server_cursor,
                    payload_json,
                    created_at,
                    last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
                'alpha',
                'conv-legacy',
                'Legacy',
                '/workspace/docs/.agent.json',
                null,
                null,
                null,
                JSON.stringify([{ id: 'm1', role: 'user', content: 'hello' }]),
                100,
                0,
                100,
                1,
                JSON.stringify({
                    id: 'conv-legacy',
                    title: 'Legacy',
                    updatedAt: 100,
                    messages: [{ id: 'm1', role: 'user', content: 'hello' }]
                }),
                100,
                100
            );

        expect(repository.getConversation('alpha', 'conv-legacy')?.conversation).toEqual(expect.objectContaining({
            id: 'conv-legacy',
            agentKey: '/workspace/docs/.agent.json'
        }));
    });
});
