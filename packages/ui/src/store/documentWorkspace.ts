import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import {
    DEFAULT_WORKSPACE_AGENT_KEY,
    type ContextDocument,
    type ContextNode,
    type CreateContextNodeInput,
    type IContextProvider,
    type ResolvedAgentConfig,
    type WorkspaceContext,
    decodeTextDocument,
    encodeTextDocument,
    isTextDocumentMimeType
} from '@packages/core/src';
import { buildLineDiffEntries, FileChangeService, type FileChangeRecord, type LineDiffEntry } from '../services/FileChangeService';
import { resolveDocumentViewer } from '../document-viewers/registry';

type ActiveViewerCapabilities = {
    view: boolean;
    edit: boolean;
} | null;

export interface DocumentWorkspaceState {
    contextProvider: IContextProvider | null;
    context: WorkspaceContext | null;
    nodes: ContextNode[];
    expandedPaths: string[];
    selectedNodePath: string | null;
    activePath: string | null;
    activeDocument: ContextDocument | null;
    activeViewerId: string | null;
    activeViewerCapabilities: ActiveViewerCapabilities;
    activePaneMode: 'empty' | 'viewer' | 'unsupported';
    draftContent: string;
    dirtyPaths: Record<string, boolean>;
    panelSizes: [number, number, number];
    isHydrating: boolean;
    isSaving: boolean;
    accessInitialized: boolean;
    currentError: string | null;
    activeAgentKey: string | null;
    activeAgent: ResolvedAgentConfig | null;
    isAgentOwnerSelected: boolean;
    agentResolutionError: string | null;
    fileChangeService: FileChangeService;
    latestFileChange: FileChangeRecord | null;
    activeDiffEntries: LineDiffEntry[];
    canUndoActiveFile: boolean;
    canRedoActiveFile: boolean;
}

const AUTO_SAVE_DELAY_MS = 400;

function flattenVisibleNodes(nodes: ContextNode[]): ContextNode[] {
    const flattened: ContextNode[] = [];

    nodes.forEach((node) => {
        flattened.push({
            ...node,
            children: undefined
        });
        if (node.children?.length) {
            flattened.push(...flattenVisibleNodes(node.children));
        }
    });

    return flattened;
}

function flattenAllNodes(nodes: ContextNode[]): ContextNode[] {
    const flattened: ContextNode[] = [];

    nodes.forEach((node) => {
        flattened.push(node);
        if (node.children?.length) {
            flattened.push(...flattenAllNodes(node.children));
        }
    });

    return flattened;
}

function findNodeByPath(nodes: ContextNode[], targetPath: string): ContextNode | null {
    for (const node of nodes) {
        if (node.path === targetPath) {
            return node;
        }

        if (node.children?.length) {
            const nested = findNodeByPath(node.children, targetPath);
            if (nested) {
                return nested;
            }
        }
    }

    return null;
}

function resolveRootAgentKey(context: WorkspaceContext | null): string | null {
    if (!context) {
        return null;
    }

    const rootAgentNode = findNodeByPath(context.nodes, '/.agent.json');
    if (rootAgentNode?.agentKey) {
        return rootAgentNode.agentKey;
    }

    return context.agentConfigs[DEFAULT_WORKSPACE_AGENT_KEY]
        ? DEFAULT_WORKSPACE_AGENT_KEY
        : Object.keys(context.agentConfigs)[0] ?? null;
}

function ensureRootExpanded(expandedPaths: string[]): string[] {
    return expandedPaths.includes('/') ? expandedPaths : ['/', ...expandedPaths];
}

function filterExpandedPaths(nodes: ContextNode[], expandedPaths: string[]): string[] {
    const directoryPaths = new Set(
        nodes
            .filter((node) => node.kind === 'directory')
            .map((node) => node.path)
    );

    return ensureRootExpanded(expandedPaths.filter((path) => path === '/' || directoryPaths.has(path)));
}

