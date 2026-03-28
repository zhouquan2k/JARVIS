import { StorageBackedContextProvider, type StoredWorkspaceSnapshot } from '@packages/core/src';

const STORAGE_KEY = 'chatprism:extension-knowledge-workspace';

const DEFAULT_SNAPSHOT: StoredWorkspaceSnapshot = {
  nodes: [
    {
      path: '/.agent.json',
      name: '.agent.json',
      kind: 'file'
    },
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
    },
    {
      path: '/archive/.agent.json',
      name: '.agent.json',
      kind: 'file',
      parentPath: '/archive'
    },
    {
      path: '/broken',
      name: 'broken',
      kind: 'directory'
    },
    {
      path: '/broken/.agent.json',
      name: '.agent.json',
      kind: 'file',
      parentPath: '/broken'
    },
    {
      path: '/broken/trouble.md',
      name: 'trouble.md',
      kind: 'file',
      parentPath: '/broken'
    }
  ],
  documents: {
    '/.agent.json': JSON.stringify({
      name: 'Workspace Agent',
      description: '默认处理扩展知识工作区的文档与收件箱。',
      instructions: '优先基于当前扩展知识工作区内容回答，并保持对 Markdown 文档的编辑语境。',
      modelProviderName: 'gemini-api',
      modelName: 'gemini-2.5-flash'
    }),
    '/inbox.md': '# Inbox\n\n扩展宿主的 Markdown 工作区。',
    '/archive/.agent.json': JSON.stringify({
      name: 'Archive Agent',
      description: '处理归档内容与历史摘录。',
      instructions: '聚焦归档目录下的材料，回答时优先引用历史摘录。',
      modelProviderName: 'gemini-api',
      modelName: 'gemini-2.5-pro'
    }),
    '/archive/snippet.md': '# Snippet\n\n这里可以保存网页摘录或草稿。',
    '/broken/.agent.json': '{ invalid json }',
    '/broken/trouble.md': '# Broken\n\n这里用于验证 Agent 配置错误提示。'
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
