import { describe, expect, it } from 'vitest';
import type { Task } from '@plugins/task-mgr/api';
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
        corsAllowlist: [],
        contextBackend: 'local-file',
        codexCommand: 'codex',
        codexWorkingDirectory: process.cwd()
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

function createTask(id: string, updatedAt: number, overrides: Partial<Task> = {}): Task {
    return {
        id,
        title: overrides.title ?? `Task ${id}`,
        notes: overrides.notes ?? '',
        completed: overrides.completed ?? false,
        dueAt: overrides.dueAt ?? null,
        priority: overrides.priority ?? null,
        executionState: overrides.executionState ?? null,
        documentPath: overrides.documentPath ?? null,
        documentId: overrides.documentId ?? null,
        agentKey: overrides.agentKey ?? '/',
        createdAt: overrides.createdAt ?? updatedAt,
        updatedAt,
        completedAt: overrides.completedAt ?? null,
        calendarProviderId: overrides.calendarProviderId ?? null,
        calendarEventId: overrides.calendarEventId ?? null,
        calendarSyncStatus: overrides.calendarSyncStatus ?? null,
        calendarLastSyncedAt: overrides.calendarLastSyncedAt ?? null,
        calendarLastSyncError: overrides.calendarLastSyncError ?? null,
        recurrence: overrides.recurrence ?? null
    };
}

describe('SyncService', () => {
    it('enforces namespace isolation and last-write-wins semantics for conversations and delete events', () => {
        const database = createDatabase(createConfig());
        const service = new SyncService(new SyncRepository(database));

        const firstPush = service.push('workspace-a', [
            createConversation('shared', 100, {
                origin: 'chatgpt-web',
                externalId: 'import-1',
                messages: [
                    {
                        id: 'shared-m1',
                        role: 'user',
                        content: 'question',
                        createdAt: 99,
                        questionId: 'question-shared',
                        starred: true,
                        deleted: true
                    }
                ]
            })
        ]);
        expect(firstPush.processedIds).toEqual(['shared']);
        expect(firstPush.processedDeletedIds).toEqual([]);
        expect(firstPush.nextCursor).toBe(1);

        const olderPush = service.push('workspace-a', [createConversation('shared', 90)]);
        expect(olderPush.processedIds).toEqual([]);
        expect(olderPush.nextCursor).toBe(1);

        const deletePush = service.push('workspace-a', [], [
            {
                id: 'shared',
                updatedAt: 110
            }
        ]);
        expect(deletePush.processedIds).toEqual([]);
        expect(deletePush.processedDeletedIds).toEqual(['shared']);
        expect(deletePush.nextCursor).toBe(2);

        const staleDelete = service.push('workspace-a', [], [
            {
                id: 'shared',
                updatedAt: 105
            }
        ]);
        expect(staleDelete.processedDeletedIds).toEqual([]);
        expect(staleDelete.nextCursor).toBe(2);

        const newerConversation = service.push('workspace-a', [
            createConversation('shared', 120, {
                title: 'Recreated after delete'
            })
        ]);
        expect(newerConversation.processedIds).toEqual(['shared']);
        expect(newerConversation.nextCursor).toBe(3);

        const otherNamespacePush = service.push('workspace-b', [createConversation('shared', 50)]);
        expect(otherNamespacePush.processedIds).toEqual(['shared']);
        expect(otherNamespacePush.nextCursor).toBe(1);

        const workspaceAPull = service.pull('workspace-a', null);
        expect(workspaceAPull.conversations).toHaveLength(1);
        expect(workspaceAPull.conversations[0].title).toBe('Recreated after delete');
        expect(workspaceAPull.deletedConversations).toEqual([
            {
                id: 'shared',
                updatedAt: 110
            }
        ]);
        expect(workspaceAPull.nextCursor).toBe(3);

        const workspaceBPull = service.pull('workspace-b', null);
        expect(workspaceBPull.conversations).toHaveLength(1);
        expect(workspaceBPull.conversations[0].updatedAt).toBe(50);
        expect(workspaceBPull.deletedConversations).toEqual([]);
        expect(workspaceBPull.nextCursor).toBe(1);
    });

    it('applies LWW and independent cursors to task sync resources', async () => {
        const database = createDatabase(createConfig());
        const service = new SyncService(new SyncRepository(database));

        const firstPush = await service.pushTasks('workspace-a', [
            createTask('task-1', 100, { title: 'First version' })
        ]);
        expect(firstPush.processedIds).toEqual(['task-1']);
        expect(firstPush.processedDeletedIds).toEqual([]);
        expect(firstPush.nextCursor).toBe(1);

        const stalePush = await service.pushTasks('workspace-a', [
            createTask('task-1', 90, { title: 'Older version' })
        ]);
        expect(stalePush.processedIds).toEqual([]);
        expect(stalePush.nextCursor).toBe(1);

        const deletePush = await service.pushTasks('workspace-a', [], [
            { id: 'task-1', updatedAt: 110 }
        ]);
        expect(deletePush.processedDeletedIds).toEqual(['task-1']);
        expect(deletePush.nextCursor).toBe(2);

        const deleteDelta = service.pullTasks('workspace-a', 1);
        expect(deleteDelta.tasks).toEqual([]);
        expect(deleteDelta.deletedTasks).toEqual([
            {
                id: 'task-1',
                updatedAt: 110
            }
        ]);
        expect(deleteDelta.nextCursor).toBe(2);

        const recreatePush = await service.pushTasks('workspace-a', [
            createTask('task-1', 120, { title: 'Recreated' })
        ]);
        expect(recreatePush.processedIds).toEqual(['task-1']);
        expect(recreatePush.nextCursor).toBe(3);

        const recreateDelta = service.pullTasks('workspace-a', 2);
        expect(recreateDelta.tasks).toEqual([
            expect.objectContaining({
                id: 'task-1',
                title: 'Recreated'
            })
        ]);
        expect(recreateDelta.deletedTasks).toEqual([]);
        expect(recreateDelta.nextCursor).toBe(3);
    });
});
