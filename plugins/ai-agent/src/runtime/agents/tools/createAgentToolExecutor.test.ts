import { describe, expect, it, vi } from 'vitest';
import { createBuiltinWorkspaceToolDefinitions } from './builtinWorkspaceTools';
import { createAgentToolExecutor } from './createAgentToolExecutor';
import { decodeTextDocument } from '@plugins/ai-agent/src/internal';
import { createMockContextProvider } from '@plugins/ai-agent/src/testing';

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

    it('returns binary files (pdf/image) as attachments instead of failing the text check', async () => {
        const pdfBase64 = Buffer.from('%PDF-1.4 fake pdf bytes').toString('base64');
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                { path: '/docs/lease.pdf', name: 'lease.pdf', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({ name: 'Docs Agent' }),
                '/docs/lease.pdf': { path: '/docs/lease.pdf', mimeType: 'application/pdf', dataBase64: pdfBase64 }
            }
        });
        const executor = createAgentToolExecutor(createBuiltinWorkspaceToolDefinitions());

        const result = await executor.execute(
            {
                id: 'call-1',
                name: 'read_file',
                arguments: { path: '/docs/lease.pdf' }
            },
            {
                agent,
                activePath: '/docs/lease.pdf',
                contextProvider: provider
            }
        );

        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.result)).toEqual(
            expect.objectContaining({ path: '/docs/lease.pdf', mimeType: 'application/pdf' })
        );
        expect(result.attachments).toEqual([
            expect.objectContaining({
                type: 'file',
                name: 'lease.pdf',
                mimeType: 'application/pdf',
                base64Data: pdfBase64
            })
        ]);
    });

    it('lists the current agent root with "." while keeping "/" as the workspace root', async () => {
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

        const scopedResult = await executor.execute(
            {
                id: 'call-1',
                name: 'list_directory',
                arguments: { path: '.' }
            },
            {
                agent,
                activePath: '/docs/guide.md',
                contextProvider: provider
            }
        );

        expect(scopedResult.isError).toBeUndefined();
        expect(JSON.parse(scopedResult.result)).toEqual({
            path: '/docs',
            entries: [
                expect.objectContaining({ path: '/docs/.agent.json', kind: 'file' }),
                expect.objectContaining({ path: '/docs/guide.md', kind: 'file' })
            ]
        });

        const rootResult = await executor.execute(
            {
                id: 'call-2',
                name: 'list_directory',
                arguments: { path: '/' }
            },
            {
                agent,
                activePath: '/docs/guide.md',
                contextProvider: provider
            }
        );

        expect(rootResult.isError).toBe(true);
        expect(JSON.parse(rootResult.result)).toEqual({
            ok: false,
            error: "Path '/' is outside the current agent scope '/docs'."
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
