import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../contracts/Task';
import {
    MemoryTaskReplicaPersistence,
    TaskReplicaProvider,
    type TaskReplicaPersistence,
    type ReplicaDeletedTask
} from './TaskReplicaProvider';

type StoredRows = Record<string, unknown>;

const stores = new Map<string, StoredRows>();

vi.mock('localforage', () => ({
    default: {
        createInstance: ({ name, storeName }: { name: string; storeName: string }) => {
            const key = `${name}:${storeName}`;
            if (!stores.has(key)) {
                stores.set(key, {});
            }
            const target = stores.get(key)!;
            return {
                async getItem<T>(itemKey: string) {
                    const value = target[itemKey];
                    return (value === undefined ? null : structuredClone(value)) as T | null;
                },
                async setItem(itemKey: string, value: unknown) {
                    target[itemKey] = structuredClone(value);
                    return value;
                },
                async clear() {
                    Object.keys(target).forEach((itemKey) => {
                        delete target[itemKey];
                    });
                }
            };
        }
    }
}));

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

describe('TaskReplicaProvider', () => {
    beforeEach(() => {
        stores.clear();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('uses localforage persistence by default', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));
        vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

        const writer = new TaskReplicaProvider();
        const created = await writer.createTask(createTask({
            id: 'ignored',
            title: 'Persisted task',
            documentPath: 'docs/guide.md',
            documentId: ' doc-1 ',
            agentKey: ' /docs/ '
        }));

        const reader = new TaskReplicaProvider();
        await expect(reader.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-1')).resolves.toEqual([
            expect.objectContaining({
                id: created.id,
                title: 'Persisted task',
                documentPath: '/docs/guide.md',
                documentId: 'doc-1',
                agentKey: '/docs/'
            })
        ]);

        await reader.clearReplica();
        await expect(writer.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-1')).resolves.toEqual([]);
    });

    it('marks local creates and updates as dirty until marked synced', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));
        vi.spyOn(Math, 'random').mockReturnValue(0.222222222);

        const provider = new TaskReplicaProvider({
            persistence: new MemoryTaskReplicaPersistence()
        });

        const created = await provider.createTask(createTask({
            title: 'Dirty task',
            documentPath: 'docs/guide.md',
            documentId: ' doc-1 ',
            agentKey: ' /docs/ '
        }));
        vi.setSystemTime(new Date('2026-07-03T12:05:00.000Z'));
        const updated = await provider.updateTask({
            ...created,
            title: 'Dirty task updated'
        });

        await expect(provider.listDirtyTasks()).resolves.toEqual([
            expect.objectContaining({
                id: updated.id,
                title: 'Dirty task updated',
                updatedAt: updated.updatedAt
            })
        ]);

        await provider.markTasksSynced([updated.id]);
        await expect(provider.listDirtyTasks()).resolves.toEqual([]);
    });

    it('tracks deletions as tombstones until sync confirmation', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));
        vi.spyOn(Math, 'random').mockReturnValue(0.333333333);

        const provider = new TaskReplicaProvider({
            persistence: new MemoryTaskReplicaPersistence()
        });

        const created = await provider.createTask(createTask({
            title: 'Delete me',
            documentId: 'doc-delete'
        }));
        vi.setSystemTime(new Date('2026-07-03T12:10:00.000Z'));
        await provider.deleteTask(created.id);

        await expect(provider.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-delete')).resolves.toEqual([]);
        await expect(provider.listDeletedTasks()).resolves.toEqual([
            expect.objectContaining<ReplicaDeletedTask>({
                id: created.id,
                updatedAt: new Date('2026-07-03T12:10:00.000Z').getTime()
            })
        ]);

        await provider.markDeletedTasksSynced([created.id]);
        await expect(provider.listDeletedTasks()).resolves.toEqual([]);
    });

    it('rolls recurring tasks forward instead of completing them permanently', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));

        const provider = new TaskReplicaProvider({
            persistence: new MemoryTaskReplicaPersistence()
        });
        await provider.applyRemoteTasks([
            createTask({
                id: 'task-recurring',
                title: 'Daily task',
                dueAt: new Date('2026-07-04T09:00:00.000Z').getTime(),
                recurrence: 'daily',
                updatedAt: new Date('2026-07-03T11:00:00.000Z').getTime()
            })
        ]);

        const result = await provider.setTaskCompleted('task-recurring', true);
        expect(result).toEqual(expect.objectContaining({
            id: 'task-recurring',
            completed: false,
            completedAt: null,
            dueAt: new Date('2026-07-05T09:00:00.000Z').getTime(),
            recurrence: 'daily'
        }));
        await expect(provider.listDirtyTasks()).resolves.toEqual([
            expect.objectContaining({
                id: 'task-recurring',
                dueAt: new Date('2026-07-05T09:00:00.000Z').getTime()
            })
        ]);
    });

    it('applies remote tasks with per-task LWW semantics', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));
        vi.spyOn(Math, 'random').mockReturnValue(0.444444444);

        const provider = new TaskReplicaProvider({
            persistence: new MemoryTaskReplicaPersistence()
        });

        const created = await provider.createTask(createTask({
            title: 'Local draft',
            documentId: 'doc-lww'
        }));
        vi.setSystemTime(new Date('2026-07-03T12:05:00.000Z'));
        const locallyUpdated = await provider.updateTask({
            ...created,
            title: 'Local latest'
        });

        await provider.applyRemoteTasks([
            createTask({
                ...locallyUpdated,
                title: 'Remote stale',
                updatedAt: locallyUpdated.updatedAt - 1_000
            })
        ]);
        await expect(provider.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-lww')).resolves.toEqual([
            expect.objectContaining({
                id: created.id,
                title: 'Local latest'
            })
        ]);
        await expect(provider.listDirtyTasks()).resolves.toHaveLength(1);

        await provider.applyRemoteTasks([
            createTask({
                ...locallyUpdated,
                title: 'Remote winner',
                updatedAt: locallyUpdated.updatedAt + 1_000
            })
        ]);
        await expect(provider.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-lww')).resolves.toEqual([
            expect.objectContaining({
                id: created.id,
                title: 'Remote winner',
                updatedAt: locallyUpdated.updatedAt + 1_000
            })
        ]);
        await expect(provider.listDirtyTasks()).resolves.toEqual([]);
    });

    it('preserves synced calendar metadata when a stale local task snapshot is edited', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));

        const provider = new TaskReplicaProvider({
            persistence: new MemoryTaskReplicaPersistence()
        });
        await provider.applyRemoteTasks([
            createTask({
                id: 'task-calendar-preserve',
                title: 'Calendar task',
                dueAt: new Date('2026-05-24T09:00:00.000Z').getTime(),
                updatedAt: new Date('2026-07-03T12:00:00.000Z').getTime(),
                calendarProviderId: 'google-calendar',
                calendarEventId: 'event-1',
                calendarSyncStatus: 'synced',
                calendarLastSyncedAt: new Date('2026-07-03T12:00:00.000Z').getTime()
            })
        ]);

        const staleUiTask = createTask({
            id: 'task-calendar-preserve',
            title: 'Calendar task updated',
            notes: 'Edited from stale UI snapshot',
            dueAt: new Date('2026-05-24T09:00:00.000Z').getTime(),
            updatedAt: new Date('2026-07-03T12:00:00.000Z').getTime(),
            calendarProviderId: null,
            calendarEventId: null,
            calendarSyncStatus: null,
            calendarLastSyncedAt: null,
            calendarLastSyncError: null
        });

        vi.setSystemTime(new Date('2026-07-03T12:05:00.000Z'));
        const updated = await provider.updateTask(staleUiTask);

        expect(updated).toEqual(expect.objectContaining({
            title: 'Calendar task updated',
            calendarProviderId: 'google-calendar',
            calendarEventId: 'event-1',
            calendarSyncStatus: 'synced',
            calendarLastSyncedAt: new Date('2026-07-03T12:00:00.000Z').getTime()
        }));
    });

    it('applies remote deletions only when they are newer than the local record', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));

        const provider = new TaskReplicaProvider({
            persistence: new MemoryTaskReplicaPersistence()
        });
        await provider.applyRemoteTasks([
            createTask({
                id: 'task-delete-lww',
                title: 'Delete via remote',
                documentId: 'doc-remote-delete',
                updatedAt: new Date('2026-07-03T12:00:00.000Z').getTime()
            })
        ]);

        await provider.applyRemoteDeletedTasks([
            {
                id: 'task-delete-lww',
                updatedAt: new Date('2026-07-03T11:59:59.000Z').getTime()
            }
        ]);
        await expect(provider.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-remote-delete')).resolves.toHaveLength(1);

        await provider.applyRemoteDeletedTasks([
            {
                id: 'task-delete-lww',
                updatedAt: new Date('2026-07-03T12:00:01.000Z').getTime()
            }
        ]);
        await expect(provider.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-remote-delete')).resolves.toEqual([]);
    });

    it('clears the replica even when persistence only exposes read and write', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));
        vi.spyOn(Math, 'random').mockReturnValue(0.555555555);

        const rows: unknown[] = [];
        const provider = new TaskReplicaProvider({
            persistence: {
                async read() {
                    return structuredClone(rows) as Awaited<ReturnType<TaskReplicaPersistence['read']>>;
                },
                async write(nextRows) {
                    rows.splice(0, rows.length, ...structuredClone(nextRows));
                }
            } satisfies TaskReplicaPersistence
        });

        await provider.createTask(createTask({
            title: 'Fallback clear',
            documentId: 'doc-clear'
        }));
        await expect(provider.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-clear')).resolves.toHaveLength(1);

        await provider.clearReplica();
        await expect(provider.getTasks('/docs/guide.md', '/docs/', false, 'all', 'doc-clear')).resolves.toEqual([]);
    });
});
