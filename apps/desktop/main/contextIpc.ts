import { ipcMain } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { FileSystemContextProvider, GoogleCalendarSyncService } from '@packages/node';
import {
    HttpContextProvider,
    type ConversationQuery,
    type ContextSearchRequest,
    type IConversationQueryProvider,
    type IContextProvider,
    type Task,
    type WriteContextDocumentInput
} from '@packages/core/src';
import {
    DESKTOP_CONTEXT_CREATE_TASK_CHANNEL,
    DESKTOP_CONTEXT_CREATE_NODE_CHANNEL,
    DESKTOP_CONTEXT_DELETE_TASK_CHANNEL,
    DESKTOP_CONTEXT_DELETE_NODE_CHANNEL,
    DESKTOP_CONTEXT_GET_CONVERSATIONS_CHANNEL,
    DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL,
    DESKTOP_CONTEXT_GET_TASKS_CHANNEL,
    DESKTOP_CONTEXT_GET_PROJECT_DOCUMENTS_CHANNEL,
    DESKTOP_CONTEXT_INITIALIZE_CHANNEL,
    DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL,
    DESKTOP_CONTEXT_RENAME_NODE_CHANNEL,
    DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL,
    DESKTOP_CONTEXT_SET_TASK_COMPLETED_CHANNEL,
    DESKTOP_CONTEXT_UPDATE_TASK_CHANNEL,
    DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL
} from '../shared/contextBridge';

interface IpcHandlerRegistry {
    handle(channel: string, listener: (...args: any[]) => unknown): void;
    removeHandler(channel: string): void;
}

interface RegisterContextIpcOptions {
    ipc?: IpcHandlerRegistry;
    workspaceRoot?: string;
    contextBaseUrl?: string;
    conversationQueryProvider?: IConversationQueryProvider | null;
    fetchImpl?: typeof fetch;
}

export async function resolveDesktopWorkspaceRoot(configuredRoot = process.env.CHATPRISM_KNOWLEDGE_ROOT): Promise<string> {
    const trimmedRoot = configuredRoot?.trim();
    if (!trimmedRoot) {
        throw new Error('Desktop knowledge workspace root is not configured. Set CHATPRISM_KNOWLEDGE_ROOT.');
    }

    const resolvedRoot = path.resolve(trimmedRoot);
    let workspaceStat;
    try {
        workspaceStat = await stat(resolvedRoot);
    } catch {
        throw new Error(`Desktop knowledge workspace root does not exist: ${resolvedRoot}`);
    }

    if (!workspaceStat.isDirectory()) {
        throw new Error(`Desktop knowledge workspace root must be a directory: ${resolvedRoot}`);
    }

    return resolvedRoot;
}

function createDesktopMainContextProvider(options: {
    workspaceRoot?: string;
    contextBaseUrl?: string;
    conversationQueryProvider?: IConversationQueryProvider | null;
    fetchImpl?: typeof fetch;
}): IContextProvider {
    const contextBaseUrl = options.contextBaseUrl?.trim();
    if (contextBaseUrl) {
        console.info(`[desktop-context] using HTTP context provider: ${contextBaseUrl}`);
        return new HttpContextProvider({
            baseUrl: contextBaseUrl,
            fetchImpl: options.fetchImpl
        });
    }

    console.warn('[desktop-context] falling back to local file context provider');
    return new FileSystemContextProvider({
        rootPath: options.workspaceRoot,
        conversationQueryProvider: options.conversationQueryProvider,
        taskCalendarSyncService: new GoogleCalendarSyncService({
            env: process.env,
            fetchImpl: options.fetchImpl
        })
    });
}

