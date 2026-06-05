import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { decodeTextDocument, HttpApiError } from '@packages/core/src';
import { DEFAULT_SCOPED_AGENT_CONFIG } from '@plugins/ai-agent/api';
import { createMockContextProvider } from '@plugins/ai-agent/src/testing';
import { useDocumentWorkspaceStore } from './documentWorkspace';

describe('useDocumentWorkspaceStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('hydrates the tree without opening a file and resolves the root agent context', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/notes', name: 'notes', kind: 'directory' },
                { path: '/notes/day-1.md', name: 'day-1.md', kind: 'file', parentPath: '/notes' }
            ],
            documents: {
                '/notes/day-1.md': '# Day 1'
            }
        }));

        await store.hydrateWorkspace();

        expect(store.nodes).toHaveLength(2);
        expect(store.activePath).toBeNull();
        expect(store.selectedNodePath).toBe('/');
        expect(store.draftContent).toBe('');
        expect(store.expandedPaths).toEqual(['/']);
        expect(store.activeAgent?.name).toBe('Default Knowledge Agent');
        expect(store.activeAgent?.scopePath).toBe('/');
    });

    it('formats normalized context hydration failures into currentError', async () => {
        const provider = createMockContextProvider();
        provider.initializeAccess = vi.fn().mockRejectedValue(new HttpApiError({
            message: 'Workspace access denied.',
            status: 403,
            code: 'CONTEXT_INITIALIZE_FAILED',
            source: 'context'
        }));
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();

        expect(store.currentError).toBe('Workspace access denied.');
        expect(store.isHydrating).toBe(false);
    });

    it('collects markdown documents while preserving nested directory structure', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/guide.md', name: 'guide.md', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/archive', name: 'archive', kind: 'directory', parentPath: '/workspace' },
                { path: '/workspace/archive/history.md', name: 'history.md', kind: 'file', parentPath: '/workspace/archive' },
                { path: '/workspace/archive/raw.txt', name: 'raw.txt', kind: 'file', parentPath: '/workspace/archive' }
            ],
            documents: {
                '/workspace/guide.md': '# Guide',
                '/workspace/archive/history.md': '# History',
                '/workspace/archive/raw.txt': 'plain text'
            }
        }));

        await store.hydrateWorkspace();

        const documents = store.collectMarkdownDocuments('/workspace');
        expect(documents).toHaveLength(2);
        expect(documents.map((node) => node.path)).toEqual(
            expect.arrayContaining(['/workspace/guide.md', '/workspace/archive'])
        );

        const archiveNode = documents.find((node) => node.path === '/workspace/archive');
        expect(archiveNode?.children?.map((node) => node.path)).toEqual(['/workspace/archive/history.md']);
    });

    it('flushes the previous file before switching documents', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/alpha.md', name: 'alpha.md', kind: 'file' },
                { path: '/beta.md', name: 'beta.md', kind: 'file' }
            ],
            documents: {
                '/alpha.md': 'alpha',
                '/beta.md': 'beta'
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.openNode('/alpha.md');
        store.updateActiveDocument('alpha updated');
        await store.openNode('/beta.md');

        const alpha = await provider.readDocument('/alpha.md');
        expect(decodeTextDocument(alpha.dataBase64)).toBe('alpha updated');
        expect(store.activePath).toBe('/beta.md');
        expect(store.draftContent).toBe('beta');
    });

    it('creates files and opens them immediately', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider());

        await store.hydrateWorkspace();
        await store.createNode({
            name: 'new-note',
            kind: 'file'
        });

        expect(store.nodes.some((node) => node.path === '/new-note.md')).toBe(true);
        expect(store.activePath).toBe('/new-note.md');
    });

    it('returns stable linkable markdown documents inside the current agent scope and excludes the active document', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                { path: '/docs/archive', name: 'archive', kind: 'directory', parentPath: '/docs' },
                { path: '/docs/archive/history.md', name: 'history.md', kind: 'file', parentPath: '/docs/archive' },
                { path: '/outside.md', name: 'outside.md', kind: 'file' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({ name: 'Docs Agent', instructions: 'Handle docs.' }),
                '/docs/guide.md': '# Guide',
                '/docs/archive/history.md': '# History',
                '/outside.md': '# Outside'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/docs');

        expect(store.getLinkableMarkdownDocuments('/docs/guide.md').map((node) => node.path)).toEqual([
            '/docs/archive/history.md'
        ]);
    });

    it('persists pasted markdown images into a document-local references directory and returns a relative markdown reference', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/guide.md': '# Guide'
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        const result = await store.persistPastedMarkdownImage({
            documentPath: '/docs/guide.md',
            mimeType: 'image/png',
            bytes: new Uint8Array([1, 2, 3, 4])
        });

        expect(result.imagePath).toMatch(/^\/docs\/references\/Pasted image \d{14}\.png$/);
        expect(result.markdown).toMatch(/^!\[\]\(references\/Pasted%20image%20\d{14}\.png\)$/);
        expect(store.nodes.some((node) => node.path === '/docs/references' && node.kind === 'directory')).toBe(true);
        expect(store.nodes.some((node) => node.path === result.imagePath && node.kind === 'file')).toBe(true);

        const persisted = await provider.readDocument(result.imagePath);
        expect(Buffer.from(persisted.dataBase64, 'base64')).toEqual(Buffer.from([1, 2, 3, 4]));
    });

    it('de-duplicates pasted markdown image file names when references already contains a collision', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-08T12:34:56Z'));

        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                { path: '/docs/references', name: 'references', kind: 'directory', parentPath: '/docs' },
                { path: '/docs/references/Pasted image 20260508083456.png', name: 'Pasted image 20260508083456.png', kind: 'file', parentPath: '/docs/references' }
            ],
            documents: {
                '/docs/guide.md': '# Guide',
                '/docs/references/Pasted image 20260508083456.png': {
                    mimeType: 'image/png',
                    dataBase64: 'AQID'
                }
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        const result = await store.persistPastedMarkdownImage({
            documentPath: '/docs/guide.md',
            mimeType: 'image/png',
            bytes: new Uint8Array([5, 6, 7])
        });

        expect(result.imagePath).toBe('/docs/references/Pasted image 20260508083456 2.png');
        expect(result.markdown).toBe('![](references/Pasted%20image%2020260508083456%202.png)');
    });

    it('returns linkable reference resources from the active document references directory', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                { path: '/docs/references', name: 'references', kind: 'directory', parentPath: '/docs' },
                { path: '/docs/references/spec.pdf', name: 'spec.pdf', kind: 'file', parentPath: '/docs/references' },
                { path: '/docs/references/diagram.png', name: 'diagram.png', kind: 'file', parentPath: '/docs/references' },
                { path: '/other/references/ignore.pdf', name: 'ignore.pdf', kind: 'file', parentPath: '/other/references' }
            ],
            documents: {
                '/docs/guide.md': '# Guide'
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();

        expect(store.getLinkableReferenceResources('/docs/guide.md').map((node) => node.path)).toEqual([
            '/docs/references/diagram.png',
            '/docs/references/spec.pdf'
        ]);
    });

    it('creates directories and selects them after refreshing the tree', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider());

        await store.hydrateWorkspace();
        await store.createNode({
            name: 'docs',
            kind: 'directory'
        });

        expect(store.nodes.some((node) => node.path === '/docs' && node.kind === 'directory')).toBe(true);
        expect(store.selectedNodePath).toBe('/docs');
        expect(store.activePath).toBeNull();
        expect(store.expandedPaths).toContain('/docs');
    });

    it('converts a plain directory into an agent owner by creating .agent.json', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' }
            ],
            documents: {}
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.convertDirectoryToAgent('/docs');

        const config = await provider.readDocument('/docs/.agent.json');
        expect(JSON.parse(decodeTextDocument(config.dataBase64))).toMatchObject({
            ...DEFAULT_SCOPED_AGENT_CONFIG,
            name: 'docs Agent'
        });
        expect(store.selectedNodePath).toBe('/docs');
        expect(store.activePath).toBeNull();
        expect(store.isAgentOwnerSelected).toBe(true);
        expect(store.activeAgent?.name).toBe('docs Agent');
    });

    it('reuses a leftover .agent.json.tmp when retrying directory conversion', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json.tmp', name: '.agent.json.tmp', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json.tmp': ''
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.convertDirectoryToAgent('/docs');

        const config = await provider.readDocument('/docs/.agent.json');
        expect(JSON.parse(decodeTextDocument(config.dataBase64))).toMatchObject({
            ...DEFAULT_SCOPED_AGENT_CONFIG,
            name: 'docs Agent'
        });
        await expect(provider.readDocument('/docs/.agent.json.tmp')).rejects.toThrow();
        expect(store.isAgentOwnerSelected).toBe(true);
        expect(store.activeAgent?.name).toBe('docs Agent');
    });

    it('treats an existing .agent.json as an already converted directory', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory', isAgentOwner: true, agentKey: '/docs/' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({
                    ...DEFAULT_SCOPED_AGENT_CONFIG,
                    name: 'Existing Docs Agent'
                })
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.convertDirectoryToAgent('/docs');

        const config = await provider.readDocument('/docs/.agent.json');
        expect(JSON.parse(decodeTextDocument(config.dataBase64))).toMatchObject({
            name: 'Existing Docs Agent'
        });
        expect(store.currentError).toBeNull();
    });

    it('restores a selected agent directory while opening its active document', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory', isAgentOwner: true, agentKey: '/docs/' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({
                    name: 'Docs Agent',
                    instructions: 'Handle docs.'
                }),
                '/docs/guide.md': '# Guide'
            }
        }));

        await store.hydrateWorkspace();
        await store.restoreSelection({
            selectedNodePath: '/docs',
            activePath: '/docs/guide.md'
        });

        expect(store.selectedNodePath).toBe('/docs');
        expect(store.activePath).toBe('/docs/guide.md');
        expect(store.activeDocument?.path).toBe('/docs/guide.md');
        expect(store.isAgentOwnerSelected).toBe(true);
        expect(store.activeAgentKey).not.toBeNull();
    });

    it('loads an existing agent owner index document while preserving the owner scope', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                { path: '/docs/index.md', name: 'index.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({ name: 'Docs Agent', instructions: 'Handle docs.' }),
                '/docs/index.md': '# Docs index'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/docs');

        expect(store.selectedNodePath).toBe('/docs');
        expect(store.activePath).toBeNull();
        expect(store.agentIndexPath).toBe('/docs/index.md');
        expect(store.agentIndexDocument?.path).toBe('/docs/index.md');
        expect(store.agentIndexViewerId).toBe('text');
        expect(store.agentIndexDraftContent).toBe('# Docs index');
        expect(store.isAgentOwnerSelected).toBe(true);
    });

    it('keeps agent view active when an agent owner index document is absent', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({ name: 'Docs Agent', instructions: 'Handle docs.' })
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/docs');

        expect(store.selectedNodePath).toBe('/docs');
        expect(store.activePath).toBeNull();
        expect(store.isAgentOwnerSelected).toBe(true);
    });

    it('loads index.md for a normal directory while preserving the selected folder scope', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/index.md', name: 'index.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/index.md': '# Docs index'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/docs');

        expect(store.selectedNodePath).toBe('/docs');
        expect(store.activePath).toBeNull();
        expect(store.agentIndexPath).toBe('/docs/index.md');
        expect(store.agentIndexDocument?.path).toBe('/docs/index.md');
        expect(store.agentIndexDraftContent).toBe('# Docs index');
        expect(store.isAgentOwnerSelected).toBe(false);
    });

    it('keeps a normal directory empty when index.md is absent', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' }
            ],
            documents: {}
        }));

        await store.hydrateWorkspace();
        await store.openNode('/docs');

        expect(store.selectedNodePath).toBe('/docs');
        expect(store.activePath).toBeNull();
        expect(store.agentIndexPath).toBeNull();
        expect(store.agentIndexDocument).toBeNull();
        expect(store.isAgentOwnerSelected).toBe(false);
    });

    it('loads the root index document when the root agent owner has one', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/.agent.json', name: '.agent.json', kind: 'file' },
                { path: '/index.md', name: 'index.md', kind: 'file' }
            ],
            documents: {
                '/.agent.json': JSON.stringify({ name: 'Root Agent', instructions: 'Handle root.' }),
                '/index.md': '# Root index'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/');

        expect(store.selectedNodePath).toBe('/');
        expect(store.activePath).toBeNull();
        expect(store.agentIndexPath).toBe('/index.md');
        expect(store.agentIndexDocument?.path).toBe('/index.md');
        expect(store.agentIndexViewerId).toBe('text');
        expect(store.agentIndexDraftContent).toBe('# Root index');
        expect(store.isAgentOwnerSelected).toBe(true);
    });

    it('edits and saves the agent owner index document through dedicated state', async () => {
        const store = useDocumentWorkspaceStore();
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                { path: '/docs/index.md', name: 'index.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({ name: 'Docs Agent', instructions: 'Handle docs.' }),
                '/docs/index.md': '# Docs index'
            }
        });
        store.setContextProvider(contextProvider);

        await store.hydrateWorkspace();
        await store.openNode('/docs');
        store.updateAgentIndexDocument('# Updated Docs index');

        expect(store.dirtyPaths['/docs/index.md']).toBe(true);
        expect(store.agentIndexDraftContent).toBe('# Updated Docs index');

        await store.flushAgentIndexDocument();

        const saved = await contextProvider.readDocument('/docs/index.md');
        expect(Buffer.from(saved.dataBase64, 'base64').toString('utf8')).toBe('# Updated Docs index');
        expect(store.dirtyPaths['/docs/index.md']).toBe(false);
        expect(Buffer.from(store.agentIndexDocument?.dataBase64 ?? '', 'base64').toString('utf8')).toBe('# Updated Docs index');
    });

    it('resolves text/plain with the shared text viewer', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/notes.txt', name: 'notes.txt', kind: 'file' }
            ],
            documents: {
                '/notes.txt': 'plain text body'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/notes.txt');

        expect(store.activeViewerId).toBe('text');
        expect(store.activeViewerCapabilities).toEqual({ view: true, edit: true });
        expect(store.activePaneMode).toBe('viewer');
        expect(store.draftContent).toBe('plain text body');
    });

    it('opens pdf documents in the read-only pdf viewer', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/guide.pdf', name: 'guide.pdf', kind: 'file' }
            ],
            documents: {
                '/guide.pdf': {
                    mimeType: 'application/pdf',
                    dataBase64: 'JVBERg==',
                    canWrite: false
                }
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/guide.pdf');

        expect(store.activeViewerId).toBe('pdf');
        expect(store.activeViewerCapabilities).toEqual({ view: true, edit: false });
        expect(store.activePaneMode).toBe('viewer');
        expect(store.draftContent).toBe('');
        expect(store.activeDocument?.canWrite).toBe(false);
    });

    it('opens image documents in the read-only image viewer', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/diagram.png', name: 'diagram.png', kind: 'file' }
            ],
            documents: {
                '/diagram.png': {
                    mimeType: 'image/png',
                    dataBase64: 'iVBORw0KGgo=',
                    canWrite: false
                }
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/diagram.png');

        expect(store.activeViewerId).toBe('image');
        expect(store.activeViewerCapabilities).toEqual({ view: true, edit: false });
        expect(store.activePaneMode).toBe('viewer');
        expect(store.draftContent).toBe('');
        expect(store.activeDocument?.canWrite).toBe(false);
    });

    it('falls back to unsupported mode when no viewer matches the mime type', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/archive.bin', name: 'archive.bin', kind: 'file' }
            ],
            documents: {
                '/archive.bin': {
                    mimeType: 'application/octet-stream',
                    dataBase64: 'AQID',
                    canWrite: false
                }
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/archive.bin');

        expect(store.activeViewerId).toBeNull();
        expect(store.activeViewerCapabilities).toBeNull();
        expect(store.activePaneMode).toBe('unsupported');
    });



    it('refreshes the active agent when switching across scoped files', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/guide.md', name: 'guide.md', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/archive', name: 'archive', kind: 'directory', parentPath: '/workspace' },
                { path: '/workspace/archive/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/workspace/archive' },
                { path: '/workspace/archive/snippet.md', name: 'snippet.md', kind: 'file', parentPath: '/workspace/archive' }
            ],
            documents: {
                '/workspace/.agent.json': JSON.stringify({
                    name: 'Workspace Agent',
                    instructions: 'Handle general notes.'
                }),
                '/workspace/guide.md': '# Guide',
                '/workspace/archive/.agent.json': JSON.stringify({
                    name: 'Archive Agent',
                    instructions: 'Handle archived notes.'
                }),
                '/workspace/archive/snippet.md': '# Snippet'
            }
        }));

        await store.hydrateWorkspace();
        expect(store.activeAgent?.name).toBe('Default Knowledge Agent');
        expect(store.activeAgent?.scopePath).toBe('/');

        await store.openNode('/workspace/archive');
        expect(store.selectedNodePath).toBe('/workspace/archive');
        expect(store.activePath).toBeNull();
        expect(store.activeDocument).toBeNull();
        expect(store.draftContent).toBe('');
        expect(store.activeAgent?.name).toBe('Archive Agent');
        expect(store.activeAgent?.scopePath).toBe('/workspace/archive');

        await store.openNode('/workspace/archive/snippet.md');
        expect(store.activeAgent?.name).toBe('Archive Agent');
        expect(store.activeAgent?.scopePath).toBe('/workspace/archive');
        expect(store.agentResolutionError).toBeNull();
    });

    it('refreshes the tree while preserving the selected path when it still exists', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/guide.md', name: 'guide.md', kind: 'file', parentPath: '/workspace' }
            ],
            documents: {
                '/workspace/guide.md': '# Guide'
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.openNode('/workspace/guide.md');
        await provider.createNode({
            parentPath: '/workspace',
            name: 'notes.md',
            kind: 'file'
        });

        await store.refreshTree();

        expect(store.selectedNodePath).toBe('/workspace/guide.md');
        expect(store.activePath).toBe('/workspace/guide.md');
        expect(store.nodes.some((node) => node.path === '/workspace/notes.md')).toBe(true);
    });

    it('deletes the active file and falls back to the parent directory', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/guide.md', name: 'guide.md', kind: 'file', parentPath: '/workspace' }
            ],
            documents: {
                '/workspace/guide.md': '# Guide'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/workspace/guide.md');
        await store.deleteNode('/workspace/guide.md');

        expect(store.nodes.some((node) => node.path === '/workspace/guide.md')).toBe(false);
        expect(store.selectedNodePath).toBe('/workspace');
        expect(store.activePath).toBeNull();
        expect(store.activeDocument).toBeNull();
    });

    it('renames the active file and keeps it open on the new path', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/guide.md', name: 'guide.md', kind: 'file', parentPath: '/workspace' }
            ],
            documents: {
                '/workspace/guide.md': '# Guide'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/workspace/guide.md');
        await store.renameNode({ path: '/workspace/guide.md', name: 'guide-renamed' });

        expect(store.nodes.some((node) => node.path === '/workspace/guide-renamed.md')).toBe(true);
        expect(store.activePath).toBe('/workspace/guide-renamed.md');
        expect(store.selectedNodePath).toBe('/workspace/guide-renamed.md');
        expect(store.activeDocument?.path).toBe('/workspace/guide-renamed.md');
    });

    it('moves the active file and keeps it open on the new path', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/archive', name: 'archive', kind: 'directory', parentPath: '/workspace' },
                { path: '/workspace/guide.md', name: 'guide.md', kind: 'file', parentPath: '/workspace' }
            ],
            documents: {
                '/workspace/guide.md': '# Guide'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/workspace/guide.md');
        await store.moveNode({ path: '/workspace/guide.md', targetParentPath: '/workspace/archive' });

        expect(store.nodes.some((node) => node.path === '/workspace/archive/guide.md')).toBe(true);
        expect(store.activePath).toBe('/workspace/archive/guide.md');
        expect(store.selectedNodePath).toBe('/workspace/archive/guide.md');
        expect(store.activeDocument?.path).toBe('/workspace/archive/guide.md');
    });

    it('clears the current file context when selecting a directory', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/current.md', name: 'current.md', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/archive', name: 'archive', kind: 'directory', parentPath: '/workspace' }
            ],
            documents: {
                '/workspace/current.md': '# Current file'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/workspace/current.md');
        store.updateActiveDocument('# Edited current file');

        await store.openNode('/workspace/archive');

        expect(store.selectedNodePath).toBe('/workspace/archive');
        expect(store.activePath).toBeNull();
        expect(store.activeDocument).toBeNull();
        expect(store.draftContent).toBe('');
    });

    it('records node history, navigates back and forward, and truncates forward history after a new visit', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/alpha.md', name: 'alpha.md', kind: 'file' },
                { path: '/beta.md', name: 'beta.md', kind: 'file' },
                { path: '/gamma', name: 'gamma', kind: 'directory' }
            ],
            documents: {
                '/alpha.md': '# Alpha',
                '/beta.md': '# Beta'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/alpha.md');
        await store.openNode('/beta.md');

        expect(store.nodeHistory).toEqual(['/alpha.md', '/beta.md']);
        expect(store.nodeHistoryIndex).toBe(1);
        expect(store.canGoBackNodeHistory).toBe(true);
        expect(store.canGoForwardNodeHistory).toBe(false);

        await store.goBackNodeHistory();
        expect(store.activePath).toBe('/alpha.md');
        expect(store.nodeHistory).toEqual(['/alpha.md', '/beta.md']);
        expect(store.nodeHistoryIndex).toBe(0);
        expect(store.canGoForwardNodeHistory).toBe(true);

        await store.goForwardNodeHistory();
        expect(store.activePath).toBe('/beta.md');
        expect(store.nodeHistoryIndex).toBe(1);

        await store.goBackNodeHistory();
        await store.openNode('/gamma');
        expect(store.selectedNodePath).toBe('/gamma');
        expect(store.activePath).toBeNull();
        expect(store.nodeHistory).toEqual(['/alpha.md', '/gamma']);
        expect(store.nodeHistoryIndex).toBe(1);
        expect(store.canGoForwardNodeHistory).toBe(false);
    });

    it('does not record restore navigation and removes missing nodes from history on refresh', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                { path: '/notes.md', name: 'notes.md', kind: 'file' }
            ],
            documents: {
                '/docs/guide.md': '# Guide',
                '/notes.md': '# Notes'
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.openNode('/docs/guide.md');
        await store.openNode('/notes.md');
        await store.restoreSelection({
            selectedNodePath: '/docs',
            activePath: '/docs/guide.md'
        });

        expect(store.nodeHistory).toEqual(['/docs/guide.md', '/notes.md']);
        expect(store.nodeHistoryIndex).toBe(1);

        await provider.deleteNode('/notes.md');
        await store.refreshTree();

        expect(store.nodeHistory).toEqual(['/docs/guide.md']);
        expect(store.nodeHistoryIndex).toBe(0);
        expect(store.canGoBackNodeHistory).toBe(false);
    });

    it('falls back to the default agent when no scoped config exists', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/notes', name: 'notes', kind: 'directory' },
                { path: '/notes/day-1.md', name: 'day-1.md', kind: 'file', parentPath: '/notes' }
            ],
            documents: {
                '/notes/day-1.md': '# Day 1'
            }
        }));

        await store.hydrateWorkspace();

        expect(store.activeAgent?.name).toBe('Default Knowledge Agent');
        expect(store.activeAgent?.scopePath).toBe('/');
        expect(store.agentResolutionError).toBeNull();
    });

    it('creates and saves the root default agent config when the root agent is edited', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/notes', name: 'notes', kind: 'directory' },
                { path: '/notes/day-1.md', name: 'day-1.md', kind: 'file', parentPath: '/notes' }
            ],
            documents: {
                '/notes/day-1.md': '# Day 1'
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.openNode('/');
        await store.saveAgentConfig({
            ownerPath: '/',
            patch: {
                instructions: 'Root prompt',
                modelProviderName: 'gemini-api',
                modelName: 'gemini-2.5-flash'
            }
        });

        const saved = await provider.readDocument('/.agent.json');
        const parsed = JSON.parse(decodeTextDocument(saved.dataBase64));
        expect(parsed).toMatchObject({
            ...DEFAULT_SCOPED_AGENT_CONFIG,
            instructions: 'Root prompt',
            modelProviderName: 'gemini-api',
            modelName: 'gemini-2.5-flash'
        });
        expect(store.selectedNodePath).toBe('/');
        expect(store.activeAgentKey).toBe('/');
        expect(store.activeAgent?.name).toBe('Default Knowledge Agent');
        expect(store.activeAgent?.effectiveInstructions).toContain('Root prompt');
        expect(store.activeAgent?.modelProviderName).toBe('gemini-api');
        expect(store.activeAgent?.modelName).toBe('gemini-2.5-flash');
    });

    it('saves editable agent config fields while preserving unsupported fields and refreshing the active agent', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({
                    name: 'Docs Agent',
                    description: 'Keep this description',
                    instructions: 'Old prompt',
                    modelProviderName: 'gemini-api',
                    modelName: 'old-model',
                    tools: [{ id: 'read_file' }],
                    skills: [{ id: 'summarize' }],
                    linkDir: './linked',
                    customFlag: true
                })
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.openNode('/docs');
        await store.saveAgentConfig({
            ownerPath: '/docs',
            patch: {
                description: 'Updated description',
                instructions: 'New prompt',
                modelProviderName: 'openai',
                modelName: 'gpt-5.4',
                inheritance: 'override',
                tools: [
                    { id: 'read_file' },
                    { id: 'write_file' }
                ]
            }
        });

        const saved = await provider.readDocument('/docs/.agent.json');
        const parsed = JSON.parse(decodeTextDocument(saved.dataBase64));
        expect(parsed).toMatchObject({
            name: 'Docs Agent',
            description: 'Updated description',
            instructions: 'New prompt',
            modelProviderName: 'openai',
            modelName: 'gpt-5.4',
            inheritance: 'override',
            linkDir: './linked',
            customFlag: true
        });
        expect(parsed.tools).toEqual([
            { id: 'read_file' },
            { id: 'write_file' }
        ]);
        expect(parsed.skills).toEqual([{ id: 'summarize' }]);
        expect(store.activeAgent?.name).toBe('Docs Agent');
        expect(store.activeAgent?.effectiveInstructions).toBe('New prompt');
        expect(store.activeAgent?.modelProviderName).toBe('openai');
        expect(store.activeAgent?.modelName).toBe('gpt-5.4');
    });

    it('removes tools when saving full inheritance for an owner agent config', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({
                    name: 'Docs Agent',
                    instructions: 'Old prompt',
                    tools: [{ id: 'read_file' }, { id: 'write_file' }],
                    customFlag: true
                })
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.saveAgentConfig({
            ownerPath: '/docs',
            patch: {
                inheritTools: true
            }
        });

        const saved = await provider.readDocument('/docs/.agent.json');
        const parsed = JSON.parse(decodeTextDocument(saved.dataBase64));
        expect(parsed).toEqual({
            name: 'Docs Agent',
            instructions: 'Old prompt',
            customFlag: true
        });
    });

    it('surfaces agent config save failures as workspace errors', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({
                    name: 'Docs Agent',
                    instructions: 'Old prompt'
                })
            }
        });
        provider.writeDocument = async () => {
            throw new Error('Failed to write document.');
        };
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await expect(store.saveAgentConfig({
            ownerPath: '/docs',
            patch: {
                instructions: 'New prompt'
            }
        })).rejects.toThrow('Failed to write document.');

        expect(store.currentError).toBe('Failed to write document.');
    });

    it('normalizes blank agent config fields and removes default merge inheritance', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/.agent.json': JSON.stringify({
                    name: 'Docs Agent',
                    instructions: 'Old prompt',
                    modelProviderName: 'gemini-api',
                    modelName: 'old-model',
                    inheritance: 'override'
                })
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.saveAgentConfig({
            ownerPath: '/docs',
            patch: {
                instructions: '  ',
                modelProviderName: '',
                modelName: '',
                inheritance: 'merge'
            }
        });

        const saved = await provider.readDocument('/docs/.agent.json');
        const parsed = JSON.parse(decodeTextDocument(saved.dataBase64));
        expect(parsed).toEqual({ name: 'Docs Agent' });
    });

    it('surfaces workspace context errors when getContext fails', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/broken', name: 'broken', kind: 'directory' },
                { path: '/broken/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/broken' },
                { path: '/broken/note.md', name: 'note.md', kind: 'file', parentPath: '/broken' }
            ],
            documents: {
                '/broken/.agent.json': '{ invalid json }',
                '/broken/note.md': '# Broken Note'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/broken/note.md');

        expect(store.activePath).toBeNull();
        expect(store.selectedNodePath).toBe('/');
        expect(store.draftContent).toBe('');
        expect(store.activeAgent).toBeNull();
        expect(store.currentError).toContain('Failed to parse /broken/.agent.json');
    });

    it('records file changes and supports in-memory undo/redo for the active file', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/notes.md', name: 'notes.md', kind: 'file' }
            ],
            documents: {
                '/notes.md': '# Before'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/notes.md');
        store.recordFileChange({
            path: '/notes.md',
            beforeContent: '# Before',
            afterContent: '# After'
        });

        expect(store.latestFileChange?.path).toBe('/notes.md');
        expect(store.activeDiffEntries.some((entry) => entry.kind === 'removed')).toBe(true);
        expect(store.activeDiffEntries.some((entry) => entry.kind === 'added')).toBe(true);
        expect(store.canUndoActiveFile).toBe(true);

        await store.undoActiveFileChange();
        expect(store.draftContent).toBe('# Before');
        expect(store.canRedoActiveFile).toBe(true);
        expect(store.latestFileChange?.path).toBe('/notes.md');

        await store.redoActiveFileChange();
        expect(store.draftContent).toBe('# After');
        expect(store.canUndoActiveFile).toBe(true);
    });

    it('applies generated document changes through the provider before recording diff history', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/notes.md', name: 'notes.md', kind: 'file' }
            ],
            documents: {
                '/notes.md': '# Before'
            }
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.openNode('/notes.md');
        await store.applyGeneratedDocumentChange({
            path: '/notes.md',
            beforeContent: '# Before',
            afterContent: '# After'
        });

        expect(decodeTextDocument((await provider.readDocument('/notes.md')).dataBase64)).toBe('# After');
        expect(store.latestFileChange?.beforeContent).toBe('# Before');
        expect(store.latestFileChange?.afterContent).toBe('# After');
    });

    it('keeps newer local edits after an in-flight save returns version metadata', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/notes.md', name: 'notes.md', kind: 'file' }
            ],
            documents: {
                '/notes.md': '# Before'
            }
        });
        const originalWriteDocument = provider.writeDocument.bind(provider);
        let releaseFirstWrite: (() => void) | null = null;
        let writeCount = 0;
        provider.writeDocument = vi.fn(async (input) => {
            writeCount += 1;
            if (writeCount === 1) {
                await new Promise<void>((resolve) => {
                    releaseFirstWrite = resolve;
                });
            }
            return originalWriteDocument(input);
        });

        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.openNode('/notes.md');

        store.updateActiveDocument('# First save');
        const firstSave = store.flushActiveDocument();
        await Promise.resolve();

        store.updateActiveDocument('# Second save');
        releaseFirstWrite?.();
        await firstSave;

        expect(store.draftContent).toBe('# Second save');
        expect(store.dirtyPaths['/notes.md']).toBe(true);
        expect(decodeTextDocument(store.activeDocument?.dataBase64 ?? '')).toBe('# First save');
        expect(store.activeDocument?.version).toBeTruthy();

        await store.flushActiveDocument();

        expect(store.draftContent).toBe('# Second save');
        expect(store.dirtyPaths['/notes.md']).toBe(false);
        expect(decodeTextDocument((await provider.readDocument('/notes.md')).dataBase64)).toBe('# Second save');
    });

    it('debounces automatic document saves for one minute', async () => {
        vi.useFakeTimers();
        const provider = createMockContextProvider({
            nodes: [
                { path: '/notes.md', name: 'notes.md', kind: 'file' }
            ],
            documents: {
                '/notes.md': '# Before'
            }
        });
        const writeDocument = vi.spyOn(provider, 'writeDocument');
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.openNode('/notes.md');

        store.updateActiveDocument('# After');
        await vi.advanceTimersByTimeAsync(59_999);

        expect(writeDocument).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);

        expect(writeDocument).toHaveBeenCalledTimes(1);
        expect(decodeTextDocument((await provider.readDocument('/notes.md')).dataBase64)).toBe('# After');
    });

    it('refreshes document versions after save, agent changes, undo, and redo', async () => {
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/notes.md', name: 'notes.md', kind: 'file' }
            ],
            documents: {
                '/notes.md': '# Before'
            }
        }));

        await store.hydrateWorkspace();
        await store.openNode('/notes.md');

        store.updateActiveDocument('# First save');
        await expect(store.flushActiveDocument()).resolves.toBeUndefined();
        expect(store.activeDocument?.version).toBeTruthy();

        store.updateActiveDocument('# Second save');
        await expect(store.flushActiveDocument()).resolves.toBeUndefined();
        expect(store.activeDocument?.version).toBeTruthy();

        store.recordFileChange({
            path: '/notes.md',
            beforeContent: '# Second save',
            afterContent: '# Agent rewrite'
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(store.activeDocument?.version).toBeTruthy();

        store.updateActiveDocument('# Agent rewrite plus manual edit');
        await expect(store.flushActiveDocument()).resolves.toBeUndefined();
        expect(store.activeDocument?.version).toBeTruthy();

        store.recordFileChange({
            path: '/notes.md',
            beforeContent: '# Agent rewrite plus manual edit',
            afterContent: '# Redo target'
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        await expect(store.undoActiveFileChange()).resolves.toBeUndefined();
        expect(store.activeDocument?.version).toBeTruthy();
        store.updateActiveDocument('# Undo plus manual edit');
        await expect(store.flushActiveDocument()).resolves.toBeUndefined();
        expect(store.activeDocument?.version).toBeTruthy();

        await expect(store.redoActiveFileChange()).resolves.toBeUndefined();
        expect(store.activeDocument?.version).toBeTruthy();
        store.updateActiveDocument('# Redo plus manual edit');
        await expect(store.flushActiveDocument()).resolves.toBeUndefined();
        expect(store.activeDocument?.version).toBeTruthy();
    });

    it('surfaces flushActiveDocument failures as workspace errors', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/notes.md', name: 'notes.md', kind: 'file' }
            ],
            documents: {
                '/notes.md': '# Before'
            }
        });
        provider.writeDocument = vi.fn(async () => {
            throw new Error('The document version has changed. Please reload and try again.');
        });
        const store = useDocumentWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.openNode('/notes.md');
        store.updateActiveDocument('# After');

        await expect(store.flushActiveDocument()).rejects.toThrow('The document version has changed. Please reload and try again.');
        expect(store.currentError).toBe('The document version has changed. Please reload and try again.');
    });
});