function getParentPath(path: string | null): string {
    if (!path || path === '/') {
        return '/';
    }

    const lastSlash = path.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : path.slice(0, lastSlash);
}

function remapPath(path: string | null, fromPath: string, toPath: string): string | null {
    if (!path) {
        return path;
    }

    if (path === fromPath) {
        return toPath;
    }

    if (path.startsWith(`${fromPath}/`)) {
        return `${toPath}${path.slice(fromPath.length)}`;
    }

    return path;
}

function resolveExistingPath(path: string | null, nodes: ContextNode[]): string | null {
    if (!path) {
        return null;
    }

    if (path === '/') {
        return '/';
    }

    let current = path;
    while (current !== '/') {
        if (findNodeByPath(nodes, current)) {
            return current;
        }

        current = getParentPath(current);
    }

    return '/';
}

function buildExpandedPathsForRestore(path: string, includeSelf: boolean): string[] {
    if (path === '/') {
        return ['/'];
    }

    const expanded = new Set<string>(['/']);
    let current = includeSelf ? path : getParentPath(path);

    while (current !== '/') {
        expanded.add(current);
        current = getParentPath(current);
    }

    return Array.from(expanded);
}

function normalizeSizes(sizes: [number, number, number]): [number, number, number] {
    const bounded = sizes.map((size) => Math.max(15, Math.min(70, Number.isFinite(size) ? size : 0))) as [number, number, number];
    const total = bounded[0] + bounded[1] + bounded[2];
    if (total <= 0) {
        return [20, 50, 30];
    }

    return bounded.map((size) => Number(((size / total) * 100).toFixed(2))) as [number, number, number];
}

function getEditableDocumentText(document: ContextDocument | null): string {
    if (!document || !isTextDocumentMimeType(document.mimeType)) {
        return '';
    }

    return decodeTextDocument(document.dataBase64);
}

function clearActiveDocumentState(store: {
    activePath: string | null;
    activeDocument: ContextDocument | null;
    activeViewerId: string | null;
    activeViewerCapabilities: ActiveViewerCapabilities;
    activePaneMode: 'empty' | 'viewer' | 'unsupported';
    draftContent: string;
}) {
    store.activePath = null;
    store.activeDocument = null;
    store.activeViewerId = null;
    store.activeViewerCapabilities = null;
    store.activePaneMode = 'empty';
    store.draftContent = '';
}

