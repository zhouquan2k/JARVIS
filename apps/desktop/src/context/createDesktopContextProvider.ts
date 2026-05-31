import type {
    ConversationQuery,
    ContextSearchRequest,
    CreateContextNodeInput,
    IContextProvider,
    MoveContextNodeInput,
    Task,
    TaskQueryTag,
    WriteContextDocumentInput
} from '@packages/core/src';

export function createDesktopContextProvider(): IContextProvider {
    const taskProvider = {
        getTasks: async (
            documentPath?: string | null,
            agentKey?: string | null,
            completed?: boolean,
            tag?: TaskQueryTag | null,
            documentId?: string | null
        ) => {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.getTasks({ documentPath, agentKey, completed, tag, documentId });
        },
        createTask: async (task: Task) => {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.createTask(task);
        },
        updateTask: async (task: Task) => {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.updateTask(task);
        },
        deleteTask: async (taskId: string) => {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            await window.chatprismDesktop.deleteTask(taskId);
        },
        setTaskCompleted: async (taskId: string, completed: boolean) => {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.setTaskCompleted(taskId, completed);
        }
    };

    return {
        id: 'desktop-context',
        async initializeAccess() {
            await window.chatprismDesktop?.initializeContextAccess();
        },
        async getContext() {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.getContext();
        },
        async getConversations(query: ConversationQuery) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.getConversations(query);
        },
        getTaskProvider() {
            return taskProvider;
        },
        async getProjectDocuments(curNode: string) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.getProjectDocuments(curNode);
        },
        async readDocument(path: string) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.readContextDocument(path);
        },
        async writeDocument(input: WriteContextDocumentInput) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.writeContextDocument(input);
        },
        async createNode(input: CreateContextNodeInput) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.createContextNode(input);
        },
        async deleteNode(path: string) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            await window.chatprismDesktop.deleteContextNode(path);
        },
        async renameNode(input: { path: string; name: string }) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.renameContextNode(input);
        },
        async moveNode(input: MoveContextNodeInput) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.moveContextNode(input);
        },
        async searchInScope(request: ContextSearchRequest) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.searchContextInScope(request);
        },
        async getDocumentId(path: string) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.getDocumentId(path);
        },
        async resolveDocumentIds(ids: string[]) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            const resolved = await window.chatprismDesktop.resolveDocumentIds(ids);
            return new Map(Object.entries(resolved));
        }
    };
}
