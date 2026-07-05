import type { Task } from '@plugins/task-mgr/api';
import type { ITaskCalendarSyncService } from './ITaskCalendarSyncService.js';
import type {
    SyncConversation,
    SyncDeletedConversation,
    SyncDeletedTask,
    SyncPullResponse,
    SyncPushResponse,
    SyncTaskRecord,
    TaskSyncPullResponse
} from '../types/sync.js';
import {
    SyncRepository,
    type PersistedConversation,
    type PersistedDeletedConversation,
    type PersistedDeletedTask,
    type PersistedTask
} from '../repositories/syncRepository.js';

function shouldAcceptConversation(
    current: PersistedConversation | null,
    currentDeleted: PersistedDeletedConversation | null,
    incoming: SyncConversation
): boolean {
    if (!current && !currentDeleted) {
        return true;
    }

    const currentUpdatedAt = Math.max(
        current?.conversation.updatedAt ?? Number.NEGATIVE_INFINITY,
        currentDeleted?.deletedConversation.updatedAt ?? Number.NEGATIVE_INFINITY
    );

    if (incoming.updatedAt > currentUpdatedAt) {
        return true;
    }

    if (incoming.updatedAt < currentUpdatedAt) {
        return false;
    }

    const incomingDeleted = incoming.sync?.deleted === true;
    const currentIsDeleted = currentDeleted
        ? currentDeleted.deletedConversation.updatedAt >= (current?.conversation.updatedAt ?? Number.NEGATIVE_INFINITY)
        : current?.conversation.sync?.deleted === true;

    return incomingDeleted && !currentIsDeleted;
}

function shouldAcceptDeletedConversation(
    current: PersistedConversation | null,
    currentDeleted: PersistedDeletedConversation | null,
    incoming: SyncDeletedConversation
): boolean {
    if (!current && !currentDeleted) {
        return true;
    }

    const currentUpdatedAt = Math.max(
        current?.conversation.updatedAt ?? Number.NEGATIVE_INFINITY,
        currentDeleted?.deletedConversation.updatedAt ?? Number.NEGATIVE_INFINITY
    );

    if (incoming.updatedAt > currentUpdatedAt) {
        return true;
    }

    if (incoming.updatedAt < currentUpdatedAt) {
        return false;
    }

    return !currentDeleted || incoming.updatedAt >= currentDeleted.deletedConversation.updatedAt;
}

function shouldAcceptTask(
    current: PersistedTask | null,
    currentDeleted: PersistedDeletedTask | null,
    incoming: SyncTaskRecord
): boolean {
    if (!current && !currentDeleted) {
        return true;
    }

    const currentUpdatedAt = Math.max(
        current?.task.updatedAt ?? Number.NEGATIVE_INFINITY,
        currentDeleted?.deletedTask.updatedAt ?? Number.NEGATIVE_INFINITY
    );

    return incoming.updatedAt >= currentUpdatedAt;
}

function shouldAcceptDeletedTask(
    current: PersistedTask | null,
    currentDeleted: PersistedDeletedTask | null,
    incoming: SyncDeletedTask
): boolean {
    if (!current && !currentDeleted) {
        return true;
    }

    const currentUpdatedAt = Math.max(
        current?.task.updatedAt ?? Number.NEGATIVE_INFINITY,
        currentDeleted?.deletedTask.updatedAt ?? Number.NEGATIVE_INFINITY
    );

    return incoming.updatedAt >= currentUpdatedAt;
}

function hasSpecificDueTime(dueAt: number | null): boolean {
    return typeof dueAt === 'number' && Number.isFinite(dueAt);
}

function normalizeFailedCalendarTask(task: SyncTaskRecord, message: string): SyncTaskRecord {
    return {
        ...task,
        calendarProviderId: task.calendarProviderId ?? 'google-calendar',
        calendarSyncStatus: 'failed',
        calendarLastSyncError: message
    };
}

export class SyncService {
    constructor(
        private readonly repository: SyncRepository,
        private readonly taskCalendarSyncService: ITaskCalendarSyncService | null = null
    ) {}

    push(
        syncKey: string,
        conversations: SyncConversation[],
        deletedConversations: SyncDeletedConversation[] = []
    ): SyncPushResponse {
        return this.repository.runInTransaction(() => {
            const processedIds: string[] = [];
            const processedDeletedIds: string[] = [];
            let nextCursor = this.repository.getCurrentCursor(syncKey);

            for (const conversation of conversations) {
                const current = this.repository.getConversation(syncKey, conversation.id);
                const currentDeleted = this.repository.getDeletedConversation(syncKey, conversation.id);
                if (!shouldAcceptConversation(current, currentDeleted, conversation)) {
                    continue;
                }

                const now = Date.now();
                nextCursor = this.repository.allocateNextCursor(syncKey, now);
                this.repository.saveConversation({
                    syncKey,
                    conversation,
                    serverCursor: nextCursor,
                    receivedAt: now,
                    createdAt: current?.createdAt ?? now
                });
                processedIds.push(conversation.id);
            }

            for (const deletedConversation of deletedConversations) {
                const current = this.repository.getConversation(syncKey, deletedConversation.id);
                const currentDeleted = this.repository.getDeletedConversation(syncKey, deletedConversation.id);
                if (!shouldAcceptDeletedConversation(current, currentDeleted, deletedConversation)) {
                    continue;
                }

                const now = Date.now();
                nextCursor = this.repository.allocateNextCursor(syncKey, now);
                this.repository.deleteConversationAggregate(syncKey, deletedConversation.id);
                this.repository.saveDeletedConversation({
                    syncKey,
                    deletedConversation,
                    serverCursor: nextCursor,
                    receivedAt: now,
                    createdAt: currentDeleted?.createdAt ?? now
                });
                processedDeletedIds.push(deletedConversation.id);
            }

            return {
                processedIds,
                processedDeletedIds,
                nextCursor
            };
        });
    }

