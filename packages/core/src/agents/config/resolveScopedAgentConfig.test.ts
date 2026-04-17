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
            effectiveInstructions: 'Help the user with the current workspace.\n\nAnswer with documentation context.',
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
        expect(resolved.instructions).toBe('Child rule');
        expect(resolved.effectiveInstructions).toBe('Help the user with the current workspace.\n\nParent rule\n\nChild rule');
        expect(resolved.modelProviderName).toBe('gemini-api');
        expect(resolved.modelName).toBe('Gemini Pro Latest');
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

    it('treats explicit merge inheritance the same as missing inheritance', async () => {
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
                    modelName: 'parent-model'
                }),
                '/project/docs/.agent.json': JSON.stringify({
                    name: 'Docs Agent',
                    instructions: 'Child rule',
                    inheritance: 'merge'
                }),
                '/project/docs/guide.md': '# Guide'
            }
        ));

        const resolved = await resolveScopedAgentConfig(provider, '/project/docs/guide.md', fallbackAgent);

        expect(resolved).toMatchObject({
            name: 'Docs Agent',
            modelName: 'parent-model',
            inheritance: 'merge',
            effectiveInstructions: 'Help the user with the current workspace.\n\nParent rule\n\nChild rule'
        });
    });

    it('uses only the override config when inheritance is override', async () => {
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
                    modelProviderName: 'gemini-api',
                    modelName: 'parent-model',
                    tools: [{ id: 'parent_tool' }],
                    skills: [{ id: 'parent_skill' }]
                }),
                '/project/docs/.agent.json': JSON.stringify({
                    name: 'Docs Agent',
                    instructions: 'Child rule',
                    inheritance: 'override'
                }),
                '/project/docs/guide.md': '# Guide'
            }
        ));

        const resolved = await resolveScopedAgentConfig(provider, '/project/docs/guide.md', fallbackAgent);

        expect(resolved).toMatchObject({
            name: 'Docs Agent',
            inheritance: 'override',
            instructions: 'Child rule',
            effectiveInstructions: 'Child rule'
        });
        expect(resolved.modelProviderName).toBeUndefined();
        expect(resolved.modelName).toBeUndefined();
        expect(resolved.tools).toBeUndefined();
        expect(resolved.skills).toBeUndefined();
    });

    it('allows deeper children to merge from an override ancestor without recovering truncated config', async () => {
        const provider = createMockContextProvider(createSnapshot(
            [
                { path: '/project', name: 'project', kind: 'directory' },
                { path: '/project/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/project' },
                { path: '/project/docs', name: 'docs', kind: 'directory', parentPath: '/project' },
                { path: '/project/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/project/docs' },
                { path: '/project/docs/reference', name: 'reference', kind: 'directory', parentPath: '/project/docs' },
                { path: '/project/docs/reference/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/project/docs/reference' },
                { path: '/project/docs/reference/guide.md', name: 'guide.md', kind: 'file', parentPath: '/project/docs/reference' }
            ],
            {
                '/project/.agent.json': JSON.stringify({
                    name: 'Workspace Agent',
                    instructions: 'Parent rule',
                    modelName: 'parent-model',
                    tools: [{ id: 'parent_tool' }]
                }),
                '/project/docs/.agent.json': JSON.stringify({
                    name: 'Docs Agent',
                    instructions: 'Override rule',
                    modelProviderName: 'gemini-api',
                    inheritance: 'override'
                }),
                '/project/docs/reference/.agent.json': JSON.stringify({
                    name: 'Reference Agent',
                    instructions: 'Reference rule',
                    tools: [{ id: 'reference_tool' }]
                }),
                '/project/docs/reference/guide.md': '# Guide'
            }
        ));

        const resolved = await resolveScopedAgentConfig(provider, '/project/docs/reference/guide.md', fallbackAgent);

        expect(resolved).toMatchObject({
            name: 'Reference Agent',
            modelProviderName: 'gemini-api',
            effectiveInstructions: 'Override rule\n\nReference rule'
        });
        expect(resolved.inheritance).toBeUndefined();
        expect(resolved.modelName).toBeUndefined();
        expect(resolved.tools).toEqual([{ id: 'reference_tool' }]);
    });

    it('inherits missing array configs from fallback automatically', async () => {
        const provider = createMockContextProvider(createSnapshot(
            [
                { path: '/project', name: 'project', kind: 'directory' },
                { path: '/project/sub', name: 'sub', kind: 'directory', parentPath: '/project' },
                { path: '/project/sub/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/project/sub' },
                { path: '/project/sub/guide.md', name: 'guide.md', kind: 'file', parentPath: '/project/sub' }
            ],
            {
                '/project/sub/.agent.json': JSON.stringify({
                    name: 'Sub Agent',
                    modelName: 'gemini-2.5-pro'
                }),
                '/project/sub/guide.md': '# Guide'
            }
        ));

        const resolved = await resolveScopedAgentConfig(provider, '/project/sub/guide.md', fallbackAgent);

        expect(resolved.name).toBe('Sub Agent');
        expect(resolved.modelName).toBe('gemini-2.5-pro');
        // fallbacks naturally applied
        expect(resolved.modelProviderName).toBe('gemini-api');
        expect(resolved.effectiveInstructions).toBe('Help the user with the current workspace.');
        expect(resolved.tools).toEqual([{ id: 'read_document' }]);
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
            scopePath: '/notes',
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

    it('throws a diagnostic error for invalid inheritance values', async () => {
        const provider = createMockContextProvider(createSnapshot(
            [
                { path: '/broken', name: 'broken', kind: 'directory' },
                { path: '/broken/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/broken' },
                { path: '/broken/note.md', name: 'note.md', kind: 'file', parentPath: '/broken' }
            ],
            {
                '/broken/.agent.json': JSON.stringify({
                    name: 'Broken Agent',
                    inheritance: 'nearest'
                }),
                '/broken/note.md': '# Broken'
            }
        ));

        await expect(resolveScopedAgentConfig(provider, '/broken/note.md', fallbackAgent)).rejects.toThrow(
            'Invalid agent config in /broken/.agent.json: "inheritance" must be "merge" or "override".'
        );
    });

    it('treats EISDIR read failures as directory scopes', async () => {
        const provider: IContextProvider = {
            id: 'eisdir-provider',
            async initializeAccess() {
                return undefined;
            },
            async getContext() {
                return {
                    nodes: [],
                    agentConfigs: {}
                };
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
            async deleteNode() {
                throw new Error('Not implemented');
            },
            async renameNode() {
                throw new Error('Not implemented');
            },
            async searchInScope() {
                return [];
            }
        };

        const resolved = await resolveScopedAgentConfig(provider, '/workspace/archive', fallbackAgent);

        expect(resolved).toMatchObject({
            name: 'Archive Agent',
            scopePath: '/workspace/archive',
            sourcePaths: ['/workspace/archive/.agent.json'],
            effectiveInstructions: 'Help the user with the current workspace.\n\nOnly use archive files.'
        });
    });
});
