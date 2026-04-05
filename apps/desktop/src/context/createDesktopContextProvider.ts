import type { ContextSearchRequest, CreateContextNodeInput, WriteContextDocumentInput } from '@packages/core/src';

export function createDesktopContextProvider() {
    return {
        id: 'desktop-context',
        async initializeAccess() {
            await window.chatprismDesktop?.initializeContextAccess();
        },
        async listTree(parentPath?: string) {
            return window.chatprismDesktop?.listContextTree(parentPath) ?? [];
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

            await window.chatprismDesktop.writeContextDocument(input);
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
        async searchInScope(request: ContextSearchRequest) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.searchContextInScope(request);
        },
        async resolveScopedAgentConfig(targetPath: string) {
            if (!window.chatprismDesktop) {
                throw new Error('Desktop context bridge is unavailable');
            }

            return window.chatprismDesktop.resolveScopedAgentConfig(targetPath);
        }
    };
}
