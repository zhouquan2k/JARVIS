import type { Task, TaskQueryTag, TaskService } from '@plugins/task-mgr/api';
import {
    advanceRecurrenceDueAt,
    cloneTask,
    normalizeTaskRecord as normalizeLocalTaskRecord,
    normalizeTaskScope
} from './taskSupport.js';
import { SyncRepository } from '../repositories/syncRepository.js';
import { SyncService } from './syncService.js';

export interface ServerTaskServiceOptions {
    repository: SyncRepository;
    syncService: SyncService;
    syncKey: string;
    resolveDocumentIdForTaskPath?: ((documentPath: string) => Promise<string | null>) | null;
}

export class ServerTaskService implements TaskService {
    private readonly repository: SyncRepository;
    private readonly syncService: SyncService;
    private readonly syncKey: string;
    private readonly resolveDocumentIdForTaskPath: ((documentPath: string) => Promise<string | null>) | null;

    constructor(options: ServerTaskServiceOptions) {
        this.repository = options.repository;
        this.syncService = options.syncService;
        this.syncKey = options.syncKey;
        this.resolveDocumentIdForTaskPath = options.resolveDocumentIdForTaskPath ?? null;
    }

    async getTasks(
        documentPath?: string | null,
        agentKey?: string | null,
        completed?: boolean,
        tag?: TaskQueryTag | null,
        documentId?: string | null
    ): Promise<Task[]> {
        const storedTasks = this.repository.listAllTasks(this.syncKey);
        const normalizedDocumentId = documentId?.trim() || null;
        const scope = normalizeTaskScope(documentPath, agentKey);
        const now = Date.now();

        return storedTasks
            .filter((task) => {
                if (normalizedDocumentId) {
                    if ((task.documentId ?? null) !== normalizedDocumentId) {
                        return false;
                    }
                } else if (scope.documentPath !== null && task.documentPath !== scope.documentPath) {
                    return false;
                }

                if (scope.agentKey !== null && (task.agentKey ?? null) !== scope.agentKey) {
                    return false;
                }
                if (typeof completed === 'boolean' && task.completed !== completed) {
                    return false;
                }
                return matchesTaskTag(task, tag, now);
            })
            .map(cloneTask)
            .sort((left, right) => right.updatedAt - left.updatedAt);
    }

    async createTask(task: Task): Promise<Task> {
        const now = Date.now();
        const normalized = await this.ensureDocumentId(normalizeLocalTaskRecord({
            ...cloneTask(task),
            id: `task-${now}-${Math.random().toString(36).slice(2, 10)}`,
            createdAt: now,
            updatedAt: now,
            completedAt: task.completed ? now : null
        }, now));

        await this.syncService.pushTasks(this.syncKey, [normalized]);
        return cloneTask(this.repository.getTask(this.syncKey, normalized.id)?.task ?? normalized);
    }

    async updateTask(task: Task): Promise<Task> {
        const current = this.repository.getTask(this.syncKey, task.id)?.task;
        if (!current) {
            throw new Error(`Task does not exist: ${task.id}`);
        }

        const updatedAt = Date.now();
        const normalized = await this.ensureDocumentId(normalizeLocalTaskRecord({
            ...current,
            ...cloneTask(task),
            updatedAt,
            completedAt: task.completed ? (current.completedAt ?? updatedAt) : null
        }, updatedAt));

        await this.syncService.pushTasks(this.syncKey, [normalized]);
        return cloneTask(this.repository.getTask(this.syncKey, normalized.id)?.task ?? normalized);
    }

    async deleteTask(taskId: string): Promise<void> {
        const current = this.repository.getTask(this.syncKey, taskId)?.task;
        if (!current) {
            return;
        }

        await this.syncService.pushTasks(this.syncKey, [], [{
            id: taskId,
            updatedAt: Date.now()
        }]);
    }

    async setTaskCompleted(taskId: string, completed: boolean): Promise<Task> {
        const current = this.repository.getTask(this.syncKey, taskId)?.task;
        if (!current) {
            throw new Error(`Task does not exist: ${taskId}`);
        }

        const now = Date.now();
        if (completed && current.recurrence) {
            const rolled = normalizeLocalTaskRecord({
                ...current,
                completed: false,
                completedAt: null,
                dueAt: advanceRecurrenceDueAt(current.dueAt, current.recurrence, now),
                updatedAt: now
            }, now);
            await this.syncService.pushTasks(this.syncKey, [rolled], [], {
                skipCalendarSyncTaskIds: [rolled.id]
            });
            return cloneTask(this.repository.getTask(this.syncKey, rolled.id)?.task ?? rolled);
        }

        const normalized = normalizeLocalTaskRecord({
            ...current,
            completed,
            updatedAt: now,
            completedAt: completed ? now : null
        }, now);
        await this.syncService.pushTasks(this.syncKey, [normalized]);
        return cloneTask(this.repository.getTask(this.syncKey, normalized.id)?.task ?? normalized);
    }

    private async ensureDocumentId(task: Task): Promise<Task> {
        if (task.documentId || !this.resolveDocumentIdForTaskPath || !isMarkdownTaskPath(task.documentPath)) {
            return task;
        }

        const resolvedDocumentId = await this.resolveDocumentIdForTaskPath(task.documentPath);
        if (!resolvedDocumentId) {
            return task;
        }

        return {
            ...task,
            documentId: resolvedDocumentId
        };
    }
}

function matchesTaskTag(task: Task, tag: TaskQueryTag | null | undefined, now: number): boolean {
    if (!tag || tag === 'all') {
        return true;
    }

    if (tag === 'scheduled') {
        return task.executionState !== null;
    }

    if (tag === 'backlog') {
        return task.dueAt === null && task.executionState === null;
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

    if (tag === 'today') {
        return task.dueAt <= endOfToday;
    }

    const startOfTomorrow = endOfToday + 1;
    const endOfTomorrow = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate() + 1,
        23,
        59,
        59,
        999
    ).getTime();
    return task.dueAt >= startOfTomorrow && task.dueAt <= endOfTomorrow;
}

function isMarkdownTaskPath(documentPath: string | null): documentPath is string {
    return typeof documentPath === 'string'
        && (documentPath.endsWith('.md') || documentPath.endsWith('.markdown'));
}
