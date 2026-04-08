import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
});
