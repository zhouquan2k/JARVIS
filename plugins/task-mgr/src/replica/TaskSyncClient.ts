import localforage from 'localforage';
import { HttpApiClient, resolveSyncBaseUrl, type SyncBaseUrlOptions } from '@packages/core';
import type { Task } from '../contracts/Task';
import type { ReplicaDeletedTask } from './TaskReplicaProvider';

export interface TaskReplicaSyncStore {
    listDirtyTasks(): Promise<Task[]>;
    listDeletedTasks(): Promise<ReplicaDeletedTask[]>;
    markTasksSynced(taskIds: string[]): Promise<void>;
    markDeletedTasksSynced(taskIds: string[]): Promise<void>;
    applyRemoteTasks(tasks: Task[]): Promise<void>;
    applyRemoteDeletedTasks(tasks: ReplicaDeletedTask[]): Promise<void>;
}

export interface TaskSyncCursorStore {
    getCursor(syncKey: string): Promise<number | null>;
    setCursor(syncKey: string, cursor: number | null): Promise<void>;
    clear?(): Promise<void>;
}

export interface TaskSyncPushResult {
    processedIds: string[];
    processedDeletedIds?: string[];
    nextCursor?: number | null;
}

export interface TaskSyncPullResult {
    tasks: Task[];
    deletedTasks: ReplicaDeletedTask[];
    nextCursor: number | null;
}

export interface TaskSyncTransport {
    push(tasks: Task[], deletedTasks?: ReplicaDeletedTask[]): Promise<TaskSyncPushResult>;
    pull(cursor: number | null): Promise<TaskSyncPullResult>;
}

export interface TaskSyncClientOptions {
    replica: TaskReplicaSyncStore;
    syncKey: string;
    baseUrl?: string;
    env?: SyncBaseUrlOptions['env'];
    fetchImpl?: typeof fetch;
    initialCursor?: number | null;
    cursorStore?: TaskSyncCursorStore;
    transport?: TaskSyncTransport;
}

function mergeCursor(current: number | null, next?: number | null): number | null {
    if (typeof next !== 'number') {
        return current;
    }

    if (typeof current !== 'number') {
        return next;
    }

    return Math.max(current, next);
}

class LocalForageTaskSyncCursorStore implements TaskSyncCursorStore {
    private readonly store = localforage.createInstance({
        name: 'chatprism',
        storeName: 'task-sync-metadata'
    });

    async getCursor(syncKey: string): Promise<number | null> {
        const value = await this.store.getItem<number>(`cursor:${syncKey}`);
        return typeof value === 'number' ? value : null;
    }

    async setCursor(syncKey: string, cursor: number | null): Promise<void> {
        await this.store.setItem(`cursor:${syncKey}`, cursor);
    }

    async clear(): Promise<void> {
        await this.store.clear();
    }
}

class HttpTaskSyncTransport implements TaskSyncTransport {
    private readonly client: HttpApiClient;

    constructor(options: Pick<TaskSyncClientOptions, 'syncKey' | 'baseUrl' | 'env' | 'fetchImpl'>) {
        this.client = new HttpApiClient({
            baseUrl: options.baseUrl ?? resolveSyncBaseUrl({ env: options.env }),
            fetchImpl: options.fetchImpl,
            source: 'sync',
            headers: {
                'x-sync-key': options.syncKey
            }
        });
    }

    async push(tasks: Task[], deletedTasks: ReplicaDeletedTask[] = []): Promise<TaskSyncPushResult> {
        return this.client.postJson<TaskSyncPushResult>('/tasks/push', {
            tasks,
            deletedTasks
        });
    }

    async pull(cursor: number | null): Promise<TaskSyncPullResult> {
        return this.client.postJson<TaskSyncPullResult>('/tasks/pull', { cursor });
    }
}

export class MemoryTaskSyncCursorStore implements TaskSyncCursorStore {
    private readonly cursors = new Map<string, number | null>();

    async getCursor(syncKey: string): Promise<number | null> {
        return this.cursors.has(syncKey) ? this.cursors.get(syncKey)! : null;
    }

    async setCursor(syncKey: string, cursor: number | null): Promise<void> {
        this.cursors.set(syncKey, cursor);
    }

    async clear(): Promise<void> {
        this.cursors.clear();
    }
}

export class TaskSyncClient {
    private readonly replica: TaskReplicaSyncStore;
    private readonly syncKey: string;
    private readonly cursorStore: TaskSyncCursorStore;
    private readonly transport: TaskSyncTransport;
    private cursorLoaded = false;
    private cursor: number | null;
    private activeSync: Promise<void> | null = null;
    private pendingSync = false;

    constructor(options: TaskSyncClientOptions) {
        this.replica = options.replica;
        this.syncKey = options.syncKey;
        this.cursorStore = options.cursorStore ?? new LocalForageTaskSyncCursorStore();
        this.transport = options.transport ?? new HttpTaskSyncTransport(options);
        this.cursor = options.initialCursor ?? null;
    }

    async hydrate(): Promise<void> {
        await this.syncNow();
    }

    async syncAfterMutation(): Promise<void> {
        await this.syncNow();
    }

    async syncNow(): Promise<void> {
        if (this.activeSync) {
            this.pendingSync = true;
            return this.activeSync;
        }

        this.activeSync = this.performSync().finally(() => {
            this.activeSync = null;
            if (this.pendingSync) {
                this.pendingSync = false;
                void this.syncNow().catch(() => undefined);
            }
        });

        return this.activeSync;
    }

    async pushDirty(): Promise<void> {
        await this.ensureCursorLoaded();
        const dirtyTasks = await this.replica.listDirtyTasks();
        const deletedTasks = await this.replica.listDeletedTasks();

        if (dirtyTasks.length === 0 && deletedTasks.length === 0) {
            return;
        }

        const result = await this.transport.push(dirtyTasks, deletedTasks);
        await this.replica.markTasksSynced(result.processedIds);
        await this.replica.markDeletedTasksSynced(result.processedDeletedIds ?? []);
        await this.updateCursorIfNeeded(result.nextCursor);
    }

    async pullSince(): Promise<void> {
        await this.ensureCursorLoaded();
        await this.pullFromCursor(this.cursor);
    }

    private async performSync(): Promise<void> {
        await this.ensureCursorLoaded();
        const pullCursor = this.cursor;
        await this.pushDirty();
        await this.pullFromCursor(pullCursor);
    }

    private async pullFromCursor(cursor: number | null): Promise<void> {
        const result = await this.transport.pull(cursor);
        await this.replica.applyRemoteTasks(result.tasks);
        await this.replica.applyRemoteDeletedTasks(result.deletedTasks);
        await this.updateCursorIfNeeded(result.nextCursor);
    }

    private async ensureCursorLoaded(): Promise<void> {
        if (this.cursorLoaded) {
            return;
        }

        const persistedCursor = await this.cursorStore.getCursor(this.syncKey);
        if (persistedCursor !== null || this.cursor === null) {
            this.cursor = persistedCursor;
        }
        this.cursorLoaded = true;
    }

    private async updateCursorIfNeeded(nextCursor?: number | null): Promise<void> {
        const merged = mergeCursor(this.cursor, nextCursor);
        if (merged === this.cursor) {
            return;
        }

        this.cursor = merged;
        await this.cursorStore.setCursor(this.syncKey, merged);
    }
}
