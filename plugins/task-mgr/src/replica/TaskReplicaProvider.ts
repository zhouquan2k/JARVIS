import localforage from 'localforage';
import type { Task, TaskExecutionState, TaskPriority, TaskQueryTag, TaskRecurrence, TaskService } from '../contracts/Task';

export interface ReplicaDeletedTask {
    id: string;
    updatedAt: number;
}

interface ReplicaTaskState {
    task: Task;
    dirty: boolean;
    deleted: boolean;
}

export interface TaskReplicaPersistence {
    read(): Promise<ReplicaTaskState[]>;
    write(rows: ReplicaTaskState[]): Promise<void>;
    clear?(): Promise<void>;
}

class LocalForageTaskReplicaPersistence implements TaskReplicaPersistence {
    private readonly store = localforage.createInstance({
        name: 'chatprism',
        storeName: 'task-replica'
    });

    async read(): Promise<ReplicaTaskState[]> {
        const value = await this.store.getItem<ReplicaTaskState[]>('rows');
        return Array.isArray(value) ? value : [];
    }

    async write(rows: ReplicaTaskState[]): Promise<void> {
        await this.store.setItem('rows', rows);
    }

    async clear(): Promise<void> {
        await this.store.clear();
    }
}

export interface TaskReplicaProviderOptions {
    persistence?: TaskReplicaPersistence;
}

export class TaskReplicaProvider implements TaskService {
    public readonly id = 'task-replica';
    private readonly persistence: TaskReplicaPersistence;

    constructor(options: TaskReplicaProviderOptions = {}) {
        this.persistence = options.persistence ?? new LocalForageTaskReplicaPersistence();
    }

    async getTasks(
        documentPath?: string | null,
        agentKey?: string | null,
        completed?: boolean,
        tag?: TaskQueryTag | null,
        documentId?: string | null
    ): Promise<Task[]> {
        const rows = await this.readRows();
        const normalizedDocumentId = documentId?.trim() || null;
        const scope = normalizeTaskScope(documentPath, agentKey);
        const now = Date.now();

        return rows
            .filter((row) => !row.deleted)
            .map((row) => row.task)
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
        const rows = await this.readRows();
        const now = Date.now();
        const normalized = normalizeTaskRecord({
            ...cloneTask(task),
            id: `task-${now}-${Math.random().toString(36).slice(2, 10)}`,
            createdAt: now,
            updatedAt: now,
            completedAt: task.completed ? now : null
        }, now);
        rows.push({
            task: normalized,
            dirty: true,
            deleted: false
        });
        await this.writeRows(rows);
        return cloneTask(normalized);
    }

    async updateTask(task: Task): Promise<Task> {
        const rows = await this.readRows();
        const index = rows.findIndex((row) => row.task.id === task.id && !row.deleted);
        if (index < 0) {
            throw new Error(`Task does not exist: ${task.id}`);
        }

        const existing = rows[index]!.task;
        const updatedAt = Date.now();
        const normalized = normalizeTaskRecord({
            ...existing,
            ...preserveCalendarSyncFields(existing, cloneTask(task)),
            updatedAt,
            completedAt: task.completed ? (existing.completedAt ?? updatedAt) : null
        }, updatedAt);
        rows[index] = {
            task: normalized,
            dirty: true,
            deleted: false
        };
        await this.writeRows(rows);
        return cloneTask(normalized);
    }

    async deleteTask(taskId: string): Promise<void> {
        const rows = await this.readRows();
        const index = rows.findIndex((row) => row.task.id === taskId && !row.deleted);
        if (index < 0) {
            return;
        }

        const existing = rows[index]!.task;
        rows[index] = {
            task: {
                ...cloneTask(existing),
                updatedAt: Date.now()
            },
            dirty: true,
            deleted: true
        };
        await this.writeRows(rows);
    }

