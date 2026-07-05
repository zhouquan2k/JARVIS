import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../api';
import {
    MemoryTaskReplicaPersistence
} from './replica/TaskReplicaProvider';
import {
    MemoryTaskSyncCursorStore
} from './replica/TaskSyncClient';
import {
    getTaskService,
    registerTaskService,
    resetTaskServiceForTests
} from './taskServiceRegistry';

function createTask(overrides: Partial<Task> = {}): Task {
    return {
        id: overrides.id ?? 'task-seed',
        title: overrides.title ?? 'Registry task',
        notes: overrides.notes ?? '',
        completed: overrides.completed ?? false,
        dueAt: overrides.dueAt ?? null,
        priority: overrides.priority ?? null,
        executionState: overrides.executionState ?? null,
        documentPath: overrides.documentPath ?? '/docs/guide.md',
        documentId: overrides.documentId,
        agentKey: overrides.agentKey ?? '/docs/',
        createdAt: overrides.createdAt ?? 1,
        updatedAt: overrides.updatedAt ?? 1,
        completedAt: overrides.completedAt ?? null,
        calendarProviderId: overrides.calendarProviderId ?? null,
        calendarEventId: overrides.calendarEventId ?? null,
        calendarSyncStatus: overrides.calendarSyncStatus ?? null,
        calendarLastSyncedAt: overrides.calendarLastSyncedAt ?? null,
        calendarLastSyncError: overrides.calendarLastSyncError ?? null,
        recurrence: overrides.recurrence ?? null
    };
}

function flushMicrotasks(): Promise<void> {
    return Promise.resolve().then(() => undefined);
}

function flushPromises(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

describe('taskServiceRegistry', () => {
    beforeEach(() => {
        resetTaskServiceForTests();
        vi.restoreAllMocks();
    });

    it('always uses the replica-backed task service when sync config is present', async () => {
        registerTaskService({
            baseUrl: 'https://hub.example/api/context',
            syncBaseUrl: 'https://hub.example/api/sync',
            env: {
                VITE_SYNC_KEY: 'workspace-registry'
            },
            fetchImpl: vi.fn(async () => new Response(JSON.stringify({
                tasks: [],
                deletedTasks: [],
                nextCursor: null
            }), {
                status: 200,
                headers: {
                    'content-type': 'application/json'
                }
            })),
            replicaPersistence: new MemoryTaskReplicaPersistence(),
            replicaCursorStore: new MemoryTaskSyncCursorStore()
        });

        await flushMicrotasks();
        await flushPromises();

        await expect(getTaskService().getTasks('/docs/guide.md', '/docs/', false, 'all', null)).resolves.toEqual([]);
        expect(getTaskService()).toHaveProperty('id', 'task-replica-service');
    });

    it('uses the replica-backed task service when the flag is enabled and keeps local writes offline-safe', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error('offline');
        });

        registerTaskService({
            baseUrl: 'https://hub.example/api/context',
            syncBaseUrl: 'https://hub.example/api/sync',
            env: {
                VITE_SYNC_KEY: 'workspace-registry'
            },
            fetchImpl,
            replicaPersistence: new MemoryTaskReplicaPersistence(),
            replicaCursorStore: new MemoryTaskSyncCursorStore()
        });

        const service = getTaskService();
        const created = await service.createTask(createTask({
            title: 'Offline first',
            documentId: 'doc-offline'
        }));

        await flushMicrotasks();

        await expect(service.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-offline')).resolves.toEqual([
            expect.objectContaining({
                id: created.id,
                title: 'Offline first'
            })
        ]);
        expect(fetchImpl).toHaveBeenCalled();
    });

    it('defaults to the replica-backed task service when sync base url and sync key are configured', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            tasks: [
                createTask({
                    id: 'remote-task',
                    title: 'Remote replica task',
                    documentId: 'doc-remote',
                    updatedAt: 10
                })
            ],
            deletedTasks: [],
            nextCursor: 10
        }), {
            status: 200,
            headers: {
                'content-type': 'application/json'
            }
        }));

        registerTaskService({
            baseUrl: 'https://hub.example/api/context',
            syncBaseUrl: 'https://hub.example/api/sync',
            env: {
                VITE_SYNC_KEY: 'workspace-registry'
            },
            fetchImpl,
            replicaPersistence: new MemoryTaskReplicaPersistence(),
            replicaCursorStore: new MemoryTaskSyncCursorStore()
        });

        await flushMicrotasks();
        await flushPromises();

        await expect(getTaskService().getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-remote')).resolves.toEqual([
            expect.objectContaining({
                id: 'remote-task',
                title: 'Remote replica task'
            })
        ]);
    });
});
