import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Task } from '@plugins/task-mgr/api';
import type { ITaskCalendarSyncService } from './ITaskCalendarSyncService.ts';
import { FileSystemTaskProvider } from './FileSystemTaskProvider.ts';

const tempRoots: string[] = [];

function createTask(overrides: Partial<Task> = {}): Task {
    return {
        id: 'temp-task',
        title: 'Follow up',
        notes: '',
        completed: false,
        dueAt: null,
        priority: null,
        documentPath: '/workspace/guide.md',
        agentKey: null,
        createdAt: 0,
        updatedAt: 0,
        completedAt: null,
        calendarProviderId: null,
        calendarEventId: null,
        calendarSyncStatus: null,
        calendarLastSyncedAt: null,
        calendarLastSyncError: null,
        ...overrides
    };
}

async function createProvider(syncService?: ITaskCalendarSyncService | null) {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-task-provider-'));
    tempRoots.push(rootPath);
    await mkdir(path.join(rootPath, 'workspace'), { recursive: true });

    return {
        rootPath,
        provider: new FileSystemTaskProvider({
            resolveRootDirectory: async () => rootPath,
            calendarSyncService: syncService ?? null
        })
    };
}

async function createProviderWithResolver(
    resolveDocumentIdForTaskPath: (documentPath: string) => Promise<string | null>,
    syncService?: ITaskCalendarSyncService | null
) {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-task-provider-'));
    tempRoots.push(rootPath);
    await mkdir(path.join(rootPath, 'workspace'), { recursive: true });

    return {
        rootPath,
        provider: new FileSystemTaskProvider({
            resolveRootDirectory: async () => rootPath,
            calendarSyncService: syncService ?? null,
            resolveDocumentIdForTaskPath
        })
    };
}

