import { HttpApiClient } from '@packages/core';
import { resolveContextBaseUrl, type ResolveContextBaseUrlOptions } from '@packages/core/config';
import type { Task, TaskQueryTag, TaskService } from '../contracts/Task';

export interface HttpTaskServiceOptions {
    baseUrl?: string;
    env?: ResolveContextBaseUrlOptions['env'];
    fetchImpl?: typeof fetch;
}

/**
 * 任务读写的 HTTP 实现，完全归属 task-mgr 插件。插件自行按上下文 base URL 访问 server 的任务路由，
 * 不再依赖宿主暴露 `task-service` capability，也不要求宿主 / core 知晓任务领域类型。
 */
export class HttpTaskService implements TaskService {
    private readonly client: HttpApiClient;

    constructor(options: HttpTaskServiceOptions = {}) {
        this.client = new HttpApiClient({
            baseUrl: options.baseUrl ?? resolveContextBaseUrl(options.env ?? {}),
            fetchImpl: options.fetchImpl,
            source: 'context'
        });
    }

    async getTasks(
        documentPath?: string | null,
        agentKey?: string | null,
        completed?: boolean,
        tag?: TaskQueryTag | null,
        documentId?: string | null
    ): Promise<Task[]> {
        const response = await this.client.postJson<{ tasks: Task[] }>('/get-tasks', {
            documentPath,
            agentKey,
            completed,
            tag,
            documentId
        });
        return response.tasks;
    }

    async createTask(task: Task): Promise<Task> {
        const response = await this.client.postJson<{ task: Task }>('/create-task', { task });
        return response.task;
    }

    async updateTask(task: Task): Promise<Task> {
        const response = await this.client.postJson<{ task: Task }>('/update-task', { task });
        return response.task;
    }

    async deleteTask(taskId: string): Promise<void> {
        await this.client.postJson('/delete-task', { taskId });
    }

    async setTaskCompleted(taskId: string, completed: boolean): Promise<Task> {
        const response = await this.client.postJson<{ task: Task }>('/set-task-completed', { taskId, completed });
        return response.task;
    }
}
