import type { SyncKeyOptions } from '@packages/core';
import type { Task, TaskQueryTag, TaskService } from '../contracts/Task';
import {
    TaskReplicaProvider,
    type TaskReplicaPersistence
} from './TaskReplicaProvider';
import {
    TaskSyncClient,
    type TaskSyncCursorStore
} from './TaskSyncClient';

export interface ReplicaTaskServiceOptions {
    syncKey: string;
    baseUrl?: string;
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    isDevelopment?: boolean;
    storage?: SyncKeyOptions['storage'];
    persistence?: TaskReplicaPersistence;
    cursorStore?: TaskSyncCursorStore;
}

/** Minimum gap between focus/visibility-triggered syncs, to avoid thrash. */
const FOCUS_SYNC_THROTTLE_MS = 2000;

export class ReplicaTaskService implements TaskService {
    public readonly id = 'task-replica-service';

    private readonly replica: TaskReplicaProvider;
    private readonly syncClient: TaskSyncClient;
    private readonly listeners = new Set<() => void>();
    private lastSyncAt = 0;
    private syncRunActive = false;
    private syncRunScheduled = false;

    constructor(options: ReplicaTaskServiceOptions) {
        this.replica = new TaskReplicaProvider({
            persistence: options.persistence
        });
        this.syncClient = new TaskSyncClient({
            replica: this.replica,
            syncKey: options.syncKey,
            baseUrl: options.baseUrl,
            env: options.env,
            fetchImpl: options.fetchImpl,
            cursorStore: options.cursorStore
        });

        this.registerVisibilityTriggers();
        this.runSync();
    }

    /**
     * Subscribe to task-set changes (local mutations and remote pulls).
     * Returns an unsubscribe function.
     */
    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** Remove global listeners; call when the service is torn down. */
    dispose(): void {
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        }
        if (typeof window !== 'undefined') {
            window.removeEventListener('focus', this.handleWindowFocus);
        }
        this.listeners.clear();
    }

    private registerVisibilityTriggers(): void {
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.handleVisibilityChange);
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('focus', this.handleWindowFocus);
        }
    }

    private readonly handleVisibilityChange = (): void => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            this.runSyncThrottled();
        }
    };

    private readonly handleWindowFocus = (): void => {
        this.runSyncThrottled();
    };

    /** Sync when returning to the app, but not more often than the throttle. */
    private runSyncThrottled(): void {
        if (Date.now() - this.lastSyncAt < FOCUS_SYNC_THROTTLE_MS) {
            return;
        }
        this.runSync();
    }

    /** Push local dirty + pull remote, then notify subscribers to re-read. */
    private runSync(): void {
        this.lastSyncAt = Date.now();
        this.syncRunScheduled = true;
        if (this.syncRunActive) {
            return;
        }

        this.syncRunActive = true;
        void this.flushScheduledSyncs()
            .catch(() => undefined)
            .finally(() => {
                this.syncRunActive = false;
                this.emitChange();
            });
    }

    /**
     * Drain every sync request that arrived while a prior sync was still in
     * flight, so listeners observe the final replica state rather than an
     * intermediate local-only snapshot.
     */
    private async flushScheduledSyncs(): Promise<void> {
        while (this.syncRunScheduled) {
            this.syncRunScheduled = false;
            await this.syncClient.syncNow();
        }
    }

    private emitChange(): void {
        for (const listener of this.listeners) {
            try {
                listener();
            } catch {
                // a failing subscriber must not break the others
            }
        }
    }

    async getTasks(
        documentPath?: string | null,
        agentKey?: string | null,
        completed?: boolean,
        tag?: TaskQueryTag | null,
        documentId?: string | null
    ): Promise<Task[]> {
        return this.replica.getTasks(documentPath, agentKey, completed, tag, documentId);
    }

    async createTask(task: Task): Promise<Task> {
        const created = await this.replica.createTask(task);
        this.queueSync();
        return created;
    }

    async updateTask(task: Task): Promise<Task> {
        const updated = await this.replica.updateTask(task);
        this.queueSync();
        return updated;
    }

    async deleteTask(taskId: string): Promise<void> {
        await this.replica.deleteTask(taskId);
        this.queueSync();
    }

    async setTaskCompleted(taskId: string, completed: boolean): Promise<Task> {
        const updated = await this.replica.setTaskCompleted(taskId, completed);
        this.queueSync();
        return updated;
    }

    private queueSync(): void {
        this.runSync();
    }
}
