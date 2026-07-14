// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../contracts/Task';
import { MemoryTaskReplicaPersistence } from './TaskReplicaProvider';
import { MemoryTaskSyncCursorStore } from './TaskSyncClient';
import { ReplicaTaskService } from './ReplicaTaskService';

function emptyPullResponse(): Response {
    return new Response(
        JSON.stringify({ tasks: [], deletedTasks: [], nextCursor: null }),
        { status: 200, headers: { 'content-type': 'application/json' } }
    );
}

function createService(fetchImpl: typeof fetch): ReplicaTaskService {
    return new ReplicaTaskService({
        syncKey: 'test-key',
        baseUrl: 'https://hub.example/api/sync',
        fetchImpl,
        persistence: new MemoryTaskReplicaPersistence(),
        cursorStore: new MemoryTaskSyncCursorStore()
    });
}

async function flush(): Promise<void> {
    // Let the fire-and-forget sync promises settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function createTask(overrides: Partial<Task> = {}): Task {
    return {
        id: overrides.id ?? 'draft-task',
        title: overrides.title ?? 'Replica task',
        notes: overrides.notes ?? '',
        completed: overrides.completed ?? false,
        dueAt: overrides.dueAt ?? new Date('2026-07-10T13:00:00.000Z').getTime(),
        priority: overrides.priority ?? 'medium',
        executionState: overrides.executionState ?? null,
        documentPath: overrides.documentPath ?? '/docs/race.md',
        documentId: overrides.documentId ?? 'doc-race',
        agentKey: overrides.agentKey ?? '/docs/',
        createdAt: overrides.createdAt ?? 0,
        updatedAt: overrides.updatedAt ?? 0,
        completedAt: overrides.completedAt ?? null,
        calendarProviderId: overrides.calendarProviderId ?? null,
        calendarEventId: overrides.calendarEventId ?? null,
        calendarSyncStatus: overrides.calendarSyncStatus ?? null,
        calendarLastSyncedAt: overrides.calendarLastSyncedAt ?? null,
        calendarLastSyncError: overrides.calendarLastSyncError ?? null,
        recurrence: overrides.recurrence ?? null
    };
}

describe('ReplicaTaskService', () => {
    let service: ReplicaTaskService | null = null;

    afterEach(() => {
        service?.dispose();
        service = null;
        vi.restoreAllMocks();
    });

    it('notifies subscribers after the startup sync', async () => {
        const fetchImpl = vi.fn(async () => emptyPullResponse()) as unknown as typeof fetch;
        service = createService(fetchImpl);

        const listener = vi.fn();
        service.onChange(listener);
        await flush();

        expect(listener).toHaveBeenCalled();
    });

    it('pulls and notifies again when the window regains focus', async () => {
        const fetchImpl = vi.fn(async () => emptyPullResponse()) as unknown as typeof fetch;
        service = createService(fetchImpl);
        await flush();

        const callsAfterStartup = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
        const listener = vi.fn();
        service.onChange(listener);

        // Simulate returning to the app after the throttle window.
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
        window.dispatchEvent(new Event('focus'));
        await flush();

        expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length)
            .toBeGreaterThan(callsAfterStartup);
        expect(listener).toHaveBeenCalled();
    });

    it('throttles rapid focus events', async () => {
        const fetchImpl = vi.fn(async () => emptyPullResponse()) as unknown as typeof fetch;
        service = createService(fetchImpl);
        await flush();

        const callsAfterStartup = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

        // Two focus events within the throttle window → at most one extra sync.
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('focus'));
        await flush();

        const extra = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length - callsAfterStartup;
        expect(extra).toBeLessThanOrEqual(1);
    });

    it('stops reacting to focus after dispose', async () => {
        const fetchImpl = vi.fn(async () => emptyPullResponse()) as unknown as typeof fetch;
        service = createService(fetchImpl);
        await flush();

        service.dispose();
        const callsAfterDispose = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
        window.dispatchEvent(new Event('focus'));
        await flush();

        expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length)
            .toBe(callsAfterDispose);
    });

    it('notifies listeners after a queued sync applies remote calendar metadata', async () => {
        const events: Array<Array<{ id: string; calendarSyncStatus: Task['calendarSyncStatus'] }>> = [];
        let pullCount = 0;
        let pushedTaskId: string | null = null;
        let pushedTaskCreatedAt: number | null = null;

        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const body = JSON.parse(String(init?.body ?? '{}'));

            if (url.endsWith('/tasks/push')) {
                pushedTaskId = body.tasks?.[0]?.id ?? null;
                pushedTaskCreatedAt = body.tasks?.[0]?.createdAt ?? null;
                await new Promise((resolve) => setTimeout(resolve, 120));
                return new Response(JSON.stringify({
                    processedIds: body.tasks?.map((task: { id: string }) => task.id) ?? [],
                    processedDeletedIds: [],
                    nextCursor: 1
                }), { status: 200, headers: { 'content-type': 'application/json' } });
            }

            if (url.endsWith('/tasks/pull')) {
                pullCount += 1;
                await new Promise((resolve) => setTimeout(resolve, 30));
                if (pullCount === 1) {
                    return new Response(JSON.stringify({ tasks: [], deletedTasks: [], nextCursor: 0 }), {
                        status: 200,
                        headers: { 'content-type': 'application/json' }
                    });
                }

                return new Response(JSON.stringify({
                    tasks: [
                        createTask({
                            id: pushedTaskId ?? 'missing-id',
                            createdAt: pushedTaskCreatedAt ?? 1,
                            updatedAt: pushedTaskCreatedAt ?? 1,
                            calendarProviderId: 'google-calendar',
                            calendarEventId: 'event-1',
                            calendarSyncStatus: 'synced',
                            calendarLastSyncedAt: 5
                        })
                    ],
                    deletedTasks: [],
                    nextCursor: 2
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                });
            }

            return emptyPullResponse();
        }) as unknown as typeof fetch;

        service = createService(fetchImpl);
        service.onChange(() => {
            void service!.getTasks('/docs/race.md', '/docs/', false, 'all', 'doc-race').then((tasks) => {
                events.push(tasks.map((task) => ({
                    id: task.id,
                    calendarSyncStatus: task.calendarSyncStatus
                })));
            });
        });

        await new Promise((resolve) => setTimeout(resolve, 20));
        const created = await service.createTask(createTask());
        await new Promise((resolve) => setTimeout(resolve, 320));
        await flush();

        expect(created.calendarSyncStatus).toBeNull();
        expect(events).toContainEqual([
            {
                id: created.id,
                calendarSyncStatus: 'synced'
            }
        ]);
        await expect(service.getTasks('/docs/race.md', '/docs/', false, 'all', 'doc-race')).resolves.toEqual([
            expect.objectContaining({
                id: created.id,
                calendarSyncStatus: 'synced'
            })
        ]);
    });
});
