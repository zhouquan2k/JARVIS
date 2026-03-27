import type { StoredWorkspaceSnapshot } from '../providers/StorageBackedContextProvider';
import { StorageBackedContextProvider } from '../providers/StorageBackedContextProvider';

export function createMockContextProvider(snapshot?: StoredWorkspaceSnapshot) {
    let currentSnapshot = snapshot ?? {
        nodes: [
            {
                path: '/welcome.md',
                name: 'welcome.md',
                kind: 'file' as const
            }
        ],
        documents: {
            '/welcome.md': '# Welcome\n\nMock context provider'
        }
    };

    return new StorageBackedContextProvider({
        id: 'mock-context',
        async readSnapshot() {
            return currentSnapshot;
        },
        async writeSnapshot(snapshotToWrite) {
            currentSnapshot = snapshotToWrite;
        },
        initialSnapshot: currentSnapshot
    });
}
