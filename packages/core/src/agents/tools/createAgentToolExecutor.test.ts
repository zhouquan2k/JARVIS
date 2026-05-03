import { describe, expect, it, vi } from 'vitest';
import { createBuiltinWorkspaceToolDefinitions } from './builtinWorkspaceTools';
import { createAgentToolExecutor } from './createAgentToolExecutor';
import { createMockContextProvider } from '../../testing/createMockContextProvider';
import { decodeTextDocument } from '../../utils/documentData';

const agent = {
    name: 'Docs Agent',
    effectiveInstructions: 'Use docs scope only.',
    modelProviderName: 'gemini-api',
    modelName: 'gemini-2.5-pro',
    scopePath: '/docs',
    sourcePaths: ['/docs/.agent.json'],
    tools: [
        { id: 'read_file', description: 'Read docs' },
        { id: 'replace_text_in_file', description: 'Edit docs' }
    ]
};

describe('createAgentToolExecutor', () => {
    it('resolves runtime tool declarations from declared bindings only', () => {
        const executor = createAgentToolExecutor(createBuiltinWorkspaceToolDefinitions());

        expect(executor.getDeclarations(agent.tools)).toEqual([
            {
                id: 'read_file',
                description: 'Read docs',
                inputSchema: {
                    type: 'OBJECT',
                    properties: {
                        path: { type: 'STRING', description: 'Absolute file path inside the workspace scope.' }
                    },
                    required: ['path']
                }
            },
            {
                id: 'replace_text_in_file',
                description: 'Edit docs',
                inputSchema: expect.objectContaining({
                    type: 'OBJECT',
                    required: ['target', 'replacement']
                })
            }
        ]);
    });

    it('executes workspace read tools against the scoped context provider', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({ name: 'Docs Agent' }),
                '/docs/guide.md': '# Guide'
            }
        });
        const executor = createAgentToolExecutor(createBuiltinWorkspaceToolDefinitions());

        const result = await executor.execute(
            {
                id: 'call-1',
                name: 'read_file',
                arguments: { path: '/docs/guide.md' }
            },
            {
                agent,
                activePath: '/docs/guide.md',
                contextProvider: provider
            }
        );

        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.result)).toEqual({
            path: '/docs/guide.md',
            mimeType: 'text/markdown',
            content: '# Guide'
        });
    });

    it('records before/after content for edit tools and rejects missing matches', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({ name: 'Docs Agent' }),
                '/docs/guide.md': '# Guide'
            }
        });
        const onFileChanged = vi.fn();
        const executor = createAgentToolExecutor(createBuiltinWorkspaceToolDefinitions());

        const success = await executor.execute(
            {
                id: 'call-1',
                name: 'replace_text_in_file',
                arguments: JSON.stringify({
                    path: '/docs/guide.md',
                    target: '# Guide',
                    replacement: '# Updated Guide'
                })
            },
            {
                agent,
                activePath: '/docs/guide.md',
                contextProvider: provider,
                onFileChanged
            }
        );

        expect(JSON.parse(success.result)).toEqual({
            ok: true,
            path: '/docs/guide.md',
            replacedCount: 1,
            content: '# Updated Guide'
        });
        expect(onFileChanged).toHaveBeenCalledWith({
            path: '/docs/guide.md',
            beforeContent: '# Guide',
            afterContent: '# Updated Guide',
            alreadyPersisted: true
        });
        const updatedDocument = await provider.readDocument('/docs/guide.md');
        expect(updatedDocument.mimeType).toBe('text/markdown');
        expect(decodeTextDocument(updatedDocument.dataBase64)).toBe('# Updated Guide');

        const failure = await executor.execute(
            {
                id: 'call-2',
                name: 'replace_text_in_file',
                arguments: {
                    path: '/docs/guide.md',
                    target: 'missing',
                    replacement: 'noop'
                }
            },
            {
                agent,
                activePath: '/docs/guide.md',
                contextProvider: provider
            }
        );

        expect(failure.isError).toBe(true);
        expect(JSON.parse(failure.result)).toEqual({
            ok: false,
            error: "Failed to find the target text in '/docs/guide.md'."
        });
    });
});
