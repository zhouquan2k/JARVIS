import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMockContextProvider, decodeTextDocument } from '@packages/core/src';
import { useDocumentWorkspaceStore } from './documentWorkspace';

describe('useDocumentWorkspaceStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
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
            name: 'new-note.md',
            kind: 'file'
        });

        expect(store.nodes.some((node) => node.path === '/new-note.md')).toBe(true);
        expect(store.activePath).toBe('/new-note.md');
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
        await store.renameNode({ path: '/workspace/guide.md', name: 'guide-renamed.md' });

        expect(store.nodes.some((node) => node.path === '/workspace/guide-renamed.md')).toBe(true);
        expect(store.activePath).toBe('/workspace/guide-renamed.md');
        expect(store.selectedNodePath).toBe('/workspace/guide-renamed.md');
        expect(store.activeDocument?.path).toBe('/workspace/guide-renamed.md');
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
});