describe('FileSystemTaskProvider', () => {
    afterEach(async () => {
        await Promise.all(tempRoots.map(async (root) => {
            await rm(root, { recursive: true, force: true });
        }));
        tempRoots.length = 0;
    });

    it('skips sync for non-timed tasks', async () => {
        const syncService = {
            syncTask: vi.fn(),
            deleteTask: vi.fn()
        } satisfies ITaskCalendarSyncService;
        const { provider } = await createProvider(syncService);

        const created = await provider.createTask(createTask());

        expect(syncService.syncTask).not.toHaveBeenCalled();
        expect(created.calendarSyncStatus).toBeNull();
        expect(created.calendarEventId).toBeNull();
    });

    it('syncs date-only tasks on create and persists sync metadata', async () => {
        const syncService = {
            syncTask: vi.fn(async () => ({
                providerId: 'google-calendar',
                eventId: 'event-date-only',
                syncedAt: 500
            })),
            deleteTask: vi.fn(async () => undefined)
        } satisfies ITaskCalendarSyncService;
        const { provider } = await createProvider(syncService);

        const created = await provider.createTask(createTask({
            dueAt: new Date('2026-05-24T00:00:00').getTime()
        }));

        expect(syncService.syncTask).toHaveBeenCalledTimes(1);
        expect(created.calendarEventId).toBe('event-date-only');
        expect(created.calendarSyncStatus).toBe('synced');
    });

    it('syncs timed tasks on create and persists sync metadata', async () => {
        const syncService = {
            syncTask: vi.fn(async () => ({
                providerId: 'google-calendar',
                eventId: 'event-1',
                syncedAt: 500
            })),
            deleteTask: vi.fn(async () => undefined)
        } satisfies ITaskCalendarSyncService;
        const { provider, rootPath } = await createProvider(syncService);

        const created = await provider.createTask(createTask({
            dueAt: new Date('2026-05-24T09:00:00-04:00').getTime()
        }));

        expect(syncService.syncTask).toHaveBeenCalledTimes(1);
        expect(created.calendarProviderId).toBe('google-calendar');
        expect(created.calendarEventId).toBe('event-1');
        expect(created.calendarSyncStatus).toBe('synced');
        expect(created.calendarLastSyncedAt).toBe(500);
        expect(created.calendarLastSyncError).toBeNull();

        const stored = await readFile(path.join(rootPath, '.chatprism', 'tasks.json'), 'utf8');
        expect(stored).toContain('"calendarEventId": "event-1"');
        expect(stored).toContain('"calendarSyncStatus": "synced"');
    });

    it('updates existing synced events on task update', async () => {
        const syncService = {
            syncTask: vi.fn(async (task: Task) => ({
                providerId: 'google-calendar',
                eventId: task.calendarEventId ?? 'event-created',
                syncedAt: 900
            })),
            deleteTask: vi.fn(async () => undefined)
        } satisfies ITaskCalendarSyncService;
        const { provider } = await createProvider(syncService);

        const created = await provider.createTask(createTask({
            dueAt: new Date('2026-05-24T09:00:00-04:00').getTime(),
            calendarEventId: 'event-1',
            calendarProviderId: 'google-calendar'
        }));
        const updated = await provider.updateTask({
            ...created,
            notes: 'Updated notes'
        });

        expect(syncService.syncTask).toHaveBeenCalledTimes(2);
        expect(updated.calendarEventId).toBe('event-1');
        expect(updated.calendarSyncStatus).toBe('synced');
        expect(updated.calendarLastSyncedAt).toBe(900);
    });

    it('syncs a task on update when it was created without calendar sync', async () => {
        const syncService = {
            syncTask: vi.fn(async (task: Task) => ({
                providerId: 'google-calendar',
                eventId: task.calendarEventId ?? 'event-created',
                syncedAt: 900
            })),
            deleteTask: vi.fn(async () => undefined)
        } satisfies ITaskCalendarSyncService;
        const { provider, rootPath } = await createProvider(syncService);

        const created = await provider.createTask(createTask({
            dueAt: null
        }));
        const updated = await provider.updateTask({
            ...created,
            dueAt: new Date('2026-05-24T09:00:00-04:00').getTime()
        });

        expect(syncService.syncTask).toHaveBeenCalledTimes(1);
        expect(updated.calendarEventId).toBe('event-created');
        expect(updated.calendarSyncStatus).toBe('synced');
        expect(updated.calendarLastSyncedAt).toBe(900);

        const stored = await readFile(path.join(rootPath, '.chatprism', 'tasks.json'), 'utf8');
        expect(stored).toContain('"calendarEventId": "event-created"');
        expect(stored).toContain('"calendarSyncStatus": "synced"');
    });

    it('persists failed sync state without rolling back the task save', async () => {
        const syncService = {
            syncTask: vi.fn(async () => {
                throw new Error('calendar unavailable');
            }),
            deleteTask: vi.fn(async () => undefined)
        } satisfies ITaskCalendarSyncService;
        const { provider } = await createProvider(syncService);

        const created = await provider.createTask(createTask({
            dueAt: new Date('2026-05-24T07:30:00-04:00').getTime()
        }));

        expect(created.id).toContain('task-');
        expect(created.calendarProviderId).toBe('google-calendar');
        expect(created.calendarSyncStatus).toBe('failed');
        expect(created.calendarLastSyncError).toContain('calendar unavailable');

        await expect(provider.getTasks('/workspace/guide.md', null, false)).resolves.toEqual([
            expect.objectContaining({
                id: created.id,
                calendarSyncStatus: 'failed'
            })
        ]);
    });

    it('deletes synced calendar events when removing a task', async () => {
        const syncService = {
            syncTask: vi.fn(async () => ({
                providerId: 'google-calendar',
                eventId: 'event-1',
                syncedAt: 500
            })),
            deleteTask: vi.fn(async () => undefined)
        } satisfies ITaskCalendarSyncService;
        const { provider } = await createProvider(syncService);

        const created = await provider.createTask(createTask({
            dueAt: new Date('2026-05-24T09:00:00-04:00').getTime()
        }));

        await provider.deleteTask(created.id);

        expect(syncService.deleteTask).toHaveBeenCalledWith(expect.objectContaining({
            id: created.id,
            calendarEventId: 'event-1'
        }));
        await expect(provider.getTasks('/workspace/guide.md', null, false)).resolves.toEqual([]);
    });

    it('still deletes the local task when calendar event deletion fails', async () => {
        const syncService = {
            syncTask: vi.fn(async () => ({
                providerId: 'google-calendar',
                eventId: 'event-1',
                syncedAt: 500
            })),
            deleteTask: vi.fn(async () => {
                throw new Error('calendar delete failed');
            })
        } satisfies ITaskCalendarSyncService;
        const { provider } = await createProvider(syncService);

        const created = await provider.createTask(createTask({
            dueAt: new Date('2026-05-24T09:00:00-04:00').getTime()
        }));

        await provider.deleteTask(created.id);

        expect(syncService.deleteTask).toHaveBeenCalledTimes(1);
        await expect(provider.getTasks('/workspace/guide.md', null, false)).resolves.toEqual([]);
    });

    it('supports document, agent, and global scopes with tag-based filtering', async () => {
        const { provider } = await createProvider();
        const now = new Date();
        const todayDueAt = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            Math.min(now.getHours() + 1, 23),
            30,
            0,
            0
        ).getTime();
        const futureDueAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 9, 0, 0, 0).getTime();
        const pastDueAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9, 0, 0, 0).getTime();

        const docTask = await provider.createTask(createTask({
            title: 'Document task',
            documentPath: '/workspace/guide.md',
            agentKey: '/workspace/',
            dueAt: todayDueAt
        }));
        const projectTask = await provider.createTask(createTask({
            title: 'Project task',
            documentPath: null,
            agentKey: '/workspace/',
            dueAt: futureDueAt
        }));
        const overdueTask = await provider.createTask(createTask({
            title: 'Overdue task',
            documentPath: null,
            agentKey: '/other/',
            dueAt: pastDueAt
        }));

        await expect(provider.getTasks('/workspace/guide.md', '/workspace/', false, 'all')).resolves.toEqual([
            expect.objectContaining({ id: docTask.id, title: 'Document task' })
        ]);
        await expect(provider.getTasks(null, '/workspace/', false, 'all')).resolves.toEqual(expect.arrayContaining([
            expect.objectContaining({ id: docTask.id, title: 'Document task' }),
            expect.objectContaining({ id: projectTask.id, title: 'Project task' })
        ]));
        await expect(provider.getTasks(null, null, false, 'all')).resolves.toEqual(expect.arrayContaining([
            expect.objectContaining({ id: docTask.id }),
            expect.objectContaining({ id: projectTask.id }),
            expect.objectContaining({ id: overdueTask.id })
        ]));
        await expect(provider.getTasks(null, null, false, 'today')).resolves.toEqual(expect.arrayContaining([
            expect.objectContaining({ id: docTask.id, title: 'Document task' }),
            expect.objectContaining({ id: overdueTask.id, title: 'Overdue task' })
        ]));
        await expect(provider.getTasks(null, null, false, 'planned')).resolves.toEqual(expect.arrayContaining([
            expect.objectContaining({ id: docTask.id }),
            expect.objectContaining({ id: projectTask.id })
        ]));
        await expect(provider.getTasks(null, null, false, 'planned')).resolves.not.toEqual(expect.arrayContaining([
            expect.objectContaining({ id: overdueTask.id })
        ]));
    });

    it('supports tasks that belong to both a document and an agent scope', async () => {
        const { provider } = await createProvider();
        const created = await provider.createTask(createTask({
            title: 'Scoped task',
            documentPath: '/workspace/guide.md',
            agentKey: '/workspace/'
        }));

        await expect(provider.getTasks('/workspace/guide.md', null, false, 'all')).resolves.toEqual([
            expect.objectContaining({ id: created.id, title: 'Scoped task' })
        ]);
        await expect(provider.getTasks(null, '/workspace/', false, 'all')).resolves.toEqual([
            expect.objectContaining({ id: created.id, title: 'Scoped task' })
        ]);
        await expect(provider.getTasks('/workspace/guide.md', '/workspace/', false, 'all')).resolves.toEqual([
            expect.objectContaining({ id: created.id, title: 'Scoped task' })
        ]);
    });

    it('assigns documentId when creating a markdown-scoped task without one', async () => {
        const resolveDocumentIdForTaskPath = vi.fn(async (documentPath: string) => (
            documentPath === '/workspace/guide.md' ? 'doc-guide' : null
        ));
        const { provider } = await createProviderWithResolver(resolveDocumentIdForTaskPath);

        const created = await provider.createTask(createTask({
            documentId: null,
            documentPath: '/workspace/guide.md'
        }));

        expect(resolveDocumentIdForTaskPath).toHaveBeenCalledWith('/workspace/guide.md');
        expect(created.documentId).toBe('doc-guide');
    });

    it('migrates stored markdown tasks that are missing documentId', async () => {
        const resolveDocumentIdForTaskPath = vi.fn(async (documentPath: string) => (
            documentPath === '/workspace/guide.md' ? 'doc-guide' : null
        ));
        const { provider, rootPath } = await createProviderWithResolver(resolveDocumentIdForTaskPath);

        await provider.createTask(createTask({
            id: 'legacy-task',
            title: 'Legacy task',
            documentId: undefined,
            documentPath: '/workspace/guide.md'
        }));

        const storagePath = path.join(rootPath, '.chatprism', 'tasks.json');
        const storedBefore = await readFile(storagePath, 'utf8');
        expect(storedBefore).toContain('"documentId": "doc-guide"');

        const rewritten = storedBefore.replace('"documentId": "doc-guide"', '"documentId": null');
        await writeFile(storagePath, rewritten, 'utf8');

        const changed = await provider.migrateMissingDocumentIds();

        expect(changed).toBe(1);
        const storedAfter = await readFile(storagePath, 'utf8');
        expect(storedAfter).toContain('"documentId": "doc-guide"');
    });
});
