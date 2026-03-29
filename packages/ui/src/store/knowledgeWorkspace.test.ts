import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMockContextProvider } from '@packages/core/src';
import { useKnowledgeWorkspaceStore } from './knowledgeWorkspace';

describe('useKnowledgeWorkspaceStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('hydrates the tree without opening a file and resolves the root agent context', async () => {
        const store = useKnowledgeWorkspaceStore();
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
        expect(store.selectedNodePath).toBeNull();
        expect(store.draftContent).toBe('');
        expect(store.expandedPaths).toEqual([]);
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
        const store = useKnowledgeWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        await store.openNode('/alpha.md');
        store.updateActiveDocument('alpha updated');
        await store.openNode('/beta.md');

        const alpha = await provider.readDocument('/alpha.md');
        expect(alpha.content).toBe('alpha updated');
        expect(store.activePath).toBe('/beta.md');
        expect(store.draftContent).toBe('beta');
    });

    it('creates files and opens them immediately', async () => {
        const store = useKnowledgeWorkspaceStore();
        store.setContextProvider(createMockContextProvider());

        await store.hydrateWorkspace();
        await store.createNode({
            name: 'new-note.md',
            kind: 'file'
        });

        expect(store.nodes.some((node) => node.path === '/new-note.md')).toBe(true);
        expect(store.activePath).toBe('/new-note.md');
    });

    it('filters dot-prefixed files and directories from the visible tree', async () => {
        const store = useKnowledgeWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/.git', name: '.git', kind: 'directory' },
                { path: '/.git/config', name: 'config', kind: 'file', parentPath: '/.git' },
                { path: '/.env', name: '.env', kind: 'file' },
                { path: '/visible', name: 'visible', kind: 'directory' },
                { path: '/visible/note.md', name: 'note.md', kind: 'file', parentPath: '/visible' }
            ],
            documents: {
                '/visible/note.md': '# Visible'
            }
        }));

        await store.hydrateWorkspace();

        expect(store.nodes.map((node) => node.path)).toEqual([
            '/visible',
            '/visible/note.md'
        ]);
        expect(store.activePath).toBeNull();
        expect(store.selectedNodePath).toBeNull();
    });

    it('refreshes the active agent when switching across scoped files', async () => {
        const store = useKnowledgeWorkspaceStore();
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

    it('clears the current file context when selecting a directory', async () => {
        const store = useKnowledgeWorkspaceStore();
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
        const store = useKnowledgeWorkspaceStore();
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

    it('surfaces agent resolution errors without blocking document editing', async () => {
        const store = useKnowledgeWorkspaceStore();
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

        expect(store.activePath).toBe('/broken/note.md');
        expect(store.selectedNodePath).toBe('/broken/note.md');
        expect(store.draftContent).toBe('# Broken Note');
        expect(store.activeAgent).toBeNull();
        expect(store.agentResolutionError).toContain('Failed to parse /broken/.agent.json');

        store.updateActiveDocument('# Fixed Content');
        await store.flushActiveDocument();

        const document = await store.contextProvider!.readDocument('/broken/note.md');
        expect(document.content).toBe('# Fixed Content');
    });

    it('records file changes and supports in-memory undo/redo for the active file', async () => {
        const store = useKnowledgeWorkspaceStore();
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
});
