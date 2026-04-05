import { describe, expect, it } from 'vitest';
import type { AgentConfig, StoredWorkspaceSnapshot } from '../../index';
import { createMockContextProvider, resolveScopedAgentConfig } from '../../index';
import type { IContextProvider } from '../../interfaces/IContextProvider';

function createSnapshot(
    nodes: StoredWorkspaceSnapshot['nodes'],
    documents: StoredWorkspaceSnapshot['documents']
): StoredWorkspaceSnapshot {
    return {
        nodes,
        documents
    };
}

const fallbackAgent: AgentConfig = {
    name: 'Default Knowledge Agent',
    description: 'Fallback knowledge assistant',
    instructions: 'Help the user with the current workspace.',
    modelProviderName: 'gemini-api',
    modelName: 'Gemini Pro Latest',
    tools: [{ id: 'read_document' }]
};

describe('resolveScopedAgentConfig', () => {
    it('resolves the nearest scoped agent for an active file', async () => {
        const provider = createMockContextProvider(createSnapshot(
            [
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/docs', name: 'docs', kind: 'directory', parentPath: '/workspace' },
                { path: '/workspace/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/workspace/docs' },
                { path: '/workspace/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/workspace/docs' }
            ],
            {
                '/workspace/docs/guide.md': '# Guide',
                '/workspace/docs/.agent.json': JSON.stringify({
                    name: 'Docs Agent',
                    description: 'Focus on docs',
                    instructions: 'Answer with documentation context.',
                    modelProviderName: 'gemini-api',
                    modelName: 'gemini-2.5-pro'
                })
            }
        ));

        const resolved = await resolveScopedAgentConfig(provider, '/workspace/docs/guide.md', fallbackAgent);

        expect(resolved).toMatchObject({
            name: 'Docs Agent',
            description: 'Focus on docs',
            scopePath: '/workspace/docs',
            sourcePaths: ['/workspace/docs/.agent.json'],
            effectiveInstructions: 'Answer with documentation context.',
            modelProviderName: 'gemini-api',
            modelName: 'gemini-2.5-pro'
        });
    });

    it('merges parent and child agents using stable binding ids', async () => {
        const provider = createMockContextProvider(createSnapshot(
            [
                { path: '/project', name: 'project', kind: 'directory' },
                { path: '/project/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/project' },
                { path: '/project/docs', name: 'docs', kind: 'directory', parentPath: '/project' },
                { path: '/project/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/project/docs' },
                { path: '/project/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/project/docs' }
            ],
            {
                '/project/.agent.json': JSON.stringify({
                    name: 'Workspace Agent',
                    description: 'Parent description',
                    instructions: 'Parent rule',
                    tools: [
                        { id: 'read_document', description: 'Read docs' },
                        { id: 'search_workspace', description: 'Search files' }
                    ],
                    skills: [
                        { id: 'summarize', description: 'Summarize long docs' }
                    ]
                }),
                '/project/docs/.agent.json': JSON.stringify({
                    name: 'Docs Agent',
                    instructions: 'Child rule',
                    inheritance: 'merge',
                    tools: [
                        { id: 'search_workspace', description: 'Search doc subtree' },
                        { id: 'cite_sources', description: 'Cite the source files' }
                    ],
                    skills: [
                        { id: 'outline', description: 'Draft outlines' }
                    ]
                }),
                '/project/docs/guide.md': '# Guide'
            }
        ));

        const resolved = await resolveScopedAgentConfig(provider, '/project/docs/guide.md', fallbackAgent);

        expect(resolved.name).toBe('Docs Agent');
        expect(resolved.description).toBe('Parent description');
        expect(resolved.effectiveInstructions).toBe('Parent rule\n\nChild rule');
        expect(resolved.sourcePaths).toEqual([
            '/project/.agent.json',
            '/project/docs/.agent.json'
        ]);
        expect(resolved.tools).toEqual([
            { id: 'read_document', description: 'Read docs' },
            { id: 'search_workspace', description: 'Search doc subtree' },
            { id: 'cite_sources', description: 'Cite the source files' }
        ]);
        expect(resolved.skills).toEqual([
            { id: 'summarize', description: 'Summarize long docs' },
            { id: 'outline', description: 'Draft outlines' }
        ]);
    });

    it('stops on override configs and ignores higher parents', async () => {
        const provider = createMockContextProvider(createSnapshot(
            [
                { path: '/project', name: 'project', kind: 'directory' },
                { path: '/project/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/project' },
                { path: '/project/docs', name: 'docs', kind: 'directory', parentPath: '/project' },
                { path: '/project/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/project/docs' },
                { path: '/project/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/project/docs' }
            ],
            {
                '/project/.agent.json': JSON.stringify({
                    name: 'Workspace Agent',
                    instructions: 'Parent rule',
                    tools: [{ id: 'read_document' }]
                }),
                '/project/docs/.agent.json': JSON.stringify({
                    name: 'Docs Override Agent',
                    inheritance: 'override',
                    instructions: 'Only use docs context.',
                    tools: [{ id: 'cite_sources' }]
                }),
                '/project/docs/guide.md': '# Guide'
            }
        ));

        const resolved = await resolveScopedAgentConfig(provider, '/project/docs/guide.md', fallbackAgent);

        expect(resolved.name).toBe('Docs Override Agent');
        expect(resolved.sourcePaths).toEqual(['/project/docs/.agent.json']);
        expect(resolved.effectiveInstructions).toBe('Only use docs context.');
        expect(resolved.tools).toEqual([{ id: 'cite_sources' }]);
    });

    it('falls back to the default agent when no scoped config exists', async () => {
        const provider = createMockContextProvider(createSnapshot(
            [
                { path: '/notes', name: 'notes', kind: 'directory' },
                { path: '/notes/today.md', name: 'today.md', kind: 'file', parentPath: '/notes' }
            ],
            {
                '/notes/today.md': '# Today'
            }
        ));

        const resolved = await resolveScopedAgentConfig(provider, '/notes/today.md', fallbackAgent);

        expect(resolved).toMatchObject({
            name: 'Default Knowledge Agent',
            scopePath: '/',
            sourcePaths: [],
            effectiveInstructions: 'Help the user with the current workspace.'
        });
        expect(resolved.tools).toEqual([{ id: 'read_document' }]);
    });

    it('throws a diagnostic error for invalid scoped config content', async () => {
        const provider = createMockContextProvider(createSnapshot(
            [
                { path: '/broken', name: 'broken', kind: 'directory' },
                { path: '/broken/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/broken' },
                { path: '/broken/note.md', name: 'note.md', kind: 'file', parentPath: '/broken' }
            ],
            {
                '/broken/.agent.json': '{ invalid json }',
                '/broken/note.md': '# Broken'
            }
        ));

        await expect(resolveScopedAgentConfig(provider, '/broken/note.md', fallbackAgent)).rejects.toThrow(
            'Failed to parse /broken/.agent.json'
        );
    });

    it('treats EISDIR read failures as directory scopes', async () => {
        const provider: IContextProvider = {
            id: 'eisdir-provider',
            async initializeAccess() {
                return undefined;
            },
            async listTree() {
                return [];
            },
            async readDocument(path) {
                if (path === '/workspace/archive') {
                    throw new Error('EISDIR: illegal operation on a directory, read');
                }

                if (path === '/workspace/archive/.agent.json') {
                    return {
                        path,
                        mimeType: 'application/json',
                        dataBase64: Buffer.from(JSON.stringify({
                            name: 'Archive Agent',
                            instructions: 'Only use archive files.'
                        }), 'utf8').toString('base64')
                    };
                }

                throw new Error(`节点不存在: ${path}`);
            },
            async writeDocument() {
                return undefined;
            },
            async createNode() {
                throw new Error('Not implemented');
            },
            async searchInScope() {
                return [];
            },
            async resolveScopedAgentConfig(targetPath: string) {
                return resolveScopedAgentConfig(this, targetPath, fallbackAgent);
            }
        };

        const resolved = await resolveScopedAgentConfig(provider, '/workspace/archive', fallbackAgent);

        expect(resolved).toMatchObject({
            name: 'Archive Agent',
            scopePath: '/workspace/archive',
            sourcePaths: ['/workspace/archive/.agent.json'],
            effectiveInstructions: 'Only use archive files.'
        });
    });
});
