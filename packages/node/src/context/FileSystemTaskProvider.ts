import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ITaskProvider, Task, TaskQueryTag } from '../../../core/src/interfaces/ITaskProvider.ts';
import type { ITaskCalendarSyncService } from './ITaskCalendarSyncService.ts';
import {
    TASK_STORAGE_DIRECTORY,
    TASK_STORAGE_FILE,
    type StoredTaskIndex,
    cloneTask,
    hasSpecificDueTime,
    normalizeTaskRecord,
    normalizeTaskScope
} from './taskSupport.ts';

export interface FileSystemTaskProviderOptions {
    resolveRootDirectory: () => Promise<string>;
    calendarSyncService?: ITaskCalendarSyncService | null;
}

export class FileSystemTaskProvider implements ITaskProvider {
    private readonly resolveRootDirectory: () => Promise<string>;
    private readonly calendarSyncService: ITaskCalendarSyncService | null;

    constructor(options: FileSystemTaskProviderOptions) {
        this.resolveRootDirectory = options.resolveRootDirectory;
        this.calendarSyncService = options.calendarSyncService ?? null;
    }

    async getTasks(
        documentPath?: string | null,
        agentKey?: string | null,
        completed?: boolean,
        tag?: TaskQueryTag | null
    ): Promise<Task[]> {
        const storedTasks = await this.readTaskIndex();
        const scope = normalizeTaskScope(documentPath, agentKey);
        const now = Date.now();

        return storedTasks
            .filter((task) => {
                if (scope.documentPath !== null) {
                    if (task.documentPath !== scope.documentPath) {
                        return false;
                    }
                }

                if (scope.agentKey !== null) {
                    if ((scope.agentKey ?? null) !== (task.agentKey ?? null)) {
                        return false;
                    }
                }

                if (typeof completed === 'boolean' && task.completed !== completed) {
                    return false;
                }

                if (!matchesTaskTag(task, tag, now)) {
                    return false;
                }

                return true;
            })
            .map(cloneTask)
            .sort((left, right) => right.updatedAt - left.updatedAt);
    }

    async createTask(task: Task): Promise<Task> {
        const storedTasks = await this.readTaskIndex();
        const now = Date.now();
        const normalized: Task = {
            ...normalizeTaskRecord(task, now),
            id: `task-${now}-${Math.random().toString(36).slice(2, 10)}`,
            createdAt: now,
            updatedAt: now,
            completedAt: task.completed ? now : null
        };
        storedTasks.push(normalized);
        await this.writeTaskIndex(storedTasks);
        return this.syncIfNeeded(storedTasks, normalized);
    }

    async updateTask(task: Task): Promise<Task> {
        const storedTasks = await this.readTaskIndex();
        const index = storedTasks.findIndex((item) => item.id === task.id);
        if (index < 0) {
            throw new Error(`Task does not exist: ${task.id}`);
        }

        const existing = storedTasks[index];
        const updatedAt = Date.now();
        const normalized = normalizeTaskRecord({
            ...existing,
            ...cloneTask(task),
            updatedAt,
            completedAt: task.completed ? (existing.completedAt ?? updatedAt) : null
        }, updatedAt);
        storedTasks[index] = normalized;
        await this.writeTaskIndex(storedTasks);
        return this.syncIfNeeded(storedTasks, normalized);
    }

