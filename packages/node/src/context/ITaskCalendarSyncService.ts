import type { Task } from '@plugins/task-mgr/api';

export interface TaskCalendarSyncResult {
    providerId: string;
    eventId: string;
    syncedAt: number;
}

export interface ITaskCalendarSyncService {
    syncTask(task: Task): Promise<TaskCalendarSyncResult>;
    deleteTask(task: Task): Promise<void>;
}
