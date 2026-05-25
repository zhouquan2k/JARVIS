import type { Task } from '../../../core/src/interfaces/ITaskProvider.ts';

export interface TaskCalendarSyncResult {
    providerId: string;
    eventId: string;
    syncedAt: number;
}

export interface ITaskCalendarSyncService {
    syncTask(task: Task): Promise<TaskCalendarSyncResult>;
    deleteTask(task: Task): Promise<void>;
}