    pull(syncKey: string, cursor: number | null): SyncPullResponse {
        return this.repository.runInTransaction(() => ({
            conversations: this.repository
                .listConversationsAfterCursor(syncKey, cursor)
                .map((item) => item.conversation),
            deletedConversations: this.repository
                .listDeletedConversationsAfterCursor(syncKey, cursor)
                .map((item) => item.deletedConversation),
            nextCursor: this.repository.getCurrentCursor(syncKey)
        }));
    }

    async pushTasks(
        syncKey: string,
        tasks: SyncTaskRecord[],
        deletedTasks: SyncDeletedTask[] = [],
        options: { skipCalendarSyncTaskIds?: Iterable<string> } = {}
    ): Promise<SyncPushResponse> {
        const skipCalendarSyncIds = new Set(options.skipCalendarSyncTaskIds ?? []);

        const processedIds: string[] = [];
        const processedDeletedIds: string[] = [];
        let nextCursor = this.repository.getCurrentTaskCursor(syncKey);

        for (const task of tasks) {
            const current = this.repository.getTask(syncKey, task.id);
            const currentDeleted = this.repository.getDeletedTask(syncKey, task.id);
            if (!shouldAcceptTask(current, currentDeleted, task)) {
                continue;
            }

            const now = Date.now();
            const taskToPersist = skipCalendarSyncIds.has(task.id)
                ? task
                : await this.syncTaskCalendar(task);
            nextCursor = this.repository.runInTransaction(() => {
                const cursor = this.repository.allocateNextTaskCursor(syncKey, now);
                this.repository.upsertTasks([{
                    syncKey,
                    task: taskToPersist,
                    serverCursor: cursor,
                    receivedAt: now,
                    createdAt: current?.createdAt ?? currentDeleted?.createdAt ?? task.createdAt ?? now
                }]);
                return cursor;
            });
            processedIds.push(task.id);
        }

        for (const deletedTask of deletedTasks) {
            const current = this.repository.getTask(syncKey, deletedTask.id);
            const currentDeleted = this.repository.getDeletedTask(syncKey, deletedTask.id);
            if (!shouldAcceptDeletedTask(current, currentDeleted, deletedTask)) {
                continue;
            }

            if (current?.task.calendarEventId && this.taskCalendarSyncService) {
                await this.safeDeleteCalendarEvent(current.task);
            }

            const now = Date.now();
            nextCursor = this.repository.runInTransaction(() => {
                const cursor = this.repository.allocateNextTaskCursor(syncKey, now);
                this.repository.saveDeletedTask({
                    syncKey,
                    deletedTask,
                    serverCursor: cursor,
                    receivedAt: now,
                    createdAt: current?.createdAt ?? currentDeleted?.createdAt ?? now
                });
                return cursor;
            });
            processedDeletedIds.push(deletedTask.id);
        }

        return {
            processedIds,
            processedDeletedIds,
            nextCursor
        };
    }

    pullTasks(syncKey: string, cursor: number | null): TaskSyncPullResponse {
        return this.repository.runInTransaction(() => {
            const result = this.repository.listTasksSince(syncKey, cursor);
            return {
                tasks: result.tasks.map((item) => item.task),
                deletedTasks: result.deletedTasks.map((item) => item.deletedTask),
                nextCursor: result.nextCursor
            };
        });
    }

    private async syncTaskCalendar(task: SyncTaskRecord): Promise<SyncTaskRecord> {
        if (!hasSpecificDueTime(task.dueAt) || !this.taskCalendarSyncService) {
            return task;
        }

        try {
            const syncResult = await this.taskCalendarSyncService.syncTask(task);
            return {
                ...task,
                calendarProviderId: syncResult.providerId,
                calendarEventId: syncResult.eventId,
                calendarSyncStatus: 'synced',
                calendarLastSyncedAt: syncResult.syncedAt,
                calendarLastSyncError: null
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return normalizeFailedCalendarTask(task, message);
        }
    }

    private async safeDeleteCalendarEvent(task: Task): Promise<void> {
        try {
            await this.taskCalendarSyncService?.deleteTask(task);
        } catch (error) {
            console.error('[task-calendar-sync] task deletion sync failed', {
                taskId: task.id,
                eventId: task.calendarEventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