export function registerContextIpc(options: RegisterContextIpcOptions = {}) {
    const ipc = options.ipc ?? ipcMain;
    const provider = createDesktopMainContextProvider({
        workspaceRoot: options.workspaceRoot,
        contextBaseUrl: options.contextBaseUrl,
        conversationQueryProvider: options.conversationQueryProvider,
        fetchImpl: options.fetchImpl
    });

    ipc.handle(DESKTOP_CONTEXT_INITIALIZE_CHANNEL, async () => {
        await provider.initializeAccess();
    });
    ipc.handle(DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL, async () => {
        return provider.getContext();
    });
    ipc.handle(DESKTOP_CONTEXT_GET_CONVERSATIONS_CHANNEL, async (_event, query: ConversationQuery) => {
        return provider.getConversations(query);
    });
    ipc.handle(DESKTOP_CONTEXT_GET_TASKS_CHANNEL, async (_event, query: { documentPath?: string | null; agentKey?: string | null; completed?: boolean }) => {
        return provider.getTaskProvider().getTasks(query.documentPath, query.agentKey, query.completed);
    });
    ipc.handle(DESKTOP_CONTEXT_CREATE_TASK_CHANNEL, async (_event, task: Task) => {
        console.info('[desktop-context] create task requested', {
            taskId: task.id,
            title: task.title,
            dueAt: task.dueAt
        });
        try {
            const created = await provider.getTaskProvider().createTask(task);
            console.info('[desktop-context] create task completed', {
                taskId: created.id,
                calendarSyncStatus: created.calendarSyncStatus,
                calendarEventId: created.calendarEventId
            });
            return created;
        } catch (error) {
            console.error('[desktop-context] create task failed', {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    });
    ipc.handle(DESKTOP_CONTEXT_UPDATE_TASK_CHANNEL, async (_event, task: Task) => {
        console.info('[desktop-context] update task requested', {
            taskId: task.id,
            title: task.title,
            dueAt: task.dueAt
        });
        try {
            const updated = await provider.getTaskProvider().updateTask(task);
            console.info('[desktop-context] update task completed', {
                taskId: updated.id,
                calendarSyncStatus: updated.calendarSyncStatus,
                calendarEventId: updated.calendarEventId
            });
            return updated;
        } catch (error) {
            console.error('[desktop-context] update task failed', {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    });
    ipc.handle(DESKTOP_CONTEXT_DELETE_TASK_CHANNEL, async (_event, taskId: string) => {
        await provider.getTaskProvider().deleteTask(taskId);
    });
    ipc.handle(DESKTOP_CONTEXT_SET_TASK_COMPLETED_CHANNEL, async (_event, payload: { taskId: string; completed: boolean }) => {
        return provider.getTaskProvider().setTaskCompleted(payload.taskId, payload.completed);
    });
    ipc.handle(DESKTOP_CONTEXT_GET_PROJECT_DOCUMENTS_CHANNEL, async (_event, curNode: string) => {
        return provider.getProjectDocuments(curNode);
    });
    ipc.handle(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL, async (_event, targetPath: string) => {
        return provider.readDocument(targetPath);
    });
    ipc.handle(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL, async (_event, input: WriteContextDocumentInput) => {
        return provider.writeDocument(input);
    });
    ipc.handle(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL, async (_event, input: { parentPath?: string; name: string; kind: 'file' | 'directory' }) => {
        return provider.createNode(input);
    });
    ipc.handle(DESKTOP_CONTEXT_DELETE_NODE_CHANNEL, async (_event, targetPath: string) => {
        await provider.deleteNode(targetPath);
    });
    ipc.handle(DESKTOP_CONTEXT_RENAME_NODE_CHANNEL, async (_event, input: { path: string; name: string }) => {
        return provider.renameNode(input);
    });
    ipc.handle(DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL, async (_event, request: ContextSearchRequest) => {
        return provider.searchInScope(request);
    });

    return () => {
        ipc.removeHandler(DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_GET_CONVERSATIONS_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_GET_TASKS_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_CREATE_TASK_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_UPDATE_TASK_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_DELETE_TASK_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_SET_TASK_COMPLETED_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_GET_PROJECT_DOCUMENTS_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_DELETE_NODE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_RENAME_NODE_CHANNEL);
    };
}
