export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskCalendarSyncStatus = 'synced' | 'failed' | null;
export type TaskQueryTag = 'all' | 'today' | 'planned';

export interface Task {
    id: string;
    title: string;
    notes: string;
    completed: boolean;
    dueAt: number | null;
    priority: TaskPriority | null;
    documentPath: string | null;
    agentKey: string | null;
    createdAt: number;
    updatedAt: number;
    completedAt: number | null;
    calendarProviderId: string | null;
    calendarEventId: string | null;
    calendarSyncStatus: TaskCalendarSyncStatus;
    calendarLastSyncedAt: number | null;
    calendarLastSyncError: string | null;
}

export interface ITaskProvider {
    getTasks(
        documentPath?: string | null,
        agentKey?: string | null,
        completed?: boolean,
        tag?: TaskQueryTag | null
    ): Promise<Task[]>;
    createTask(task: Task): Promise<Task>;
    updateTask(task: Task): Promise<Task>;
    deleteTask(taskId: string): Promise<void>;
    setTaskCompleted(taskId: string, completed: boolean): Promise<Task>;
}