    async deleteTask(taskId: string): Promise<void> {
        const storedTasks = await this.readTaskIndex();
        const task = storedTasks.find((item) => item.id === taskId);
        if (!task) {
            return;
        }

        if (task.calendarEventId && this.calendarSyncService) {
            try {
                console.info('[task-calendar-sync] starting task deletion sync', {
                    taskId: task.id,
                    eventId: task.calendarEventId
                });
                await this.calendarSyncService.deleteTask(task);
                console.info('[task-calendar-sync] task deletion sync succeeded', {
                    taskId: task.id,
                    eventId: task.calendarEventId
                });
            } catch (error) {
                console.error('[task-calendar-sync] task deletion sync failed', {
                    taskId: task.id,
                    eventId: task.calendarEventId,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        await this.writeTaskIndex(storedTasks.filter((item) => item.id !== taskId));
    }

    async setTaskCompleted(taskId: string, completed: boolean): Promise<Task> {
        const storedTasks = await this.readTaskIndex();
        const index = storedTasks.findIndex((item) => item.id === taskId);
        if (index < 0) {
            throw new Error(`Task does not exist: ${taskId}`);
        }

        const now = Date.now();
        const normalized = normalizeTaskRecord({
            ...storedTasks[index],
            completed,
            updatedAt: now,
            completedAt: completed ? now : null
        }, now);
        storedTasks[index] = normalized;
        await this.writeTaskIndex(storedTasks);
        return cloneTask(normalized);
    }

    private async syncIfNeeded(storedTasks: Task[], task: Task): Promise<Task> {
        const hasTimedDueAt = hasSpecificDueTime(task.dueAt);
        console.info('[task-calendar-sync] evaluating task sync', {
            taskId: task.id,
            title: task.title,
            dueAt: task.dueAt,
            hasTimedDueAt,
            hasCalendarSyncService: Boolean(this.calendarSyncService)
        });

        if (!hasTimedDueAt || !this.calendarSyncService) {
            console.info('[task-calendar-sync] skipping task sync', {
                taskId: task.id,
                reason: !hasTimedDueAt ? 'task does not have a specific due time' : 'calendar sync service is unavailable'
            });
            return cloneTask(task);
        }

        try {
            console.info('[task-calendar-sync] starting task sync', {
                taskId: task.id,
                existingEventId: task.calendarEventId
            });
            const syncResult = await this.calendarSyncService.syncTask(task);
            const syncedTask = normalizeTaskRecord({
                ...task,
                calendarProviderId: syncResult.providerId,
                calendarEventId: syncResult.eventId,
                calendarSyncStatus: 'synced',
                calendarLastSyncedAt: syncResult.syncedAt,
                calendarLastSyncError: null
            }, syncResult.syncedAt);
            console.info('[task-calendar-sync] task sync succeeded', {
                taskId: task.id,
                providerId: syncResult.providerId,
                eventId: syncResult.eventId,
                syncedAt: syncResult.syncedAt
            });
            await this.persistReplacement(storedTasks, syncedTask);
            return cloneTask(syncedTask);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[task-calendar-sync] task sync failed', {
                taskId: task.id,
                dueAt: task.dueAt,
                error: message
            });
            const failedTask = normalizeTaskRecord({
                ...task,
                calendarProviderId: task.calendarProviderId ?? 'google-calendar',
                calendarSyncStatus: 'failed',
                calendarLastSyncError: message
            }, Date.now());
            await this.persistReplacement(storedTasks, failedTask);
            return cloneTask(failedTask);
        }
    }

    private async persistReplacement(storedTasks: Task[], task: Task): Promise<void> {
        const index = storedTasks.findIndex((item) => item.id === task.id);
        if (index < 0) {
            throw new Error(`Task does not exist: ${task.id}`);
        }

        storedTasks[index] = task;
        await this.writeTaskIndex(storedTasks);
    }

    private async readTaskIndex(): Promise<Task[]> {
        const storagePath = await this.resolveTaskStoragePath();
        if (!(await exists(storagePath))) {
            return [];
        }

        const raw = await fs.readFile(storagePath, 'utf8');
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse task storage: ${reason}`);
        }

        if (!isPlainObject(parsed) || !Array.isArray(parsed.tasks)) {
            throw new Error('Failed to parse task storage: expected a tasks array.');
        }

        const now = Date.now();
        return parsed.tasks
            .filter((task): task is Task => isPlainObject(task))
            .map((task) => normalizeTaskRecord(task, now));
    }

    private async writeTaskIndex(tasks: Task[]): Promise<void> {
        const storagePath = await this.resolveTaskStoragePath();
        await fs.mkdir(path.dirname(storagePath), { recursive: true });
        const payload: StoredTaskIndex = {
            tasks: tasks.map(cloneTask)
        };
        await fs.writeFile(storagePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    }

    private async resolveTaskStoragePath(): Promise<string> {
        const rootDirectory = await this.resolveRootDirectory();
        return path.join(rootDirectory, TASK_STORAGE_DIRECTORY, TASK_STORAGE_FILE);
    }
}

function matchesTaskTag(task: Task, tag: TaskQueryTag | null | undefined, now: number): boolean {
    if (!tag || tag === 'all') {
        return true;
    }

    if (task.dueAt === null) {
        return false;
    }

    if (tag === 'planned') {
        return task.dueAt > now;
    }

    const currentDate = new Date(now);
    const endOfToday = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
        23,
        59,
        59,
        999
    ).getTime();
    return task.dueAt <= endOfToday;
}

async function exists(targetPath: string): Promise<boolean> {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function isPlainObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
