import { describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db.js';
import { SyncRepository } from '../src/repositories/syncRepository.js';
import { SyncService } from '../src/services/syncService.js';
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
        origin: overrides.origin,
        externalId: overrides.externalId,
        sync: overrides.sync
    };
}

describe('SyncService', () => {
    it('enforces namespace isolation and last-write-wins semantics', () => {
        const database = createDatabase(createConfig());
        const service = new SyncService(new SyncRepository(database));

        const firstPush = service.push('workspace-a', [
            createConversation('shared', 100, {
                origin: 'chatgpt-web',
                externalId: 'import-1'
            })
        ]);
        expect(firstPush.processedIds).toEqual(['shared']);
        expect(firstPush.nextCursor).toBe(1);

        const olderPush = service.push('workspace-a', [createConversation('shared', 90)]);
        expect(olderPush.processedIds).toEqual([]);
        expect(olderPush.nextCursor).toBe(1);

        const equalTimestampDelete = service.push('workspace-a', [
            createConversation('shared', 100, {
                sync: { deleted: true }
            })
        ]);
        expect(equalTimestampDelete.processedIds).toEqual(['shared']);
        expect(equalTimestampDelete.nextCursor).toBe(2);

        const otherNamespacePush = service.push('workspace-b', [createConversation('shared', 50)]);
        expect(otherNamespacePush.processedIds).toEqual(['shared']);
        expect(otherNamespacePush.nextCursor).toBe(1);

        const workspaceAPull = service.pull('workspace-a', null);
        expect(workspaceAPull.conversations).toHaveLength(1);
        expect(workspaceAPull.conversations[0].sync?.deleted).toBe(true);
        expect(workspaceAPull.nextCursor).toBe(2);

        const workspaceBPull = service.pull('workspace-b', null);
        expect(workspaceBPull.conversations).toHaveLength(1);
        expect(workspaceBPull.conversations[0].updatedAt).toBe(50);
        expect(workspaceBPull.nextCursor).toBe(1);
    });
});
