import type {
    ContextSearchRequest,
    CreateContextNodeInput,
    IContextProvider,
    WriteContextDocumentInput
} from '@packages/core/src';

export function createDesktopContextProvider(): IContextProvider {
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
        }
    };
}
