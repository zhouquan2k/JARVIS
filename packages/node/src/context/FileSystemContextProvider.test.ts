import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileSystemContextProvider } from './FileSystemContextProvider';
import { DEFAULT_WORKSPACE_METADATA_BOOTSTRAP } from '../../../core/index.ts';

const tempRoots: string[] = [];

describe('FileSystemContextProvider', () => {
    afterEach(async () => {
        await Promise.all(tempRoots.map(async (root) => {
            await rm(root, { recursive: true, force: true });
        }));
        tempRoots.length = 0;
    });

    it('returns a full tree with metadata ownership, effective scope keys and raw scope metadata', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-context-'));
        tempRoots.push(rootPath);

        await mkdir(path.join(rootPath, 'workspace', 'archive'), { recursive: true });
        await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');
        await writeFile(path.join(rootPath, '.secret.md'), '# Hidden\n');
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

        const provider = new FileSystemContextProvider({ rootPath });
        const context = await provider.getContext();
        const rootNodes = context.nodes;

        const workspaceNode = rootNodes.find((node) => node.path === '/workspace');
        const archiveNode = workspaceNode?.children?.find((node) => node.path === '/workspace/archive');
        const guideNode = workspaceNode?.children?.find((node) => node.path === '/workspace/guide.md');
        const historyNode = archiveNode?.children?.find((node) => node.path === '/workspace/archive/history.md');
        const welcomeNode = rootNodes.find((node) => node.path === '/welcome.md');

        expect(rootNodes.some((node) => node.path === '/.secret.md')).toBe(false);
        expect(workspaceNode).toMatchObject({
            kind: 'directory',
            ownsMetadata: true,
            scopeKey: '/workspace/'
        });
        expect(guideNode).toMatchObject({
            kind: 'file',
            scopeKey: '/workspace/'
        });
        expect(archiveNode).toMatchObject({
            kind: 'directory',
            ownsMetadata: true,
            scopeKey: '/workspace/archive/'
        });
        expect(historyNode).toMatchObject({
            kind: 'file',
            scopeKey: '/workspace/archive/'
        });
        expect(welcomeNode).toMatchObject({
            kind: 'file',
            scopeKey: '/'
        });

        expect(context.folderMetadata['/']?.data).toMatchObject({
            ...DEFAULT_WORKSPACE_METADATA_BOOTSTRAP
        });
        const rootAgentFile = await readFile(path.join(rootPath, '.agent.json'), 'utf8');
        expect(JSON.parse(rootAgentFile)).toMatchObject({
            name: 'Default Knowledge Scope',
            modelProviderName: 'gemini-api'
        });
        expect(context.folderMetadata['/workspace/']?.data).toMatchObject({
            name: 'Workspace Agent',
            instructions: 'Handle workspace docs.'
        });
        expect(context.folderMetadata['/workspace/archive/']?.data).toMatchObject({
            name: 'Archive Agent',
            instructions: 'Handle archived docs.'
        });
    });

    it('supports mounted top-level directories with virtual paths and alias-only root operations', async () => {
        const basePath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-mount-'));
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

        const provider = new FileSystemContextProvider({ rootPath });
        const context = await provider.getContext();

        const reportsNode = context.nodes.find((node) => node.path === '/reports');
        const summaryNode = reportsNode?.children?.find((node) => node.path === '/reports/summary.md');
        const archiveNode = reportsNode?.children?.find((node) => node.path === '/reports/archive');
        const historyNode = archiveNode?.children?.find((node) => node.path === '/reports/archive/history.md');

        expect(context.nodes.some((node) => node.path === '/welcome.md')).toBe(true);
        expect(reportsNode).toMatchObject({
            kind: 'directory',
            ownsMetadata: true,
            scopeKey: '/reports/'
        });
        expect(summaryNode).toMatchObject({
            kind: 'file',
            scopeKey: '/reports/'
        });
        expect(archiveNode).toMatchObject({
            kind: 'directory',
            ownsMetadata: true,
            scopeKey: '/reports/archive/'
        });
        expect(historyNode).toMatchObject({
            kind: 'file',
            scopeKey: '/reports/archive/'
        });
        expect(context.folderMetadata['/reports/']?.data).toMatchObject({
            name: 'Reports Mount',
            instructions: 'Handle mounted reports.',
            linkDir: path.relative(reportsPath, targetPath)
        });
        expect(context.folderMetadata['/reports/archive/']?.data).toMatchObject({
            name: 'Archive Agent',
            instructions: 'Handle mounted archives.'
        });

        const initialMountAgentConfig = await provider.readDocument('/reports/.agent.json');
        expect(Buffer.from(initialMountAgentConfig.dataBase64, 'base64').toString('utf8')).toContain('Reports Mount');

        await provider.writeDocument({
            path: '/reports/.agent.json',
            mimeType: 'application/json',
            dataBase64: Buffer.from(JSON.stringify({
                name: 'Updated Reports Mount',
                instructions: 'Use the alias-local agent config.',
                linkDir: path.relative(reportsPath, targetPath)
            }, null, 2), 'utf8').toString('base64')
        });

        const updatedMountAgentConfig = await readFile(path.join(reportsPath, '.agent.json'), 'utf8');
        expect(JSON.parse(updatedMountAgentConfig)).toMatchObject({
            name: 'Updated Reports Mount',
            instructions: 'Use the alias-local agent config.'
        });
        await expect(readFile(path.join(targetPath, '.agent.json'), 'utf8')).rejects.toThrow();

        const updatedMountContext = await provider.getContext();
        expect(updatedMountContext.folderMetadata['/reports/']?.data).toMatchObject({
            name: 'Updated Reports Mount',
            instructions: 'Use the alias-local agent config.',
            linkDir: path.relative(reportsPath, targetPath)
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
            kind: 'file'
        });
        await expect(readFile(path.join(targetPath, 'draft.md'), 'utf8')).resolves.toContain('jarvis_id:');

        await provider.renameNode({ path: '/reports', name: 'docs' });
        const renamedContext = await provider.getContext();
        expect(renamedContext.nodes.some((node) => node.path === '/docs')).toBe(true);
        expect(renamedContext.nodes.some((node) => node.path === '/reports')).toBe(false);
        expect(Buffer.from((await provider.readDocument('/docs/summary.md')).dataBase64, 'base64').toString('utf8'))
            .toContain('Updated Mounted Summary');
        expect(Buffer.from((await provider.readDocument('docs/draft.md')).dataBase64, 'base64').toString('utf8'))
            .toContain('jarvis_id:');
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
        await expect(provider.readDocument('/docs/summary.md')).rejects.toThrow('Node does not exist');
        const targetStats = await stat(targetPath);
        expect(targetStats.isDirectory()).toBe(true);
    });

    it('creates hidden agent config files even though they are not visible in context nodes', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-hidden-agent-create-'));
        tempRoots.push(rootPath);

        await mkdir(path.join(rootPath, 'docs'), { recursive: true });
        const provider = new FileSystemContextProvider({ rootPath });

        const createdNode = await provider.createNode({
            parentPath: '/docs',
            name: '.agent.json',
            kind: 'file'
        });

        expect(createdNode).toMatchObject({
            path: '/docs/.agent.json',
            name: '.agent.json',
            kind: 'file',
            parentPath: '/docs'
        });
        await expect(readFile(path.join(rootPath, 'docs', '.agent.json'), 'utf8')).resolves.toBe('');
    });

    it('assigns a documentId immediately when creating a markdown document', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-create-markdown-id-'));
        tempRoots.push(rootPath);

        await mkdir(path.join(rootPath, 'docs'), { recursive: true });
        const provider = new FileSystemContextProvider({ rootPath });

        const createdNode = await provider.createNode({
            parentPath: '/docs',
            name: 'draft.md',
            kind: 'file'
        });

        expect(createdNode).toMatchObject({
            path: '/docs/draft.md',
            kind: 'file',
            parentPath: '/docs'
        });

        const createdDocument = await provider.readDocument('/docs/draft.md');
        expect(createdDocument.documentId).toBeTruthy();
        const persisted = await readFile(path.join(rootPath, 'docs', 'draft.md'), 'utf8');
        expect(persisted).toContain('jarvis_id:');
    });

    it('renames a visible file into hidden agent config without requiring context visibility', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-hidden-agent-rename-'));
        tempRoots.push(rootPath);

        await mkdir(path.join(rootPath, 'docs'), { recursive: true });
        await writeFile(path.join(rootPath, 'docs', 'agent-config.json'), '{}\n');
        const provider = new FileSystemContextProvider({ rootPath });

        const renamedNode = await provider.renameNode({
            path: '/docs/agent-config.json',
            name: '.agent.json'
        });

        expect(renamedNode).toMatchObject({
            path: '/docs/.agent.json',
            name: '.agent.json',
            kind: 'file',
            parentPath: '/docs'
        });
        await expect(readFile(path.join(rootPath, 'docs', '.agent.json'), 'utf8')).resolves.toBe('{}\n');
    });

    it('lists markdown documents in the current project scope', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-project-docs-'));
        tempRoots.push(rootPath);

        await mkdir(path.join(rootPath, 'workspace', 'archive'), { recursive: true });
        await writeFile(path.join(rootPath, 'workspace', 'guide.md'), '# Guide\n');
        await writeFile(path.join(rootPath, 'workspace', 'notes.txt'), 'ignore\n');
        await writeFile(path.join(rootPath, 'workspace', 'archive', 'history.markdown'), '# History\n');

        const provider = new FileSystemContextProvider({ rootPath });

        await expect(provider.getProjectDocuments('/workspace')).resolves.toEqual([
            { path: '/workspace/archive/history.markdown', name: 'history.markdown' },
            { path: '/workspace/guide.md', name: 'guide.md' }
        ]);
    });

    it('rejects mixed-content mount roots', async () => {
        const basePath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-mount-invalid-'));
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

        const provider = new FileSystemContextProvider({ rootPath });
        await expect(provider.getContext()).rejects.toThrow('Invalid mount entry');
    });

    it('rejects malformed mount declarations', async () => {
        const cases = [
            {
                name: 'empty linkDir',
                config: { name: 'Reports Mount', linkDir: '   ' },
                prepare: async () => {},
                message: 'linkDir must not be empty.'
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
                message: 'Mount target directory does not exist'
            },
            {
                name: 'file target',
                config: { name: 'Reports Mount', linkDir: '../../linked-file.md' },
                prepare: async ({ basePath }: { basePath: string }) => {
                    await writeFile(path.join(basePath, 'linked-file.md'), '# not a directory\n');
                },
                message: 'Mount target is not a directory'
            }
        ] as const;

        for (const testCase of cases) {
            const basePath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-mount-malformed-'));
            tempRoots.push(basePath);

            const rootPath = path.join(basePath, 'workspace');
            const reportsPath = path.join(rootPath, 'reports');
            await mkdir(reportsPath, { recursive: true });
            await testCase.prepare({ basePath });
            await writeFile(path.join(reportsPath, '.agent.json'), JSON.stringify(testCase.config));

            const provider = new FileSystemContextProvider({ rootPath });
            await expect(provider.getContext(), testCase.name).rejects.toThrow(testCase.message);
        }
    });

    it('writes binary document payloads for non-text workspace assets', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-binary-write-'));
        tempRoots.push(rootPath);

        await mkdir(path.join(rootPath, 'references'), { recursive: true });
        await writeFile(path.join(rootPath, 'references', 'diagram.png'), Buffer.from([0]));

        const provider = new FileSystemContextProvider({ rootPath });
        await provider.writeDocument({
            path: '/references/diagram.png',
            mimeType: 'image/png',
            dataBase64: Buffer.from([137, 80, 78, 71]).toString('base64')
        });

        const persisted = await readFile(path.join(rootPath, 'references', 'diagram.png'));
        expect(Array.from(persisted)).toEqual([137, 80, 78, 71]);
    });

    it('rejects document IDs for non-Markdown files without modifying file content', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-non-markdown-id-'));
        tempRoots.push(rootPath);

        await mkdir(path.join(rootPath, 'references'), { recursive: true });
        await writeFile(path.join(rootPath, 'references', 'diagram.png'), Buffer.from([137, 80, 78, 71]));

        const provider = new FileSystemContextProvider({ rootPath });

        await expect(provider.getDocumentId('/references/diagram.png')).rejects.toThrow(
            'Only Markdown documents can have document IDs.'
        );

        const persisted = await readFile(path.join(rootPath, 'references', 'diagram.png'));
        expect(Array.from(persisted)).toEqual([137, 80, 78, 71]);
    });

    it('moves files into another directory and rejects descendant targets', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-move-'));
        tempRoots.push(rootPath);

        await mkdir(path.join(rootPath, 'docs', 'archive'), { recursive: true });
        await writeFile(path.join(rootPath, 'docs', 'guide.md'), '# Guide\n');
        const provider = new FileSystemContextProvider({ rootPath });

        const movedNode = await provider.moveNode({
            path: '/docs/guide.md',
            targetParentPath: '/docs/archive'
        });

        expect(movedNode).toMatchObject({
            path: '/docs/archive/guide.md',
            name: 'guide.md',
            kind: 'file',
            parentPath: '/docs/archive'
        });
        await expect(readFile(path.join(rootPath, 'docs', 'archive', 'guide.md'), 'utf8')).resolves.toContain('# Guide');
        await expect(provider.moveNode({
            path: '/docs',
            targetParentPath: '/docs/archive'
        })).rejects.toThrow('Cannot move a node into itself or its descendant.');
    });
});
