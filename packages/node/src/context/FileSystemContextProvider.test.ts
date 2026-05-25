import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileSystemContextProvider } from './FileSystemContextProvider';
import { DEFAULT_SCOPED_AGENT_CONFIG } from '../../../core/src/index.ts';

const tempRoots: string[] = [];

describe('FileSystemContextProvider', () => {
    afterEach(async () => {
        await Promise.all(tempRoots.map(async (root) => {
            await rm(root, { recursive: true, force: true });
        }));
        tempRoots.length = 0;
    });

    it('returns a full tree with owner markers, effective agent keys and aligned agent configs', async () => {
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
            ...DEFAULT_SCOPED_AGENT_CONFIG,
            scopePath: '/',
            sourcePaths: ['/.agent.json']
        });
        const rootAgentFile = await readFile(path.join(rootPath, '.agent.json'), 'utf8');
        expect(JSON.parse(rootAgentFile)).toMatchObject(DEFAULT_SCOPED_AGENT_CONFIG);
        expect(context.agentConfigs['/workspace/']).toMatchObject({
            name: 'Workspace Agent',
            scopePath: '/workspace',
            sourcePaths: ['/.agent.json', '/workspace/.agent.json']
        });
        expect(context.agentConfigs['/workspace/archive/']).toMatchObject({
            name: 'Archive Agent',
            scopePath: '/workspace/archive',
            sourcePaths: ['/.agent.json', '/workspace/.agent.json', '/workspace/archive/.agent.json']
        });
        expect(context.agentConfigs['/workspace/archive/']?.effectiveInstructions).toContain('Handle workspace docs.');
        expect(context.agentConfigs['/workspace/archive/']?.effectiveInstructions).toContain('Handle archived docs.');
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
            sourcePaths: ['/.agent.json', '/reports/.agent.json']
        });
        expect(context.agentConfigs['/reports/archive/']).toMatchObject({
            name: 'Archive Agent',
            scopePath: '/reports/archive',
            sourcePaths: ['/.agent.json', '/reports/.agent.json', '/reports/archive/.agent.json']
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
        expect(updatedMountContext.agentConfigs['/reports/']).toMatchObject({
            name: 'Updated Reports Mount',
            scopePath: '/reports',
            sourcePaths: ['/.agent.json', '/reports/.agent.json']
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
            parentPath: '/docs',
            agentKey: '/'
        });
        await expect(readFile(path.join(rootPath, 'docs', '.agent.json'), 'utf8')).resolves.toBe('');
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
            parentPath: '/docs',
            agentKey: '/'
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

    it('persists document-scoped and project-scoped tasks in local task storage', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-tasks-'));
        tempRoots.push(rootPath);
        await mkdir(path.join(rootPath, 'workspace'), { recursive: true });
        await writeFile(path.join(rootPath, 'workspace', 'guide.md'), '# Guide\n');

        const provider = new FileSystemContextProvider({ rootPath });
        const taskProvider = provider.getTaskProvider();

        const docTask = await taskProvider.createTask({
            id: 'temp-doc',
            title: 'Document task',
            notes: '',
            completed: false,
            dueAt: null,
            priority: 'medium',
            documentPath: '/workspace/guide.md',
            agentKey: '/workspace/',
            createdAt: 0,
            updatedAt: 0,
            completedAt: null,
            calendarProviderId: null,
            calendarEventId: null,
            calendarSyncStatus: null,
            calendarLastSyncedAt: null,
            calendarLastSyncError: null
        });
        const projectTask = await taskProvider.createTask({
            id: 'temp-project',
            title: 'Project task',
            notes: '',
            completed: false,
            dueAt: null,
            priority: null,
            documentPath: null,
            agentKey: '/workspace/',
            createdAt: 0,
            updatedAt: 0,
            completedAt: null,
            calendarProviderId: null,
            calendarEventId: null,
            calendarSyncStatus: null,
            calendarLastSyncedAt: null,
            calendarLastSyncError: null
        });

        await expect(taskProvider.getTasks('/workspace/guide.md', '/workspace/', false)).resolves.toEqual([
            expect.objectContaining({ id: docTask.id, agentKey: '/workspace/', documentPath: '/workspace/guide.md' })
        ]);
        await expect(taskProvider.getTasks(null, '/workspace/', false)).resolves.toEqual(expect.arrayContaining([
            expect.objectContaining({ id: docTask.id, agentKey: '/workspace/', documentPath: '/workspace/guide.md' }),
            expect.objectContaining({ id: projectTask.id, agentKey: '/workspace/', documentPath: null })
        ]));

        const completedTask = await taskProvider.setTaskCompleted(docTask.id, true);
        expect(completedTask.completedAt).toBeGreaterThan(0);

        const storedTaskFile = await readFile(path.join(rootPath, '.chatprism', 'tasks.json'), 'utf8');
        expect(storedTaskFile).toContain(docTask.id);
        expect(storedTaskFile).toContain(projectTask.id);
    });

    it('does not include child-agent tasks when listing top-level agent tasks', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-node-agent-scope-'));
        tempRoots.push(rootPath);
        await mkdir(path.join(rootPath, 'workspace', 'child'), { recursive: true });
        await writeFile(path.join(rootPath, 'workspace', 'guide.md'), '# Guide\n');
        await writeFile(path.join(rootPath, 'workspace', 'child', 'note.md'), '# Child\n');

        const provider = new FileSystemContextProvider({ rootPath });
        const taskProvider = provider.getTaskProvider();

        await taskProvider.createTask({
            id: 'top-doc',
            title: 'Top document task',
            notes: '',
            completed: false,
            dueAt: null,
            priority: null,
            documentPath: '/workspace/guide.md',
            agentKey: '/workspace/',
            createdAt: 0,
            updatedAt: 0,
            completedAt: null,
            calendarProviderId: null,
            calendarEventId: null,
            calendarSyncStatus: null,
            calendarLastSyncedAt: null,
            calendarLastSyncError: null
        });
        await taskProvider.createTask({
            id: 'child-doc',
            title: 'Child document task',
            notes: '',
            completed: false,
            dueAt: null,
            priority: null,
            documentPath: '/workspace/child/note.md',
            agentKey: '/workspace/child/',
            createdAt: 0,
            updatedAt: 0,
            completedAt: null,
            calendarProviderId: null,
            calendarEventId: null,
            calendarSyncStatus: null,
            calendarLastSyncedAt: null,
            calendarLastSyncError: null
        });

        await expect(taskProvider.getTasks(null, '/workspace/', false)).resolves.toEqual([
            expect.objectContaining({ title: 'Top document task', agentKey: '/workspace/' })
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
});
