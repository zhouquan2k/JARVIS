import path from 'node:path';
import type { Task } from '@plugins/task-mgr/api';

export const TASK_STORAGE_DIRECTORY = '.chatprism';
export const TASK_STORAGE_FILE = 'tasks.json';

export interface StoredTaskIndex {
    tasks: Task[];
}

export function cloneTask(task: Task): Task {
    return { ...task };
}

export function normalizeTaskScope(documentPath?: string | null, agentKey?: string | null): { documentPath: string | null; agentKey: string | null } {
    const normalizedDocumentPath = documentPath
        ? normalizeVirtualTaskPath(documentPath) ?? null
        : null;
    const normalizedAgentKey = agentKey?.trim() ? agentKey.trim() : null;
    return {
        documentPath: normalizedDocumentPath,
        agentKey: normalizedAgentKey
    };
}

export function normalizeTaskRecord(task: Task, fallbackNow: number): Task {
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
        priority: task.priority ?? null,
        executionState: normalizeTaskExecutionState(task.executionState),
        completed: !!task.completed,
        createdAt: Number.isFinite(task.createdAt) ? task.createdAt : fallbackNow,
        updatedAt: Number.isFinite(task.updatedAt) ? task.updatedAt : fallbackNow,
        completedAt: task.completed ? (Number.isFinite(task.completedAt) ? task.completedAt : fallbackNow) : null,
        calendarProviderId: task.calendarProviderId ?? null,
        calendarEventId: task.calendarEventId ?? null,
        calendarSyncStatus: task.calendarSyncStatus ?? null,
        calendarLastSyncedAt: Number.isFinite(task.calendarLastSyncedAt) ? task.calendarLastSyncedAt : null,
        calendarLastSyncError: task.calendarLastSyncError ?? null
    };
}

function normalizeTaskExecutionState(value: Task['executionState']): Task['executionState'] {
    if (value === 'doing' || value === 'morning' || value === 'afternoon' || value === 'evening') {
        return value;
    }
    return null;
}

export function hasSpecificDueTime(dueAt: number | null): boolean {
    if (dueAt === null || !Number.isFinite(dueAt)) {
        return false;
    }
    return true;
}

function normalizeVirtualTaskPath(value: string): string | undefined {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '/') {
        return undefined;
    }

    const rawPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const rawSegments = rawPath.split('/');
    if (rawSegments.some((segment) => segment === '..')) {
        throw new Error(`Path escapes the knowledge workspace root: ${value}`);
    }

    const normalized = path.posix.normalize(rawPath);
    if (!normalized.startsWith('/')) {
        throw new Error(`Invalid path: ${value}`);
    }
    if (normalized.includes('\0')) {
        throw new Error(`Invalid path: ${value}`);
    }

    return normalized;
}
