import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../contracts/Task';
import {
    MemoryTaskReplicaPersistence,
    TaskReplicaProvider
} from './TaskReplicaProvider';
import {
    MemoryTaskSyncCursorStore,
    TaskSyncClient
} from './TaskSyncClient';

function createTask(overrides: Partial<Task> = {}): Task {
    return {
        id: overrides.id ?? 'task-seed',
        title: overrides.title ?? 'Replica task',
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

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'content-type': 'application/json'
        }
    });
}

describe('TaskSyncClient', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('pushes dirty tasks and tombstones through the injected fetch implementation', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));
        vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

        const replica = new TaskReplicaProvider({
            persistence: new MemoryTaskReplicaPersistence()
        });
        const cursorStore = new MemoryTaskSyncCursorStore();

        const created = await replica.createTask(createTask({
            title: 'Push me',
            documentId: 'doc-push'
        }));
        vi.setSystemTime(new Date('2026-07-03T12:01:00.000Z'));
        const deleted = await replica.createTask(createTask({
            title: 'Delete me',
            documentId: 'doc-delete'
        }));
        await replica.deleteTask(deleted.id);

        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe('https://hub.example/api/sync/tasks/push');
            expect(init?.headers).toMatchObject({
                'content-type': 'application/json',
                'x-sync-key': 'workspace-a'
            });
            expect(JSON.parse(String(init?.body))).toEqual({
                tasks: [
                    expect.objectContaining({
                        id: created.id,
                        title: 'Push me'
                    })
                ],
                deletedTasks: [
                    expect.objectContaining({
                        id: deleted.id
                    })
                ]
            });
            return jsonResponse({
                processedIds: [created.id],
                processedDeletedIds: [deleted.id],
                nextCursor: 20
            });
        });

        const client = new TaskSyncClient({
            replica,
            syncKey: 'workspace-a',
            baseUrl: 'https://hub.example/api/sync',
            fetchImpl,
            cursorStore
        });

        await client.pushDirty();

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        await expect(replica.listDirtyTasks()).resolves.toEqual([]);
        await expect(replica.listDeletedTasks()).resolves.toEqual([]);
        await expect(cursorStore.getCursor('workspace-a')).resolves.toBe(20);
    });

    it('pulls from the persisted cursor and applies remote tasks plus deletes', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));

        const replica = new TaskReplicaProvider({
            persistence: new MemoryTaskReplicaPersistence()
        });
        await replica.applyRemoteTasks([
            createTask({
                id: 'task-stale',
                title: 'Local stale',
                documentId: 'doc-stale',
                updatedAt: 10
            }),
            createTask({
                id: 'task-delete',
                title: 'Delete locally',
                documentId: 'doc-delete',
                updatedAt: 11
            })
        ]);

        const cursorStore = new MemoryTaskSyncCursorStore();
        await cursorStore.setCursor('workspace-b', 9);

        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe('https://hub.example/api/sync/tasks/pull');
            expect(JSON.parse(String(init?.body))).toEqual({ cursor: 9 });
            return jsonResponse({
                tasks: [
                    createTask({
                        id: 'task-stale',
                        title: 'Remote latest',
                        documentId: 'doc-stale',
                        updatedAt: 50
                    })
                ],
                deletedTasks: [
                    {
                        id: 'task-delete',
                        updatedAt: 60
                    }
                ],
                nextCursor: 60
            });
        });

        const client = new TaskSyncClient({
            replica,
            syncKey: 'workspace-b',
            baseUrl: 'https://hub.example/api/sync',
            fetchImpl,
            cursorStore
        });

        await client.pullSince();

        await expect(replica.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-stale')).resolves.toEqual([
            expect.objectContaining({
                id: 'task-stale',
                title: 'Remote latest',
                updatedAt: 50
            })
        ]);
        await expect(replica.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-delete')).resolves.toEqual([]);
        await expect(cursorStore.getCursor('workspace-b')).resolves.toBe(60);
    });

    it('hydrates by pushing dirty startup tasks before pulling from the pre-push cursor', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));
        vi.spyOn(Math, 'random').mockReturnValue(0.987654321);

        const replica = new TaskReplicaProvider({
            persistence: new MemoryTaskReplicaPersistence()
        });
        const localTask = await replica.createTask(createTask({
            title: 'Startup dirty',
            documentId: 'doc-startup'
        }));

        const cursorStore = new MemoryTaskSyncCursorStore();
        await cursorStore.setCursor('workspace-c', 5);
        const requests: Array<{ url: string; body: unknown }> = [];

        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const body = JSON.parse(String(init?.body));
            requests.push({ url, body });

            if (url.endsWith('/tasks/push')) {
                return jsonResponse({
                    processedIds: [localTask.id],
                    processedDeletedIds: [],
                    nextCursor: 12
                });
            }

            return jsonResponse({
                tasks: [
                    createTask({
                        id: 'remote-task',
                        title: 'Remote from older cursor window',
                        documentId: 'doc-remote',
                        updatedAt: 8
                    })
                ],
                deletedTasks: [],
                nextCursor: 18
            });
        });

        const client = new TaskSyncClient({
            replica,
            syncKey: 'workspace-c',
            baseUrl: 'https://hub.example/api/sync',
            fetchImpl,
            cursorStore
        });

        await client.hydrate();

        expect(requests).toEqual([
            {
                url: 'https://hub.example/api/sync/tasks/push',
                body: {
                    tasks: [
                        expect.objectContaining({
                            id: localTask.id,
                            title: 'Startup dirty'
                        })
                    ],
                    deletedTasks: []
                }
            },
            {
                url: 'https://hub.example/api/sync/tasks/pull',
                body: { cursor: 5 }
            }
        ]);
        await expect(replica.listDirtyTasks()).resolves.toEqual([]);
        await expect(replica.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-remote')).resolves.toEqual([
            expect.objectContaining({
                id: 'remote-task',
                title: 'Remote from older cursor window'
            })
        ]);
        await expect(cursorStore.getCursor('workspace-c')).resolves.toBe(18);
    });

    it('syncs new mutations only when explicitly triggered, without a periodic timer', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));
        vi.spyOn(Math, 'random').mockReturnValue(0.314159265);

        const replica = new TaskReplicaProvider({
            persistence: new MemoryTaskReplicaPersistence()
        });
        const created = await replica.createTask(createTask({
            title: 'Mutation task',
            documentId: 'doc-mutation'
        }));
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).endsWith('/tasks/push')) {
                return jsonResponse({
                    processedIds: [created.id],
                    processedDeletedIds: [],
                    nextCursor: 30
                });
            }

            return jsonResponse({
                tasks: [],
                deletedTasks: [],
                nextCursor: 30
            });
        });

        const client = new TaskSyncClient({
            replica,
            syncKey: 'workspace-d',
            baseUrl: 'https://hub.example/api/sync',
            fetchImpl,
            cursorStore: new MemoryTaskSyncCursorStore()
        });

        expect(fetchImpl).not.toHaveBeenCalled();
        await client.syncAfterMutation();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        await expect(replica.listDirtyTasks()).resolves.toEqual([]);
    });
});
