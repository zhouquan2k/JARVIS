import { StorageBackedContextProvider, type StoredWorkspaceSnapshot } from '@packages/core/src';

const STORAGE_KEY = 'chatprism:extension-knowledge-workspace';

const DEFAULT_SNAPSHOT: StoredWorkspaceSnapshot = {
  nodes: [
    {
      path: '/inbox.md',
      name: 'inbox.md',
      kind: 'file'
    },
    {
      path: '/archive',
      name: 'archive',
      kind: 'directory'
    },
    {
      path: '/archive/snippet.md',
      name: 'snippet.md',
      kind: 'file',
      parentPath: '/archive'
    }
  ],
  documents: {
    '/inbox.md': '# Inbox\n\n扩展宿主的 Markdown 工作区。',
    '/archive/snippet.md': '# Snippet\n\n这里可以保存网页摘录或草稿。'
  }
};

export function createExtensionContextProvider(storage?: Storage) {
  return new StorageBackedContextProvider({
    id: 'extension-context',
    async readSnapshot() {
      const raw = storage?.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) as StoredWorkspaceSnapshot : null;
    },
    async writeSnapshot(snapshot) {
      storage?.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    },
    initialSnapshot: DEFAULT_SNAPSHOT
  });
}