    async setTaskCompleted(taskId: string, completed: boolean): Promise<Task> {
        const rows = await this.readRows();
        const index = rows.findIndex((row) => row.task.id === taskId && !row.deleted);
        if (index < 0) {
            throw new Error(`Task does not exist: ${taskId}`);
        }

        const now = Date.now();
        const existing = rows[index]!.task;
        if (completed && existing.recurrence) {
            const rolled = normalizeTaskRecord({
                ...existing,
                completed: false,
                completedAt: null,
                dueAt: advanceRecurrenceDueAt(existing.dueAt, existing.recurrence, now),
                updatedAt: now
            }, now);
            rows[index] = {
                task: rolled,
                dirty: true,
                deleted: false
            };
            await this.writeRows(rows);
            return cloneTask(rolled);
        }

        const normalized = normalizeTaskRecord({
            ...existing,
            completed,
            updatedAt: now,
            completedAt: completed ? now : null
        }, now);
        rows[index] = {
            task: normalized,
            dirty: true,
            deleted: false
        };
        await this.writeRows(rows);
        return cloneTask(normalized);
    }

    async listDirtyTasks(): Promise<Task[]> {
        const rows = await this.readRows();
        return rows
            .filter((row) => row.dirty && !row.deleted)
            .map((row) => cloneTask(row.task))
            .sort((left, right) => left.updatedAt - right.updatedAt);
    }

    async listDeletedTasks(): Promise<ReplicaDeletedTask[]> {
        const rows = await this.readRows();
        return rows
            .filter((row) => row.dirty && row.deleted)
            .map((row) => ({
                id: row.task.id,
                updatedAt: row.task.updatedAt
            }))
            .sort((left, right) => left.updatedAt - right.updatedAt);
    }

    async markTasksSynced(taskIds: string[]): Promise<void> {
        if (taskIds.length === 0) {
            return;
        }

        const wanted = new Set(taskIds);
        const rows = await this.readRows();
        let changed = false;
        for (const row of rows) {
            if (row.deleted || !wanted.has(row.task.id) || !row.dirty) {
                continue;
            }
            row.dirty = false;
            changed = true;
        }
        if (changed) {
            await this.writeRows(rows);
        }
    }

    async markDeletedTasksSynced(taskIds: string[]): Promise<void> {
        if (taskIds.length === 0) {
            return;
        }

        const wanted = new Set(taskIds);
        const rows = (await this.readRows()).filter((row) => !(row.deleted && wanted.has(row.task.id)));
        await this.writeRows(rows);
    }

    async applyRemoteTasks(tasks: Task[]): Promise<void> {
        if (tasks.length === 0) {
            return;
        }

        const rows = await this.readRows();
        for (const incoming of tasks) {
            const normalized = normalizeTaskRecord(incoming, incoming.updatedAt ?? Date.now());
            const index = rows.findIndex((row) => row.task.id === normalized.id);
            const existing = index >= 0 ? rows[index]! : null;
            const existingUpdatedAt = existing?.task.updatedAt ?? Number.NEGATIVE_INFINITY;
            if (existing && existingUpdatedAt > normalized.updatedAt) {
                continue;
            }

            const nextRow: ReplicaTaskState = {
                task: normalized,
                dirty: false,
                deleted: false
            };
            if (index >= 0) {
                rows[index] = nextRow;
            } else {
                rows.push(nextRow);
            }
        }

        await this.writeRows(rows);
    }

    async applyRemoteDeletedTasks(tasks: ReplicaDeletedTask[]): Promise<void> {
        if (tasks.length === 0) {
            return;
        }

        const rows = await this.readRows();
        for (const deletedTask of tasks) {
            const index = rows.findIndex((row) => row.task.id === deletedTask.id);
            if (index < 0) {
                continue;
            }
            if (rows[index]!.task.updatedAt > deletedTask.updatedAt) {
                continue;
            }
            rows.splice(index, 1);
        }

        await this.writeRows(rows);
    }

    async clearReplica(): Promise<void> {
        if (this.persistence.clear) {
            await this.persistence.clear();
            return;
        }
        await this.persistence.write([]);
    }

    private async readRows(): Promise<ReplicaTaskState[]> {
        const rows = await this.persistence.read();
        const now = Date.now();
        return rows
            .filter((row) => row && typeof row === 'object' && row.task && typeof row.task === 'object')
            .map((row) => ({
                task: normalizeTaskRecord(row.task, now),
                dirty: row.dirty === true,
                deleted: row.deleted === true
            }));
    }

    private async writeRows(rows: ReplicaTaskState[]): Promise<void> {
        await this.persistence.write(rows.map((row) => ({
            task: cloneTask(row.task),
            dirty: row.dirty,
            deleted: row.deleted
        })));
    }
}

