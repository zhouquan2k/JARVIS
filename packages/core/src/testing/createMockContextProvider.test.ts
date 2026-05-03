import { describe, expect, it } from 'vitest';
import { createMockContextProvider } from './createMockContextProvider';

describe('createMockContextProvider.getContext', () => {
    it('builds a full workspace tree with effective agent keys and cached configs', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/welcome.md', name: 'welcome.md', kind: 'file' },
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/guide.md', name: 'guide.md', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/archive', name: 'archive', kind: 'directory', parentPath: '/workspace' },
                { path: '/workspace/archive/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/workspace/archive' },
                { path: '/workspace/archive/history.md', name: 'history.md', kind: 'file', parentPath: '/workspace/archive' }
            ],
            documents: {
                '/welcome.md': '# Welcome',
                '/workspace/.agent.json': JSON.stringify({
                    name: 'Workspace Agent',
                    instructions: 'Handle workspace docs.'
                }),
                '/workspace/guide.md': '# Guide',
                '/workspace/archive/.agent.json': JSON.stringify({
                    name: 'Archive Agent',
                    instructions: 'Handle archived docs.'
                }),
                '/workspace/archive/history.md': '# History'
            }
        });

        const context = await provider.getContext();
        const workspaceNode = context.nodes.find((node) => node.path === '/workspace');
        const archiveNode = workspaceNode?.children?.find((node) => node.path === '/workspace/archive');

        expect(context.agentConfigs['/']).toMatchObject({
            name: 'Default Knowledge Agent',
            scopePath: '/'
        });
        expect(workspaceNode).toMatchObject({
            isAgentOwner: true,
            agentKey: '/workspace/'
        });
        expect(archiveNode).toMatchObject({
            isAgentOwner: true,
            agentKey: '/workspace/archive/'
        });
        expect(context.agentConfigs['/workspace/archive/']).toMatchObject({
            scopePath: '/workspace/archive',
            sourcePaths: ['/workspace/.agent.json', '/workspace/archive/.agent.json']
        });
    });

    it('lists markdown documents within the current project scope', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/guide.md', name: 'guide.md', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/notes.txt', name: 'notes.txt', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/archive', name: 'archive', kind: 'directory', parentPath: '/workspace' },
                { path: '/workspace/archive/history.markdown', name: 'history.markdown', kind: 'file', parentPath: '/workspace/archive' }
            ],
            documents: {
                '/workspace/guide.md': '# Guide',
                '/workspace/notes.txt': 'ignore',
                '/workspace/archive/history.markdown': '# History'
            }
        });

        await expect(provider.getProjectDocuments('/workspace')).resolves.toEqual([
            { path: '/workspace/archive/history.markdown', name: 'history.markdown' },
            { path: '/workspace/guide.md', name: 'guide.md' }
        ]);
    });
});
