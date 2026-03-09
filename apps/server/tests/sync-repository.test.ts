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

function createConversation(id: string, updatedAt: number, deleted = false): SyncConversation {
    return {
        id,
        title: `Conversation ${id}`,
        updatedAt,
        messages: [
            {
                id: `${id}-m1`,
                role: 'user',
                content: `message:${id}`
            }
        ],
        sync: deleted ? { deleted: true } : undefined
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
});