export const useDocumentWorkspaceStore = defineStore('document-workspace', {
    state: (): DocumentWorkspaceState => ({
        contextProvider: null,
        context: null,
        nodes: [],
        expandedPaths: [],
        selectedNodePath: null,
        activePath: null,
        activeDocument: null,
        activeViewerId: null,
        activeViewerCapabilities: null,
        activePaneMode: 'empty',
        draftContent: '',
        dirtyPaths: {},
        panelSizes: [20, 50, 30],
        isHydrating: false,
        isSaving: false,
        accessInitialized: false,
        currentError: null,
        activeAgentKey: null,
        activeAgent: null,
        isAgentOwnerSelected: false,
        agentResolutionError: null,
        fileChangeService: markRaw(new FileChangeService()),
        latestFileChange: null,
        activeDiffEntries: [],
        canUndoActiveFile: false,
        canRedoActiveFile: false
    }),
    getters: {
        activeNode(state): ContextNode | null {
            const targetPath = state.selectedNodePath ?? state.activePath;
            return targetPath && state.context
                ? findNodeByPath(state.context.nodes, targetPath) ?? null
                : null;
        }
    },
    actions: {
        findNodeByPath(path: string): ContextNode | null {
            return this.context ? findNodeByPath(this.context.nodes, path) : null;
        },

        findChildrenByPath(path: string): ContextNode[] {
            if (!this.context) {
                return [];
            }

            if (path === '/') {
                return this.context.nodes;
            }

            const node = this.findNodeByPath(path);
            return node?.kind === 'directory' ? (node.children ?? []) : [];
        },

        collectMarkdownDocuments(path: string): ContextNode[] {
            const ownerNode = this.findNodeByPath(path);
            if (!ownerNode || ownerNode.kind !== 'directory') {
                return [];
            }

            const descendants = flattenAllNodes(ownerNode.children ?? []);
            return descendants.filter((node) => (
                node.kind === 'file'
                && !node.name.startsWith('.')
                && (node.name.endsWith('.md') || node.name.endsWith('.markdown'))
            ));
        },

        syncActiveFileChange(path?: string | null) {
            const targetPath = path ?? this.activePath;
            if (!targetPath) {
                this.latestFileChange = null;
                this.activeDiffEntries = [];
                this.canUndoActiveFile = false;
                this.canRedoActiveFile = false;
                return;
            }

            const record = this.fileChangeService.getVisibleRecord(targetPath);
            this.latestFileChange = record;
            this.activeDiffEntries = record
                ? buildLineDiffEntries(record.beforeContent, record.afterContent)
                : [];
            this.canUndoActiveFile = this.fileChangeService.canUndo(targetPath);
            this.canRedoActiveFile = this.fileChangeService.canRedo(targetPath);
        },

        applyActiveContent(content: string, path?: string | null) {
            const targetPath = path ?? this.activePath;
            if (!targetPath) {
                return;
            }

            const updatedAt = Date.now();
            if (this.activePath === targetPath) {
                this.activeDocument = {
                    path: targetPath,
                    mimeType: this.activeDocument?.mimeType ?? 'text/markdown',
                    dataBase64: encodeTextDocument(content),
                    version: this.activeDocument?.version,
                    canWrite: this.activeDocument?.canWrite ?? true,
                    updatedAt
                };
                this.draftContent = content;
            }

            this.nodes = this.nodes.map((node) => node.path === targetPath ? { ...node, updatedAt } : node);
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [targetPath]: false
            };
        },

        recordFileChange(change: { path: string; beforeContent: string; afterContent: string }) {
            const record = this.fileChangeService.recordChange(change);
            this.applyActiveContent(change.afterContent, change.path);
            this.syncActiveFileChange(change.path);
            void this.refreshDocumentVersion(change.path).catch((error) => {
                this.currentError = error instanceof Error ? error.message : String(error);
            });
            return record;
        },

        setContextProvider(provider: IContextProvider | null) {
            this.contextProvider = provider ? markRaw(provider) : null;
            this.context = null;
            this.nodes = [];
            this.expandedPaths = ['/'];
            this.selectedNodePath = '/';
            clearActiveDocumentState(this);
            this.dirtyPaths = {};
            this.accessInitialized = false;
            this.currentError = null;
            this.activeAgentKey = null;
            this.activeAgent = null;
            this.isAgentOwnerSelected = false;
            this.agentResolutionError = null;
            this.latestFileChange = null;
            this.activeDiffEntries = [];
            this.canUndoActiveFile = false;
            this.canRedoActiveFile = false;
            clearAutoSaveTimer(this);
        },

        async hydrateWorkspace() {
            if (!this.contextProvider) {
                return;
            }

            this.isHydrating = true;
            this.currentError = null;
            try {
                await this.contextProvider.initializeAccess();
                this.accessInitialized = true;
                await this.refreshContext();
            } catch (error) {
                this.currentError = error instanceof Error ? error.message : String(error);
            } finally {
                this.isHydrating = false;
            }
        },

        async refreshContext() {
            if (!this.contextProvider) {
                return;
            }

            const context = await this.contextProvider.getContext();
            const nextNodes = flattenVisibleNodes(context.nodes);
            this.context = context;
            this.nodes = nextNodes;
            this.expandedPaths = filterExpandedPaths(nextNodes, this.expandedPaths);

            const hasPath = (path: string | null) => !!path && (
                path === '/'
                || nextNodes.some((node) => node.path === path)
            );

            if (this.activePath && !hasPath(this.activePath)) {
                clearActiveDocumentState(this);
                this.syncActiveFileChange(null);
            }

            if (this.selectedNodePath && this.selectedNodePath !== '/' && !hasPath(this.selectedNodePath)) {
                this.selectedNodePath = this.activePath && hasPath(this.activePath) ? this.activePath : '/';
            }

            if (!this.activePath) {
                this.selectedNodePath = this.selectedNodePath || '/';
                clearActiveDocumentState(this);
                this.syncActiveFileChange(null);
            }

            this.syncActiveAgent(this.activePath ?? this.selectedNodePath ?? '/');
        },

        async refreshTree() {
            await this.refreshContext();
        },

        syncActiveAgent(path: string) {
            if (!this.context) {
                this.activeAgentKey = null;
                this.activeAgent = null;
                this.isAgentOwnerSelected = false;
                this.agentResolutionError = null;
                return;
            }

            const agentKey = path === '/'
                ? resolveRootAgentKey(this.context)
                : this.findNodeByPath(path)?.agentKey ?? null;
            const activeNode = path === '/' ? null : this.findNodeByPath(path);
            this.activeAgentKey = agentKey;
            this.activeAgent = agentKey ? this.context.agentConfigs[agentKey] ?? null : null;
            this.isAgentOwnerSelected = activeNode?.kind === 'directory' && activeNode.isAgentOwner === true;
            this.agentResolutionError = agentKey && !this.activeAgent
                ? `未找到 agentConfigs['${agentKey}'] 对应的 Agent 配置。`
                : null;
        },

        async restoreSelection(input: {
            selectedNodePath: string | null;
            activePath?: string | null;
        }) {
            if (!this.contextProvider) {
                return;
            }

            const activeExactPath = input.activePath === '/'
                ? '/'
                : input.activePath && this.findNodeByPath(input.activePath)
                    ? input.activePath
                    : null;
            const selectedExactPath = input.selectedNodePath === '/'
                ? '/'
                : input.selectedNodePath && this.findNodeByPath(input.selectedNodePath)
                    ? input.selectedNodePath
                    : null;

            const restorePath = activeExactPath
                ?? selectedExactPath
                ?? resolveExistingPath(input.activePath ?? null, this.nodes)
                ?? resolveExistingPath(input.selectedNodePath ?? null, this.nodes)
                ?? '/';

            const targetNode = restorePath === '/' ? null : this.findNodeByPath(restorePath);
            this.expandedPaths = filterExpandedPaths(
                this.nodes,
                [
                    ...this.expandedPaths,
                    ...buildExpandedPathsForRestore(restorePath, targetNode?.kind === 'directory')
                ]
            );

            const shouldPreserveSelectedDirectory = !!selectedExactPath
                && !!activeExactPath
                && selectedExactPath !== activeExactPath
                && this.findNodeByPath(selectedExactPath)?.kind === 'directory';

            await this.openNode(
                restorePath,
                shouldPreserveSelectedDirectory
                    ? { selectedNodePath: selectedExactPath }
                    : undefined
            );
        },

        toggleExpanded(path: string) {
            if (this.expandedPaths.includes(path)) {
                this.expandedPaths = this.expandedPaths.filter((item) => item !== path);
                return;
            }

            this.expandedPaths = [...this.expandedPaths, path];
        },

        async openNode(path: string, options?: { selectedNodePath?: string | null }) {
            if (!this.contextProvider) {
                return;
            }

            if (path === '/') {
                this.selectedNodePath = '/';
                this.expandedPaths = ensureRootExpanded(this.expandedPaths);
                clearActiveDocumentState(this);
                this.syncActiveFileChange(null);
                this.syncActiveAgent('/');
                return;
            }

            const node = this.findNodeByPath(path);
            if (!node) {
                return;
            }

            const selectedNodePath = options?.selectedNodePath ?? path;
            if (node.kind === 'directory') {
                this.selectedNodePath = selectedNodePath;
                clearActiveDocumentState(this);
                this.syncActiveFileChange(null);
                this.syncActiveAgent(selectedNodePath);
                return;
            }

            await this.flushActiveDocument();
            const document = await this.contextProvider.readDocument(path);
            const viewer = resolveDocumentViewer(document);
            this.selectedNodePath = selectedNodePath;
            this.activePath = path;
            this.activeDocument = document;
            this.activeViewerId = viewer?.id ?? null;
            this.activeViewerCapabilities = viewer?.capabilities ?? null;
            this.activePaneMode = viewer ? 'viewer' : 'unsupported';
            this.draftContent = viewer?.capabilities.edit && isTextDocumentMimeType(document.mimeType)
                ? decodeTextDocument(document.dataBase64)
                : '';
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [path]: false
            };
            this.syncActiveFileChange(path);
            this.syncActiveAgent(selectedNodePath);
        },

        updateActiveDocument(content: string) {
            if (!this.activePath || !this.activeViewerCapabilities?.edit) {
                return;
            }

            this.draftContent = content;
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [this.activePath]: getEditableDocumentText(this.activeDocument) !== content
            };
            scheduleAutoSave(this);
        },

        async flushActiveDocument() {
            if (
                !this.contextProvider
                || !this.activePath
                || !this.activeDocument
                || !this.activeViewerCapabilities?.edit
                || !this.dirtyPaths[this.activePath]
            ) {
                return;
            }

            clearAutoSaveTimer(this);
            this.isSaving = true;
            try {
                const activePath = this.activePath;
                const activeDocument = this.activeDocument;
                await this.contextProvider.writeDocument({
                    path: activePath,
                    mimeType: activeDocument.mimeType,
                    dataBase64: encodeTextDocument(this.draftContent),
                    expectedVersion: activeDocument.version
                });
                await this.refreshDocumentVersion(activePath);
            } finally {
                this.isSaving = false;
            }
        },

        async createNode(input: CreateContextNodeInput) {
            if (!this.contextProvider) {
                return;
            }

            const createdNode = await this.contextProvider.createNode(input);
            await this.refreshTree();

            if (input.parentPath && !this.expandedPaths.includes(input.parentPath)) {
                this.expandedPaths = [...this.expandedPaths, input.parentPath];
            }

            if (input.kind === 'file') {
                await this.openNode(createdNode.path);
                return;
            }

            this.selectedNodePath = createdNode.path;
            this.expandedPaths = ensureRootExpanded(
                createdNode.kind === 'directory'
                    ? [...this.expandedPaths, createdNode.path]
                    : this.expandedPaths
            );
            clearActiveDocumentState(this);
            this.syncActiveFileChange(null);
            this.syncActiveAgent(createdNode.path);
        },

        async deleteNode(path: string) {
            if (!this.contextProvider || !path || path === '/') {
                return;
            }

            const fallbackPath = getParentPath(path);
            await this.flushActiveDocument();
            await this.contextProvider.deleteNode(path);

            const deletedPaths = new Set(
                this.nodes
                    .filter((node) => node.path === path || node.path.startsWith(`${path}/`))
                    .map((node) => node.path)
            );

            deletedPaths.forEach((deletedPath) => {
                delete this.dirtyPaths[deletedPath];
                this.fileChangeService.clear(deletedPath);
            });

            if (this.activePath && deletedPaths.has(this.activePath)) {
                clearActiveDocumentState(this);
                this.syncActiveFileChange(null);
            }

            await this.refreshTree();
            this.selectedNodePath = fallbackPath;
            clearActiveDocumentState(this);
            this.syncActiveFileChange(null);
            this.syncActiveAgent(fallbackPath);
        },

        async renameNode(input: { path: string; name: string }) {
            if (!this.contextProvider || !input.path || input.path === '/') {
                return;
            }

            await this.flushActiveDocument();
            const renamedNode = await this.contextProvider.renameNode(input);

            const previousActivePath = this.activePath;
            const previousSelectedPath = this.selectedNodePath;
            const nextActivePath = remapPath(previousActivePath, input.path, renamedNode.path);
            const nextSelectedPath = remapPath(previousSelectedPath, input.path, renamedNode.path);

            const nextDirtyPaths = Object.fromEntries(
                Object.entries(this.dirtyPaths).map(([path, dirty]) => [remapPath(path, input.path, renamedNode.path) || path, dirty])
            );
            this.dirtyPaths = nextDirtyPaths;

            const visibleRecord = previousActivePath ? this.fileChangeService.getVisibleRecord(previousActivePath) : null;
            if (visibleRecord && previousActivePath && nextActivePath && nextActivePath !== previousActivePath) {
                this.fileChangeService.clear(previousActivePath);
                this.fileChangeService.recordChange({
                    path: nextActivePath,
                    beforeContent: visibleRecord.beforeContent,
                    afterContent: visibleRecord.afterContent
                });
            }

            await this.refreshTree();
            this.selectedNodePath = nextSelectedPath;

            if (nextActivePath && this.nodes.some((node) => node.path === nextActivePath)) {
                await this.openNode(nextActivePath);
                return;
            }

            clearActiveDocumentState(this);
            this.syncActiveFileChange(null);
            this.syncActiveAgent(nextSelectedPath || '/');
        },

        async undoActiveFileChange() {
            if (!this.contextProvider || !this.activePath) {
                return;
            }

            const result = await this.fileChangeService.undo(this.activePath, this.contextProvider);
            if (!result) {
                return;
            }

            this.applyActiveContent(result.content, this.activePath);
            await this.refreshDocumentVersion(this.activePath);
            this.syncActiveFileChange(this.activePath);
        },

        async redoActiveFileChange() {
            if (!this.contextProvider || !this.activePath) {
                return;
            }

            const result = await this.fileChangeService.redo(this.activePath, this.contextProvider);
            if (!result) {
                return;
            }

            this.applyActiveContent(result.content, this.activePath);
            await this.refreshDocumentVersion(this.activePath);
            this.syncActiveFileChange(this.activePath);
        },

        async refreshDocumentVersion(path: string) {
            if (!this.contextProvider) {
                return;
            }

            const refreshedDocument = await this.contextProvider.readDocument(path);
            const refreshedViewer = resolveDocumentViewer(refreshedDocument);

            this.nodes = this.nodes.map((node) => node.path === path
                ? { ...node, updatedAt: refreshedDocument.updatedAt ?? node.updatedAt }
                : node);
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [path]: false
            };

            if (this.activePath !== path) {
                return;
            }

            this.activeDocument = refreshedDocument;
            this.activeViewerId = refreshedViewer?.id ?? null;
            this.activeViewerCapabilities = refreshedViewer?.capabilities ?? null;
            this.activePaneMode = refreshedViewer ? 'viewer' : 'unsupported';
            this.draftContent = refreshedViewer?.capabilities.edit && isTextDocumentMimeType(refreshedDocument.mimeType)
                ? decodeTextDocument(refreshedDocument.dataBase64)
                : '';
        },

        setPanelSizes(sizes: [number, number, number]) {
            this.panelSizes = normalizeSizes(sizes);
        }
    }
});

const autoSaveTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();

function clearAutoSaveTimer(store: object) {
    const timer = autoSaveTimers.get(store);
    if (timer) {
        clearTimeout(timer);
        autoSaveTimers.delete(store);
    }
}

function scheduleAutoSave(store: ReturnType<typeof useDocumentWorkspaceStore>) {
    clearAutoSaveTimer(store);
    const timer = setTimeout(() => {
        void store.flushActiveDocument();
    }, AUTO_SAVE_DELAY_MS);
    autoSaveTimers.set(store, timer);
}
