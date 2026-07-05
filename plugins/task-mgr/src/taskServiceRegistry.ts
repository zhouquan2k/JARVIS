import { resolveSyncKey, type SyncKeyOptions } from '@packages/core';
import type { TaskService } from '../api';
import {
    ReplicaTaskService
} from './replica/ReplicaTaskService';
import type { TaskReplicaPersistence } from './replica/TaskReplicaProvider';
import type { TaskSyncCursorStore } from './replica/TaskSyncClient';

let registeredTaskService: TaskService | null = null;

export interface RegisterTaskServiceOptions {
    baseUrl?: string;
    syncBaseUrl?: string;
    fetchImpl?: typeof fetch;
    env?: Record<string, string | undefined>;
    storage?: SyncKeyOptions['storage'];
    isDevelopment?: boolean;
    replicaPersistence?: TaskReplicaPersistence;
    replicaCursorStore?: TaskSyncCursorStore;
}

function deriveSyncBaseUrl(baseUrl?: string): string | undefined {
    const normalized = baseUrl?.trim().replace(/\/+$/, '');
    if (!normalized) {
        return undefined;
    }

    if (normalized.endsWith('/api/context')) {
        return `${normalized.slice(0, -'/api/context'.length)}/api/sync`;
    }

    return normalized;
}

/**
 * 任务服务由插件自给：直接构造基于上下文 base URL 的 HTTP 实现。
 * 不再从宿主 `IHostContext` 读取 `task-service` capability——任务领域完全属于插件，
 * 不出现在宿主或 core。`import.meta.env` 在插件被打进宿主包后于构建期可得，用于解析 base URL。
 */
export function registerTaskService(): void;
export function registerTaskService(taskService: TaskService): void;
export function registerTaskService(options: RegisterTaskServiceOptions): void;
export function registerTaskService(input?: TaskService | RegisterTaskServiceOptions): void {
    if (input && 'getTasks' in input && 'createTask' in input && 'updateTask' in input && 'deleteTask' in input && 'setTaskCompleted' in input) {
        registeredTaskService = input;
        return;
    }

    const env = input?.env ?? (import.meta.env as Record<string, string | undefined>);
    registeredTaskService = new ReplicaTaskService({
        syncKey: resolveSyncKey({
            storage: input?.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined),
            env,
            isDevelopment: input?.isDevelopment ?? false
        }),
        baseUrl: input?.syncBaseUrl ?? deriveSyncBaseUrl(input?.baseUrl),
        env,
        fetchImpl: input?.fetchImpl,
        persistence: input?.replicaPersistence,
        cursorStore: input?.replicaCursorStore
    });
}

export function getTaskService(): TaskService {
    if (!registeredTaskService) {
        throw new Error('Task service is not available in the current host context.');
    }

    return registeredTaskService;
}

export function resetTaskServiceForTests(): void {
    registeredTaskService = null;
}

export function setTaskServiceForTests(taskService: TaskService): void {
    registeredTaskService = taskService;
}
