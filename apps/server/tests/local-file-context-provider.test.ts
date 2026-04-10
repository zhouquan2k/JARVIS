import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalFileContextProvider } from '../src/providers/localFileContextProvider.js';

const tempRoots: string[] = [];

describe('LocalFileContextProvider.getContext', () => {
    afterEach(async () => {
        await Promise.all(tempRoots.map(async (root) => {
            await rm(root, { recursive: true, force: true });
        }));
        tempRoots.length = 0;
    });

    it('returns a full tree with owner markers, effective agent keys and aligned agent configs', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-local-context-'));
        tempRoots.push(rootPath);

        await mkdir(path.join(rootPath, 'workspace', 'archive'), { recursive: true });
        await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');
        await writeFile(path.join(rootPath, 'workspace', '.agent.json'), JSON.stringify({
            name: 'Workspace Agent',
            instructions: 'Handle workspace docs.'
        }));
        await writeFile(path.join(rootPath, 'workspace', 'guide.md'), '# Guide\n');
        await writeFile(path.join(rootPath, 'workspace', 'archive', '.agent.json'), JSON.stringify({
            name: 'Archive Agent',
            instructions: 'Handle archived docs.'
        }));
        await writeFile(path.join(rootPath, 'workspace', 'archive', 'history.md'), '# History\n');

        const provider = new LocalFileContextProvider({ rootPath });
        const context = await provider.getContext();
        const rootNodes = context.nodes;

        const workspaceNode = rootNodes.find((node) => node.path === '/workspace');
        const archiveNode = workspaceNode?.children?.find((node) => node.path === '/workspace/archive');
        const guideNode = workspaceNode?.children?.find((node) => node.path === '/workspace/guide.md');
        const historyNode = archiveNode?.children?.find((node) => node.path === '/workspace/archive/history.md');
        const welcomeNode = rootNodes.find((node) => node.path === '/welcome.md');

        expect(workspaceNode).toMatchObject({
            kind: 'directory',
            isAgentOwner: true,
            agentKey: '/workspace/'
        });
        expect(guideNode).toMatchObject({
            kind: 'file',
            agentKey: '/workspace/'
        });
        expect(archiveNode).toMatchObject({
            kind: 'directory',
            isAgentOwner: true,
            agentKey: '/workspace/archive/'
        });
        expect(historyNode).toMatchObject({
            kind: 'file',
            agentKey: '/workspace/archive/'
        });
        expect(welcomeNode).toMatchObject({
            kind: 'file',
            agentKey: '/'
        });

        expect(context.agentConfigs['/']).toMatchObject({
            name: 'Default Knowledge Agent',
            scopePath: '/',
            sourcePaths: []
        });
        expect(context.agentConfigs['/workspace/']).toMatchObject({
            name: 'Workspace Agent',
            scopePath: '/workspace',
            sourcePaths: ['/workspace/.agent.json']
        });
        expect(context.agentConfigs['/workspace/archive/']).toMatchObject({
            name: 'Archive Agent',
            scopePath: '/workspace/archive',
            sourcePaths: ['/workspace/.agent.json', '/workspace/archive/.agent.json']
        });
        expect(context.agentConfigs['/workspace/archive/']?.effectiveInstructions).toContain('Handle workspace docs.');
        expect(context.agentConfigs['/workspace/archive/']?.effectiveInstructions).toContain('Handle archived docs.');
    });

    it('merges default tools into the root agent and lets descendants inherit them', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-local-context-'));
        tempRoots.push(rootPath);

        await mkdir(path.join(rootPath, 'workspace', 'archive'), { recursive: true });
        await writeFile(path.join(rootPath, 'workspace', '.agent.json'), JSON.stringify({
            name: 'Workspace Agent',
            tools: [
                { id: 'read_file', description: 'Read workspace files only' },
                { id: 'search_workspace', description: 'Search the workspace subtree' }
            ]
        }));
        await writeFile(path.join(rootPath, 'workspace', 'archive', '.agent.json'), JSON.stringify({
            name: 'Archive Agent',
            tools: [
                { id: 'search_workspace', description: 'Search archived files only' },
                { id: 'cite_sources', description: 'Cite source files' }
            ]
        }));
        await writeFile(path.join(rootPath, 'workspace', 'archive', 'history.md'), '# History\n');

        const provider = new LocalFileContextProvider({ rootPath });
        const context = await provider.getContext();

        expect(context.agentConfigs['/workspace/']?.tools).toEqual([
            { id: 'read_current_file', description: 'Read the currently active file.' },
            { id: 'list_directory', description: 'List files and directories within the knowledge workspace.' },
            { id: 'read_file', description: 'Read workspace files only' },
            { id: 'search_in_scope', description: 'Search for relevant text within the current agent scope.' },
            { id: 'replace_text_in_file', description: 'Replace an exact text match in a file.' },
            { id: 'replace_range_in_file', description: 'Replace text within a specific line and column range.' },
            { id: 'insert_text_in_file', description: 'Insert text at a specific position in a file.' },
            { id: 'delete_range_in_file', description: 'Delete text within a specific line and column range.' },
            { id: 'write_file', description: 'Create or overwrite an entire file.' },
            { id: 'search_workspace', description: 'Search the workspace subtree' }
        ]);
        expect(context.agentConfigs['/workspace/archive/']?.tools).toEqual([
            { id: 'read_current_file', description: 'Read the currently active file.' },
            { id: 'list_directory', description: 'List files and directories within the knowledge workspace.' },
            { id: 'read_file', description: 'Read workspace files only' },
            { id: 'search_in_scope', description: 'Search for relevant text within the current agent scope.' },
            { id: 'replace_text_in_file', description: 'Replace an exact text match in a file.' },
            { id: 'replace_range_in_file', description: 'Replace text within a specific line and column range.' },
            { id: 'insert_text_in_file', description: 'Insert text at a specific position in a file.' },
            { id: 'delete_range_in_file', description: 'Delete text within a specific line and column range.' },
            { id: 'write_file', description: 'Create or overwrite an entire file.' },
            { id: 'search_workspace', description: 'Search archived files only' },
            { id: 'cite_sources', description: 'Cite source files' }
        ]);
    });

    it('supports mounted top-level directories with virtual paths and alias-only root operations', async () => {
        const basePath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-local-mount-'));
        tempRoots.push(basePath);

        const rootPath = path.join(basePath, 'workspace');
        const targetPath = path.join(basePath, 'linked-data');
        const reportsPath = path.join(rootPath, 'reports');
        await mkdir(reportsPath, { recursive: true });
        await mkdir(path.join(targetPath, 'archive'), { recursive: true });
        await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');
        await writeFile(path.join(reportsPath, '.agent.json'), JSON.stringify({
            name: 'Reports Mount',
            instructions: 'Handle mounted reports.',
            linkDir: path.relative(reportsPath, targetPath)
        }));
        await writeFile(path.join(targetPath, 'summary.md'), '# Mounted Summary\n');
        await writeFile(path.join(targetPath, 'archive', '.agent.json'), JSON.stringify({
            name: 'Archive Agent',
            instructions: 'Handle mounted archives.'
        }));
        await writeFile(path.join(targetPath, 'archive', 'history.md'), '# Mounted History\n');

        const provider = new LocalFileContextProvider({ rootPath });
        const context = await provider.getContext();

        const reportsNode = context.nodes.find((node) => node.path === '/reports');
        const summaryNode = reportsNode?.children?.find((node) => node.path === '/reports/summary.md');
        const archiveNode = reportsNode?.children?.find((node) => node.path === '/reports/archive');
        const historyNode = archiveNode?.children?.find((node) => node.path === '/reports/archive/history.md');

        expect(context.nodes.some((node) => node.path === '/welcome.md')).toBe(true);
        expect(reportsNode).toMatchObject({
            kind: 'directory',
            isAgentOwner: true,
            agentKey: '/reports/'
        });
        expect(summaryNode).toMatchObject({
            kind: 'file',
            agentKey: '/reports/'
        });
        expect(archiveNode).toMatchObject({
            kind: 'directory',
            isAgentOwner: true,
            agentKey: '/reports/archive/'
        });
        expect(historyNode).toMatchObject({
            kind: 'file',
            agentKey: '/reports/archive/'
        });
        expect(context.agentConfigs['/reports/']).toMatchObject({
            name: 'Reports Mount',
            scopePath: '/reports',
            sourcePaths: ['/reports/.agent.json']
        });
        expect(context.agentConfigs['/reports/archive/']).toMatchObject({
            name: 'Archive Agent',
            scopePath: '/reports/archive',
            sourcePaths: ['/reports/.agent.json', '/reports/archive/.agent.json']
        });

        const initialSummary = await provider.readDocument('/reports/summary.md');
        expect(initialSummary.path).toBe('/reports/summary.md');
        expect(Buffer.from(initialSummary.dataBase64, 'base64').toString('utf8')).toContain('Mounted Summary');

        await provider.writeDocument({
            path: '/reports/summary.md',
            mimeType: 'text/markdown',
            dataBase64: Buffer.from('# Updated Mounted Summary\n', 'utf8').toString('base64')
        });

        const updatedSummary = await provider.readDocument('/reports/summary.md');
        expect(Buffer.from(updatedSummary.dataBase64, 'base64').toString('utf8')).toContain('Updated Mounted Summary');

        const matches = await provider.searchInScope({
            query: 'Updated Mounted Summary',
            scopePath: '/reports'
        });
        expect(matches).toEqual([
            expect.objectContaining({
                path: '/reports/summary.md'
            })
        ]);

        const createdNode = await provider.createNode({
            parentPath: '/reports/',
            name: 'draft.md',
            kind: 'file'
        });
        expect(createdNode).toMatchObject({
            path: '/reports/draft.md',
            parentPath: '/reports',
            kind: 'file',
            agentKey: '/reports/'
        });
        await expect(readFile(path.join(targetPath, 'draft.md'), 'utf8')).resolves.toBe('');

        await provider.renameNode({ path: '/reports', name: 'docs' });
        const renamedContext = await provider.getContext();
        expect(renamedContext.nodes.some((node) => node.path === '/docs')).toBe(true);
        expect(renamedContext.nodes.some((node) => node.path === '/reports')).toBe(false);
        expect(Buffer.from((await provider.readDocument('/docs/summary.md')).dataBase64, 'base64').toString('utf8'))
            .toContain('Updated Mounted Summary');
        expect(Buffer.from((await provider.readDocument('docs/draft.md')).dataBase64, 'base64').toString('utf8'))
            .toBe('');
        const normalizedMatches = await provider.searchInScope({
            query: 'Updated Mounted Summary',
            scopePath: '/docs/'
        });
        expect(normalizedMatches).toEqual([
            expect.objectContaining({
                path: '/docs/summary.md'
            })
        ]);

        await provider.deleteNode('/docs');
        await expect(provider.readDocument('/docs/summary.md')).rejects.toThrow('节点不存在');
        const targetStats = await stat(targetPath);
        expect(targetStats.isDirectory()).toBe(true);
    });

    it('rejects mixed-content mount roots', async () => {
        const basePath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-local-mount-invalid-'));
        tempRoots.push(basePath);

        const rootPath = path.join(basePath, 'workspace');
        const targetPath = path.join(basePath, 'linked-data');
        const reportsPath = path.join(rootPath, 'reports');
        await mkdir(reportsPath, { recursive: true });
        await mkdir(targetPath, { recursive: true });
        await writeFile(path.join(reportsPath, '.agent.json'), JSON.stringify({
            name: 'Reports Mount',
            linkDir: path.relative(reportsPath, targetPath)
        }));
        await writeFile(path.join(reportsPath, 'README.md'), '# Not empty\n');

        const provider = new LocalFileContextProvider({ rootPath });
        await expect(provider.getContext()).rejects.toThrow('非法挂载入口');
    });

    it('rejects malformed mount declarations', async () => {
        const cases = [
            {
                name: 'empty linkDir',
                config: { name: 'Reports Mount', linkDir: '   ' },
                prepare: async () => {},
                message: 'linkDir 不能为空'
            },
            {
                name: 'non-string linkDir',
                config: { name: 'Reports Mount', linkDir: 42 },
                prepare: async () => {},
                message: '"linkDir" must be a string'
            },
            {
                name: 'missing target',
                config: { name: 'Reports Mount', linkDir: '../missing-dir' },
                prepare: async () => {},
                message: '挂载目标目录不存在'
            },
            {
                name: 'file target',
                config: { name: 'Reports Mount', linkDir: '../../linked-file.md' },
                prepare: async ({ basePath }: { basePath: string }) => {
                    await writeFile(path.join(basePath, 'linked-file.md'), '# not a directory\n');
                },
                message: '挂载目标不是目录'
            }
        ] as const;

        for (const testCase of cases) {
            const basePath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-local-mount-malformed-'));
            tempRoots.push(basePath);

            const rootPath = path.join(basePath, 'workspace');
            const reportsPath = path.join(rootPath, 'reports');
            await mkdir(reportsPath, { recursive: true });
            await testCase.prepare({ basePath });
            await writeFile(path.join(reportsPath, '.agent.json'), JSON.stringify(testCase.config));

            const provider = new LocalFileContextProvider({ rootPath });
            await expect(provider.getContext(), testCase.name).rejects.toThrow(testCase.message);
        }
    });
});