export class MemoryTaskReplicaPersistence implements TaskReplicaPersistence {
    private rows: ReplicaTaskState[] = [];

    async read(): Promise<ReplicaTaskState[]> {
        return this.rows.map((row) => ({
            task: cloneTask(row.task),
            dirty: row.dirty,
            deleted: row.deleted
        }));
    }

    async write(rows: ReplicaTaskState[]): Promise<void> {
        this.rows = rows.map((row) => ({
            task: cloneTask(row.task),
            dirty: row.dirty,
            deleted: row.deleted
        }));
    }

    async clear(): Promise<void> {
        this.rows = [];
    }
}

function cloneTask(task: Task): Task {
    return { ...task };
}

function normalizeTaskScope(documentPath?: string | null, agentKey?: string | null): { documentPath: string | null; agentKey: string | null } {
    return {
        documentPath: normalizeScopedPath(documentPath),
        agentKey: normalizeAgentKey(agentKey)
    };
}

function normalizeScopedPath(value?: string | null): string | null {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed === '/') {
        return null;
    }
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/+/g, '/');
}

function normalizeAgentKey(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function preserveCalendarSyncFields(existing: Task, incoming: Task): Task {
    return {
        ...incoming,
        calendarProviderId: incoming.calendarProviderId ?? existing.calendarProviderId ?? null,
        calendarEventId: incoming.calendarEventId ?? existing.calendarEventId ?? null,
        calendarSyncStatus: incoming.calendarSyncStatus ?? existing.calendarSyncStatus ?? null,
        calendarLastSyncedAt: Number.isFinite(incoming.calendarLastSyncedAt)
            ? incoming.calendarLastSyncedAt
            : (Number.isFinite(existing.calendarLastSyncedAt) ? existing.calendarLastSyncedAt : null),
        calendarLastSyncError: incoming.calendarLastSyncError ?? existing.calendarLastSyncError ?? null
    };
}

function normalizeTaskRecord(task: Task, fallbackNow: number): Task {
    const scope = normalizeTaskScope(task.documentPath, task.agentKey);
    const documentId = typeof task.documentId === 'string' && task.documentId.trim()
        ? task.documentId.trim()
        : (task.documentId === null ? null : undefined);

    return {
        ...cloneTask(task),
        ...scope,
        documentId,
        notes: task.notes ?? '',
        dueAt: task.dueAt ?? null,
        priority: normalizeTaskPriority(task.priority),
        executionState: normalizeTaskExecutionState(task.executionState),
        completed: !!task.completed,
        createdAt: Number.isFinite(task.createdAt) ? task.createdAt : fallbackNow,
        updatedAt: Number.isFinite(task.updatedAt) ? task.updatedAt : fallbackNow,
        completedAt: task.completed ? (Number.isFinite(task.completedAt) ? task.completedAt : fallbackNow) : null,
        calendarProviderId: task.calendarProviderId ?? null,
        calendarEventId: task.calendarEventId ?? null,
        calendarSyncStatus: task.calendarSyncStatus ?? null,
        calendarLastSyncedAt: Number.isFinite(task.calendarLastSyncedAt) ? task.calendarLastSyncedAt : null,
        calendarLastSyncError: task.calendarLastSyncError ?? null,
        recurrence: normalizeTaskRecurrence(task.recurrence)
    };
}

function normalizeTaskPriority(value: TaskPriority | null | undefined): TaskPriority | null {
    if (value === 'low' || value === 'medium' || value === 'high') {
        return value;
    }
    return null;
}

function normalizeTaskExecutionState(value: TaskExecutionState | null | undefined): TaskExecutionState {
    if (value === 'doing' || value === 'morning' || value === 'afternoon' || value === 'evening') {
        return value;
    }
    return null;
}

function normalizeTaskRecurrence(value: TaskRecurrence | undefined): TaskRecurrence {
    if (value === 'daily' || value === 'weekly' || value === 'monthly') {
        return value;
    }
    return null;
}

function advanceRecurrenceDueAt(
    dueAt: number | null,
    recurrence: TaskRecurrence,
    now: number
): number {
    const base = dueAt ?? now;
    const next = new Date(base);
    switch (recurrence) {
        case 'daily':
            next.setDate(next.getDate() + 1);
            break;
        case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1);
            break;
        default:
            return base;
    }
    return next.getTime();
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
