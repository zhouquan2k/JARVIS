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

export class ReplicaTaskService implements TaskService {
    public readonly id = 'task-replica-service';

    private readonly replica: TaskReplicaProvider;
    private readonly syncClient: TaskSyncClient;

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

        void this.syncClient.hydrate().catch(() => undefined);
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
        void this.syncClient.syncAfterMutation().catch(() => undefined);
    }
}
