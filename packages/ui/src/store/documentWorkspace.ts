import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import {
    DEFAULT_WORKSPACE_METADATA_FILE_NAME,
    DEFAULT_WORKSPACE_METADATA_BOOTSTRAP,
    DEFAULT_WORKSPACE_METADATA_TEMP_FILE_NAME,
    DEFAULT_WORKSPACE_SCOPE_KEY,
    type ContextDocument,
    type ContextNode,
    type CreateContextNodeInput,
    type FolderMetadata,
    type IContextProvider,
    type WorkspaceContext,
    type WriteContextDocumentResult,
    decodeTextDocument,
    encodeTextDocument,
    isTextDocumentMimeType
} from '@packages/core/src';
import { buildLineDiffEntries, FileChangeService, type FileChangeRecord, type LineDiffEntry } from '../services/FileChangeService';
import { resolveDocumentViewer } from '../document-viewers';
import { formatHttpApiError } from '../utils/formatHttpApiError';
import { buildPastedMarkdownImagePath, buildRelativeMarkdownImageReference, buildRelativeMarkdownLinkPath, rewriteOutgoingLinks } from '../utils/markdownDocument';
import { normalizeCreatedFileName, normalizeRenamedFileName } from '../utils/contextNodePresentation';

type ActiveViewerCapabilities = {
    view: boolean;
    edit: boolean;
} | null;

export type SaveFolderMetadataInput = {
    ownerPath: string;
    patch: Record<string, unknown>;
    clearedFields?: string[];
};

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
    scopeIndexPath: string | null;
    scopeIndexDocument: ContextDocument | null;
    scopeIndexViewerId: string | null;
    scopeIndexViewerCapabilities: ActiveViewerCapabilities;
    scopeIndexPaneMode: 'empty' | 'viewer' | 'unsupported';
    scopeIndexDraftContent: string;
    scopeIndexIsSaving: boolean;
    draftContent: string;
    dirtyPaths: Record<string, boolean>;
    panelSizes: [number, number, number];
    middlePaneMode: 'default' | 'maximized';
    middlePaneZoom: number;
    isHydrating: boolean;
    isSaving: boolean;
    accessInitialized: boolean;
    currentError: string | null;
    activeScopeKey: string | null;
    activeScopeData: Record<string, unknown> | null;
    isMetadataOwnerSelected: boolean;
    metadataResolutionError: string | null;
    fileChangeService: FileChangeService;
    latestFileChange: FileChangeRecord | null;
    activeDiffEntries: LineDiffEntry[];
    canUndoActiveFile: boolean;
    canRedoActiveFile: boolean;
    nodeHistory: string[];
    nodeHistoryIndex: number;
    recentNodePaths: string[];
}

const AUTO_SAVE_DELAY_MS = 60_000;
const DEFAULT_PANEL_SIZES: [number, number, number] = [20, 50, 30];
const MAXIMIZED_PANEL_SIZES: [number, number, number] = [20, 80, 0];
const MIN_MIDDLE_PANE_ZOOM = 1;
const MAX_MIDDLE_PANE_ZOOM = 1.8;
const MIDDLE_PANE_ZOOM_STEP = 0.1;
const WORKSPACE_SELECTION_SNAPSHOT_STORAGE_KEY = 'jarvis:knowledge-workspace:selection-snapshot';
const RECENT_NODE_PATHS_STORAGE_KEY = 'jarvis:knowledge-workspace:recent-node-paths';
const MAX_RECENT_NODE_COUNT = 5;

type WorkspaceSelectionSnapshot = {
    selectedNodePath: string | null;
    activePath: string | null;
};

function getWorkspaceSelectionSnapshotStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
        return null;
    }

    try {
        return globalThis.localStorage;
    } catch {
        return null;
    }
}

function getRecentNodePathsStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
        return null;
    }

    try {
        return globalThis.localStorage;
    } catch {
        return null;
    }
}

function sanitizeWorkspaceSelectionSnapshot(input: unknown): WorkspaceSelectionSnapshot | null {
    if (!input || typeof input !== 'object') {
        return null;
    }

    const record = input as Record<string, unknown>;
    const selectedNodePath = typeof record.selectedNodePath === 'string'
        ? record.selectedNodePath
        : null;
    const activePath = typeof record.activePath === 'string'
        ? record.activePath
        : null;

    if (!selectedNodePath && !activePath) {
        return null;
    }

    return {
        selectedNodePath,
        activePath
    };
}

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

function collectMarkdownTree(nodes: ContextNode[]): ContextNode[] {
    const collected: ContextNode[] = [];

    nodes.forEach((node) => {
        if (node.kind === 'file') {
            const isMarkdownFile = !node.name.startsWith('.')
                && (node.name.endsWith('.md') || node.name.endsWith('.markdown'));

            if (isMarkdownFile) {
                collected.push({
                    ...node,
                    children: undefined
                });
            }
            return;
        }

        const children = collectMarkdownTree(node.children ?? []);
        if (children.length > 0) {
            collected.push({
                ...node,
                children
            });
        }
    });

    return collected;
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

function resolveRootScopeKey(context: WorkspaceContext | null): string | null {
    if (!context) {
        return null;
    }

    const rootMetadataNode = findNodeByPath(context.nodes, resolveScopeMetadataPath('/'));
    if (rootMetadataNode?.scopeKey) {
        return rootMetadataNode.scopeKey;
    }

    return context.folderMetadata[DEFAULT_WORKSPACE_SCOPE_KEY]
        ? DEFAULT_WORKSPACE_SCOPE_KEY
        : Object.keys(context.folderMetadata)[0] ?? null;
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

export function getDefaultScopeIndexPath(ownerPath: string): string {
    return ownerPath === '/' ? '/index.md' : `${ownerPath.replace(/\/$/u, '')}/index.md`;
}

export function findDefaultScopeIndexNode(nodes: ContextNode[], ownerPath: string): ContextNode | null {
    const indexPath = getDefaultScopeIndexPath(ownerPath);
    const node = findNodeByPath(nodes, indexPath);
    return node?.kind === 'file' && node.name === 'index.md' ? node : null;
}

function hasDirectoryIndexNode(nodes: ContextNode[], ownerPath: string): boolean {
    return findDefaultScopeIndexNode(nodes, ownerPath) !== null;
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

function normalizeMiddlePaneZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) {
        return 1;
    }

    return Math.min(MAX_MIDDLE_PANE_ZOOM, Math.max(MIN_MIDDLE_PANE_ZOOM, Number(zoom.toFixed(2))));
}

function getEditableDocumentText(document: ContextDocument | null): string {
    if (!document || !isTextDocumentMimeType(document.mimeType)) {
        return '';
    }

    return decodeTextDocument(document.dataBase64);
}

function normalizeDocumentPath(path: string): string {
    const trimmed = path.trim();
    if (!trimmed || trimmed === '/') {
        return '/';
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function resolveScopeOwnerPath(scopeKey: string | null | undefined): string {
    const normalizedScopeKey = typeof scopeKey === 'string' ? scopeKey.trim() : '';
    if (!normalizedScopeKey || normalizedScopeKey === DEFAULT_WORKSPACE_SCOPE_KEY) {
        return DEFAULT_WORKSPACE_SCOPE_KEY;
    }

    return normalizedScopeKey.endsWith('/')
        ? normalizedScopeKey.slice(0, -1) || DEFAULT_WORKSPACE_SCOPE_KEY
        : normalizedScopeKey;
}

function resolveScopeMetadataPath(ownerPath: string): string {
    const normalizedOwnerPath = normalizeDocumentPath(ownerPath);
    return normalizedOwnerPath === DEFAULT_WORKSPACE_SCOPE_KEY
        ? `/${DEFAULT_WORKSPACE_METADATA_FILE_NAME}`
        : `${normalizedOwnerPath}/${DEFAULT_WORKSPACE_METADATA_FILE_NAME}`;
}

function resolveScopeMetadataTempPath(ownerPath: string): string {
    const normalizedOwnerPath = normalizeDocumentPath(ownerPath);
    return normalizedOwnerPath === DEFAULT_WORKSPACE_SCOPE_KEY
        ? `/${DEFAULT_WORKSPACE_METADATA_TEMP_FILE_NAME}`
        : `${normalizedOwnerPath}/${DEFAULT_WORKSPACE_METADATA_TEMP_FILE_NAME}`;
}

function parseJsonObject(content: string, path: string): Record<string, unknown> {
    let parsed: unknown;

    try {
        parsed = JSON.parse(content.replace(/^\uFEFF/, ''));
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse ${path}: ${reason}`);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Invalid folder metadata in ${path}: expected a JSON object.`);
    }

    return { ...parsed };
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    if (typeof btoa === 'function') {
        return btoa(binary);
    }

    return Buffer.from(bytes).toString('base64');
}

function createSyntheticContextNode(input: {
    path: string;
    name: string;
    kind: 'file' | 'directory';
    parentPath: string;
    scopeKey: string;
}): ContextNode {
    return {
        path: input.path,
        name: input.name,
        kind: input.kind,
        parentPath: input.parentPath,
        hasChildren: false,
        scopeKey: input.scopeKey
    };
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isMissingDocumentError(error: unknown): boolean {
    return /节点不存在|node does not exist|not found|enoent|http 404/i.test(getErrorMessage(error));
}

function isRootMetadataBootstrapError(error: unknown): boolean {
    const rootMetadataPath = resolveScopeMetadataPath(DEFAULT_WORKSPACE_SCOPE_KEY)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`invalid folder metadata in ${rootMetadataPath}|failed to parse ${rootMetadataPath}`, 'i')
        .test(getErrorMessage(error));
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

function clearScopeIndexDocumentState(store: {
    scopeIndexPath: string | null;
    scopeIndexDocument: ContextDocument | null;
    scopeIndexViewerId: string | null;
    scopeIndexViewerCapabilities: ActiveViewerCapabilities;
    scopeIndexPaneMode: 'empty' | 'viewer' | 'unsupported';
    scopeIndexDraftContent: string;
    scopeIndexIsSaving: boolean;
}) {
    store.scopeIndexPath = null;
    store.scopeIndexDocument = null;
    store.scopeIndexViewerId = null;
    store.scopeIndexViewerCapabilities = null;
    store.scopeIndexPaneMode = 'empty';
    store.scopeIndexDraftContent = '';
    store.scopeIndexIsSaving = false;
}

function hasNodePath(path: string | null, nodes: ContextNode[]): boolean {
    return !!path && (
        path === '/'
        || nodes.some((node) => node.path === path)
    );
}

function sanitizeNodeHistory(
    history: string[],
    index: number,
    nodes: ContextNode[]
): { history: string[]; index: number } {
    if (history.length === 0) {
        return { history: [], index: -1 };
    }

    const currentPath = index >= 0 ? history[index] : null;
    const nextHistory = history.filter((path) => hasNodePath(path, nodes));
    if (nextHistory.length === 0) {
        return { history: [], index: -1 };
    }

    if (currentPath && nextHistory.includes(currentPath)) {
        return {
            history: nextHistory,
            index: nextHistory.indexOf(currentPath)
        };
    }

    return {
        history: nextHistory,
        index: Math.min(Math.max(index, 0), nextHistory.length - 1)
    };
}

function sanitizeRecentNodePaths(input: unknown, nodes: ContextNode[]): string[] {
    if (!Array.isArray(input)) {
        return [];
    }

    const seen = new Set<string>();
    const paths: string[] = [];
    for (const value of input) {
        if (typeof value !== 'string' || value === '/' || seen.has(value) || !hasNodePath(value, nodes)) {
            continue;
        }

        seen.add(value);
        paths.push(value);
        if (paths.length >= MAX_RECENT_NODE_COUNT) {
            break;
        }
    }

    return paths;
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
        scopeIndexPath: null,
        scopeIndexDocument: null,
        scopeIndexViewerId: null,
        scopeIndexViewerCapabilities: null,
        scopeIndexPaneMode: 'empty',
        scopeIndexDraftContent: '',
        scopeIndexIsSaving: false,
        draftContent: '',
        dirtyPaths: {},
        panelSizes: DEFAULT_PANEL_SIZES,
        middlePaneMode: 'default',
        middlePaneZoom: 1,
        isHydrating: false,
        isSaving: false,
        accessInitialized: false,
        currentError: null,
        activeScopeKey: null,
        activeScopeData: null,
        isMetadataOwnerSelected: false,
        metadataResolutionError: null,
        fileChangeService: markRaw(new FileChangeService()),
        latestFileChange: null,
        activeDiffEntries: [],
        canUndoActiveFile: false,
        canRedoActiveFile: false,
        nodeHistory: [],
        nodeHistoryIndex: -1,
        recentNodePaths: []
    }),
    getters: {
        activeNode(state): ContextNode | null {
            const targetPath = state.selectedNodePath ?? state.activePath;
            return targetPath && state.context
                ? findNodeByPath(state.context.nodes, targetPath) ?? null
                : null;
        },

        canGoBackNodeHistory(state): boolean {
            return state.nodeHistoryIndex > 0;
        },

        canGoForwardNodeHistory(state): boolean {
            return state.nodeHistoryIndex >= 0 && state.nodeHistoryIndex < state.nodeHistory.length - 1;
        },

        /** 当前作用域的通用元数据视图（供扩展点 / 贡献上下文消费，data 由插件解释）。 */
        activeScopeMetadata(state): FolderMetadata | null {
            return state.activeScopeKey
                ? { scopeKey: state.activeScopeKey, data: (state.activeScopeData ?? {}) as unknown as Record<string, unknown> }
                : null;
        },

        recentNodes(state): ContextNode[] {
            if (!state.context) {
                return [];
            }

            return state.recentNodePaths
                .map((path) => findNodeByPath(state.context?.nodes ?? [], path))
                .filter((node): node is ContextNode => node !== null);
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

            return collectMarkdownTree(ownerNode.children ?? []);
        },

        getLinkableMarkdownDocuments(path: string | null): ContextNode[] {
            if (!path) {
                return [];
            }

            const scopePath = resolveScopeOwnerPath(this.activeScopeKey);
            const scopedTree = scopePath === DEFAULT_WORKSPACE_SCOPE_KEY
                ? collectMarkdownTree(this.context?.nodes ?? [])
                : this.collectMarkdownDocuments(scopePath);

            return flattenAllNodes(scopedTree)
                .filter((node) => node.kind === 'file' && node.path !== path)
                .sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'));
        },

        getLinkableReferenceResources(path: string | null): ContextNode[] {
            if (!path) {
                return [];
            }

            const lastSlashIndex = path.lastIndexOf('/');
            const documentDirectory = lastSlashIndex <= 0 ? '/' : path.slice(0, lastSlashIndex);
            const referencesDirectoryPath = documentDirectory === '/'
                ? '/references'
                : `${documentDirectory}/references`;
            const referencesDirectory = this.findNodeByPath(referencesDirectoryPath);
            if (!referencesDirectory || referencesDirectory.kind !== 'directory') {
                return [];
            }

            return flattenAllNodes(referencesDirectory.children ?? [])
                .filter((node) => node.kind === 'file')
                .sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'));
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

        recordFileChange(
            change: { path: string; beforeContent: string; afterContent: string },
            writeResult?: WriteContextDocumentResult
        ) {
            const record = this.fileChangeService.recordChange(change);
            this.applyActiveContent(change.afterContent, change.path);
            this.syncActiveFileChange(change.path);
            if (writeResult) {
                this.applyDocumentWriteMetadata(change.path, writeResult);
            } else {
                void this.refreshDocumentVersion(change.path).catch((error) => {
                    this.currentError = error instanceof Error ? error.message : String(error);
                });
            }
            return record;
        },

        async applyGeneratedDocumentChange(input: { path: string; beforeContent: string; afterContent: string }): Promise<void> {
            const targetPath = input.path.trim();
            if (!targetPath || input.afterContent === input.beforeContent) {
                return;
            }

            if (!this.contextProvider) {
                return;
            }

            if (this.activePath === targetPath && this.dirtyPaths[targetPath]) {
                await this.flushActiveDocument();
            }

            const beforeContent = this.activePath === targetPath
                && this.activeViewerCapabilities?.edit
                ? this.draftContent
                : input.beforeContent;

            if (beforeContent === input.afterContent) {
                return;
            }

            const currentDocument = await this.contextProvider.readDocument(targetPath);
            const currentContent = getEditableDocumentText(currentDocument);
            if (currentContent === input.afterContent) {
                this.recordFileChange({
                    path: targetPath,
                    beforeContent,
                    afterContent: input.afterContent
                }, {
                    updatedAt: currentDocument.updatedAt,
                    version: currentDocument.version
                });
                return;
            }

            const writeResult = await this.contextProvider.writeDocument({
                path: targetPath,
                mimeType: currentDocument.mimeType ?? 'text/markdown',
                dataBase64: encodeTextDocument(input.afterContent),
                expectedVersion: currentDocument.version
            });

            this.recordFileChange({
                path: targetPath,
                beforeContent,
                afterContent: input.afterContent
            }, writeResult);
        },

        setContextProvider(provider: IContextProvider | null) {
            this.contextProvider = provider ? markRaw(provider) : null;
            this.context = null;
            this.nodes = [];
            this.expandedPaths = ['/'];
            this.selectedNodePath = '/';
            clearActiveDocumentState(this);
            clearScopeIndexDocumentState(this);
            this.dirtyPaths = {};
            this.accessInitialized = false;
            this.currentError = null;
            this.activeScopeKey = null;
            this.activeScopeData = null;
            this.isMetadataOwnerSelected = false;
            this.metadataResolutionError = null;
            this.latestFileChange = null;
            this.activeDiffEntries = [];
            this.canUndoActiveFile = false;
            this.canRedoActiveFile = false;
            this.nodeHistory = [];
            this.nodeHistoryIndex = -1;
            this.recentNodePaths = [];
            clearAutoSaveTimer(this);
            clearScopeIndexAutoSaveTimer(this);
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
                this.restorePersistedRecentNodes();
            } catch (error) {
                this.currentError = formatHttpApiError(error);
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
            const sanitizedHistory = sanitizeNodeHistory(this.nodeHistory, this.nodeHistoryIndex, nextNodes);
            this.nodeHistory = sanitizedHistory.history;
            this.nodeHistoryIndex = sanitizedHistory.index;
            if (this.recentNodePaths.length > 0) {
                this.recentNodePaths = sanitizeRecentNodePaths(this.recentNodePaths, nextNodes);
                this.persistRecentNodePaths();
            }

            if (this.activePath && !hasNodePath(this.activePath, nextNodes)) {
                clearActiveDocumentState(this);
                this.syncActiveFileChange(null);
            }

            if (this.scopeIndexPath && !hasNodePath(this.scopeIndexPath, nextNodes)) {
                clearScopeIndexDocumentState(this);
            } else if (this.scopeIndexPath && this.scopeIndexDocument) {
                const refreshedScopeIndexDocument = await this.contextProvider.readDocument(this.scopeIndexPath);
                const refreshedScopeIndexViewer = resolveDocumentViewer(refreshedScopeIndexDocument);
                this.scopeIndexDocument = refreshedScopeIndexDocument;
                this.scopeIndexViewerId = refreshedScopeIndexViewer?.id ?? null;
                this.scopeIndexViewerCapabilities = refreshedScopeIndexViewer?.capabilities ?? null;
                this.scopeIndexPaneMode = refreshedScopeIndexViewer ? 'viewer' : 'unsupported';
                if (!this.dirtyPaths[this.scopeIndexPath]) {
                    this.scopeIndexDraftContent = refreshedScopeIndexViewer?.capabilities.edit
                        && isTextDocumentMimeType(refreshedScopeIndexDocument.mimeType)
                        ? decodeTextDocument(refreshedScopeIndexDocument.dataBase64)
                        : '';
                }
            }

            if (this.selectedNodePath && this.selectedNodePath !== '/' && !hasNodePath(this.selectedNodePath, nextNodes)) {
                this.selectedNodePath = this.activePath && hasNodePath(this.activePath, nextNodes) ? this.activePath : '/';
            }

            if (!this.activePath) {
                this.selectedNodePath = this.selectedNodePath || '/';
                clearActiveDocumentState(this);
                this.syncActiveFileChange(null);
            }

            this.syncActiveScope(this.activePath ?? this.selectedNodePath ?? '/');

            if (!this.activePath && this.isMetadataOwnerSelected) {
                await this.loadScopeIndexDocument(this.selectedNodePath ?? '/');
            }
        },

        async refreshTree() {
            await this.refreshContext();
        },

        async saveFolderMetadata(input: SaveFolderMetadataInput): Promise<void> {
            if (!this.contextProvider) {
                return;
            }

            this.currentError = null;
            const metadataPath = resolveScopeMetadataPath(input.ownerPath);
            let document: ContextDocument | null = null;
            let metadata: Record<string, unknown>;
            try {
                try {
                    document = await this.contextProvider.readDocument(metadataPath);
                    metadata = parseJsonObject(decodeTextDocument(document.dataBase64), metadataPath);
                } catch (error) {
                    if (metadataPath !== resolveScopeMetadataPath(DEFAULT_WORKSPACE_SCOPE_KEY) || !isMissingDocumentError(error)) {
                        throw error;
                    }

                    metadata = { ...DEFAULT_WORKSPACE_METADATA_BOOTSTRAP };

                    try {
                        await this.contextProvider.createNode({
                            name: DEFAULT_WORKSPACE_METADATA_FILE_NAME,
                            kind: 'file'
                        });
                    } catch (createError) {
                        if (!isRootMetadataBootstrapError(createError)) {
                            throw createError;
                        }
                    }
                }

                for (const [key, value] of Object.entries(input.patch)) {
                    metadata[key] = value;
                }

                for (const key of input.clearedFields ?? []) {
                    delete metadata[key];
                }

                await this.contextProvider.writeDocument({
                    path: metadataPath,
                    mimeType: document?.mimeType || 'application/json',
                    dataBase64: encodeTextDocument(`${JSON.stringify(metadata, null, 2)}\n`),
                    expectedVersion: document?.version
                });
                await this.refreshContext();
                this.syncActiveScope(input.ownerPath);
            } catch (error) {
                this.currentError = getErrorMessage(error) || '保存目录元数据失败，请稍后重试。';
                throw error;
            }
        },

        syncActiveScope(path: string) {
            if (!this.context) {
                this.activeScopeKey = null;
                this.activeScopeData = null;
                this.isMetadataOwnerSelected = false;
                this.metadataResolutionError = null;
                return;
            }

            const scopeKey = path === '/'
                ? resolveRootScopeKey(this.context)
                : this.findNodeByPath(path)?.scopeKey ?? null;
            const activeNode = path === '/' ? null : this.findNodeByPath(path);
            const isRootMetadataOwner = path === DEFAULT_WORKSPACE_SCOPE_KEY
                && !!findNodeByPath(this.context.nodes, resolveScopeMetadataPath(DEFAULT_WORKSPACE_SCOPE_KEY));
            this.activeScopeKey = scopeKey;
            this.activeScopeData = scopeKey
                ? (this.context.folderMetadata[scopeKey]?.data ?? null)
                : null;
            this.isMetadataOwnerSelected = isRootMetadataOwner || (activeNode?.kind === 'directory' && activeNode.ownsMetadata === true);
            this.metadataResolutionError = scopeKey && !this.activeScopeData
                ? `No folder metadata was found for scope['${scopeKey}'].`
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
                    ? { selectedNodePath: selectedExactPath, recordHistory: false }
                    : { recordHistory: false }
            );
        },

        persistSelectionSnapshot() {
            const storage = getWorkspaceSelectionSnapshotStorage();
            if (!storage) {
                return;
            }

            const snapshot = sanitizeWorkspaceSelectionSnapshot({
                selectedNodePath: this.selectedNodePath,
                activePath: this.activePath
            });
            if (!snapshot) {
                return;
            }

            try {
                storage.setItem(WORKSPACE_SELECTION_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
            } catch {
                // Ignore storage quota / availability failures and keep workspace usable.
            }
        },

        readPersistedSelectionSnapshot(): WorkspaceSelectionSnapshot | null {
            const storage = getWorkspaceSelectionSnapshotStorage();
            if (!storage) {
                return null;
            }

            try {
                const raw = storage.getItem(WORKSPACE_SELECTION_SNAPSHOT_STORAGE_KEY);
                if (!raw) {
                    return null;
                }

                return sanitizeWorkspaceSelectionSnapshot(JSON.parse(raw));
            } catch {
                return null;
            }
        },

        async restorePersistedSelection() {
            const snapshot = this.readPersistedSelectionSnapshot();
            if (!snapshot) {
                return;
            }

            await this.restoreSelection(snapshot);
        },

        persistRecentNodePaths() {
            const storage = getRecentNodePathsStorage();
            if (!storage) {
                return;
            }

            try {
                storage.setItem(RECENT_NODE_PATHS_STORAGE_KEY, JSON.stringify(this.recentNodePaths));
            } catch {
                // Ignore storage quota / availability failures and keep workspace usable.
            }
        },

        readPersistedRecentNodePaths(): string[] {
            const storage = getRecentNodePathsStorage();
            if (!storage) {
                return [];
            }

            try {
                const raw = storage.getItem(RECENT_NODE_PATHS_STORAGE_KEY);
                if (!raw) {
                    return [];
                }

                return sanitizeRecentNodePaths(JSON.parse(raw), this.nodes);
            } catch {
                return [];
            }
        },

        restorePersistedRecentNodes() {
            this.recentNodePaths = this.readPersistedRecentNodePaths();
        },

        recordNodeHistory(path: string) {
            if (!hasNodePath(path, this.nodes)) {
                return;
            }

            const currentPath = this.nodeHistoryIndex >= 0 ? this.nodeHistory[this.nodeHistoryIndex] : null;
            if (currentPath === path) {
                return;
            }

            const retainedHistory = this.nodeHistoryIndex >= 0
                ? this.nodeHistory.slice(0, this.nodeHistoryIndex + 1)
                : [];
            this.nodeHistory = [...retainedHistory, path];
            this.nodeHistoryIndex = this.nodeHistory.length - 1;
        },

        recordRecentNode(path: string) {
            if (path === '/' || !hasNodePath(path, this.nodes)) {
                return;
            }

            this.recentNodePaths = [
                path,
                ...this.recentNodePaths.filter((candidate) => candidate !== path)
            ].slice(0, MAX_RECENT_NODE_COUNT);
            this.persistRecentNodePaths();
        },

        toggleExpanded(path: string) {
            if (this.expandedPaths.includes(path)) {
                this.expandedPaths = this.expandedPaths.filter((item) => item !== path);
                return;
            }

            this.expandedPaths = [...this.expandedPaths, path];
        },

        async openNode(path: string, options?: { selectedNodePath?: string | null; recordHistory?: boolean }) {
            if (!this.contextProvider) {
                return;
            }

            const shouldRecordHistory = options?.recordHistory !== false;
            if (path === '/') {
                await this.flushScopeIndexDocument();
                await this.flushActiveDocument();
                this.selectedNodePath = '/';
                this.expandedPaths = ensureRootExpanded(this.expandedPaths);
                clearActiveDocumentState(this);
                clearScopeIndexDocumentState(this);
                this.syncActiveFileChange(null);
                this.syncActiveScope('/');
                if (shouldRecordHistory) {
                    this.recordNodeHistory('/');
                }
                await this.loadScopeIndexDocument('/');
                return;
            }

            const node = this.findNodeByPath(path);
            if (!node) {
                return;
            }

            const selectedNodePath = options?.selectedNodePath ?? path;
            if (node.kind === 'directory') {
                await this.flushScopeIndexDocument();
                await this.flushActiveDocument();
                this.selectedNodePath = selectedNodePath;
                clearActiveDocumentState(this);
                clearScopeIndexDocumentState(this);
                this.syncActiveFileChange(null);
                this.syncActiveScope(selectedNodePath);
                if (shouldRecordHistory) {
                    this.recordNodeHistory(path);
                }
                if (node.ownsMetadata || hasDirectoryIndexNode(this.nodes, selectedNodePath)) {
                    await this.loadScopeIndexDocument(selectedNodePath);
                }
                this.recordRecentNode(path);
                return;
            }

            await this.flushScopeIndexDocument();
            await this.flushActiveDocument();
            clearScopeIndexDocumentState(this);
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
            this.syncActiveScope(selectedNodePath);
            if (shouldRecordHistory) {
                this.recordNodeHistory(path);
            }
            this.recordRecentNode(path);
        },

        async loadScopeIndexDocument(ownerPath: string): Promise<boolean> {
            if (!this.contextProvider) {
                return false;
            }

            const indexNode = findDefaultScopeIndexNode(this.nodes, ownerPath);
            if (!indexNode) {
                clearScopeIndexDocumentState(this);
                return false;
            }

            this.scopeIndexPath = indexNode.path;
            const document = await this.contextProvider.readDocument(indexNode.path);
            const viewer = resolveDocumentViewer(document);
            this.scopeIndexDocument = document;
            this.scopeIndexViewerId = viewer?.id ?? null;
            this.scopeIndexViewerCapabilities = viewer?.capabilities ?? null;
            this.scopeIndexPaneMode = viewer ? 'viewer' : 'unsupported';
            this.scopeIndexDraftContent = viewer?.capabilities.edit && isTextDocumentMimeType(document.mimeType)
                ? decodeTextDocument(document.dataBase64)
                : '';
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [indexNode.path]: false
            };
            return true;
        },

        updateScopeIndexDocument(content: string) {
            if (!this.scopeIndexPath || !this.scopeIndexViewerCapabilities?.edit) {
                return;
            }

            this.scopeIndexDraftContent = content;
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [this.scopeIndexPath]: getEditableDocumentText(this.scopeIndexDocument) !== content
            };
            scheduleScopeIndexAutoSave(this);
        },

        async flushScopeIndexDocument() {
            if (
                !this.contextProvider
                || !this.scopeIndexPath
                || !this.scopeIndexDocument
                || !this.scopeIndexViewerCapabilities?.edit
                || !this.dirtyPaths[this.scopeIndexPath]
                || this.scopeIndexIsSaving
            ) {
                return;
            }

            clearScopeIndexAutoSaveTimer(this);
            const activePath = this.scopeIndexPath;
            const activeDocument = this.scopeIndexDocument;
            const savedContent = this.scopeIndexDraftContent;
            this.scopeIndexIsSaving = true;
            try {
                this.currentError = null;
                const writeResult = await this.contextProvider.writeDocument({
                    path: activePath,
                    mimeType: activeDocument.mimeType,
                    dataBase64: encodeTextDocument(savedContent),
                    expectedVersion: activeDocument.version
                });
                const updatedAt = writeResult.updatedAt ?? activeDocument.updatedAt ?? Date.now();
                this.nodes = this.nodes.map((node) => node.path === activePath
                    ? { ...node, updatedAt }
                    : node);

                const hasNewerLocalDraft = this.scopeIndexDraftContent !== savedContent;
                this.scopeIndexDocument = {
                    ...activeDocument,
                    dataBase64: encodeTextDocument(savedContent),
                    updatedAt,
                    version: writeResult.version ?? activeDocument.version
                };
                this.dirtyPaths = {
                    ...this.dirtyPaths,
                    [activePath]: hasNewerLocalDraft
                };

                if (hasNewerLocalDraft) {
                    scheduleScopeIndexAutoSave(this);
                }
            } catch (error) {
                this.currentError = formatHttpApiError(error);
                throw error;
            } finally {
                this.scopeIndexIsSaving = false;
            }
        },

        async goBackNodeHistory() {
            while (this.nodeHistoryIndex > 0) {
                const nextIndex = this.nodeHistoryIndex - 1;
                const path = this.nodeHistory[nextIndex];
                if (!path || !hasNodePath(path, this.nodes)) {
                    const sanitizedHistory = sanitizeNodeHistory(this.nodeHistory, this.nodeHistoryIndex, this.nodes);
                    this.nodeHistory = sanitizedHistory.history;
                    this.nodeHistoryIndex = sanitizedHistory.index;
                    continue;
                }

                this.nodeHistoryIndex = nextIndex;
                await this.openNode(path, { recordHistory: false });
                return;
            }
        },

        async goForwardNodeHistory() {
            while (this.nodeHistoryIndex >= 0 && this.nodeHistoryIndex < this.nodeHistory.length - 1) {
                const nextIndex = this.nodeHistoryIndex + 1;
                const path = this.nodeHistory[nextIndex];
                if (!path || !hasNodePath(path, this.nodes)) {
                    const sanitizedHistory = sanitizeNodeHistory(this.nodeHistory, this.nodeHistoryIndex, this.nodes);
                    this.nodeHistory = sanitizedHistory.history;
                    this.nodeHistoryIndex = sanitizedHistory.index;
                    continue;
                }

                this.nodeHistoryIndex = nextIndex;
                await this.openNode(path, { recordHistory: false });
                return;
            }
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
            const canFlush = !!(
                this.contextProvider
                && this.activePath
                && this.activeDocument
                && this.activeViewerCapabilities?.edit
                && this.dirtyPaths[this.activePath]
                && !this.isSaving
            );
            if (!canFlush) {
                return;
            }

            clearAutoSaveTimer(this);
            const contextProvider = this.contextProvider!;
            const activePath = this.activePath!;
            const activeDocument = this.activeDocument!;
            const savedContent = this.draftContent;
            let shouldScheduleNextSave = false;
            this.isSaving = true;
            try {
                this.currentError = null;
                const writeResult = await contextProvider.writeDocument({
                    path: activePath,
                    mimeType: activeDocument.mimeType,
                    dataBase64: encodeTextDocument(savedContent),
                    expectedVersion: activeDocument.version
                });
                shouldScheduleNextSave = this.applyActiveDocumentWriteResult({
                    path: activePath,
                    document: activeDocument,
                    savedContent,
                    writeResult
                });
            } catch (error) {
                this.currentError = formatHttpApiError(error);
                throw error;
            } finally {
                this.isSaving = false;
                if (shouldScheduleNextSave) {
                    scheduleAutoSave(this);
                }
            }
        },

        async persistPastedMarkdownImage(input: {
            documentPath: string;
            mimeType: string;
            bytes: Uint8Array;
        }): Promise<{ imagePath: string; markdown: string }> {
            if (!this.contextProvider) {
                throw new Error('Context provider is not available.');
            }

            const documentDirectory = getParentPath(input.documentPath);
            const referencesDirectoryPath = documentDirectory === '/' ? '/references' : `${documentDirectory}/references`;
            const referencesNode = this.findNodeByPath(referencesDirectoryPath);
            const parentScopeKey = this.findNodeByPath(documentDirectory)?.scopeKey
                ?? this.findNodeByPath(input.documentPath)?.scopeKey
                ?? this.activeScopeKey
                ?? DEFAULT_WORKSPACE_SCOPE_KEY;

            if (!referencesNode) {
                await this.contextProvider.createNode({
                    parentPath: documentDirectory === '/' ? undefined : documentDirectory,
                    name: 'references',
                    kind: 'directory'
                });
                this.nodes = [
                    ...this.nodes,
                    createSyntheticContextNode({
                        path: referencesDirectoryPath,
                        name: 'references',
                        kind: 'directory',
                        parentPath: documentDirectory,
                        scopeKey: parentScopeKey
                    })
                ];
            }

            const siblingPaths = new Set(
                this.nodes
                    .filter((node) => node.parentPath === referencesDirectoryPath)
                    .map((node) => node.path)
            );
            const imagePath = buildPastedMarkdownImagePath(input.documentPath, input.mimeType, siblingPaths);
            const imageName = imagePath.split('/').pop() ?? 'pasted-image';

            if (!this.findNodeByPath(imagePath)) {
                await this.contextProvider.createNode({
                    parentPath: referencesDirectoryPath,
                    name: imageName,
                    kind: 'file'
                });
                this.nodes = [
                    ...this.nodes,
                    createSyntheticContextNode({
                        path: imagePath,
                        name: imageName,
                        kind: 'file',
                        parentPath: referencesDirectoryPath,
                        scopeKey: parentScopeKey
                    })
                ];
            }

            const writeResult = await this.contextProvider.writeDocument({
                path: imagePath,
                mimeType: input.mimeType,
                dataBase64: bytesToBase64(input.bytes)
            });
            const updatedAt = writeResult.updatedAt ?? Date.now();
            this.nodes = this.nodes.map((node) => node.path === imagePath
                ? { ...node, updatedAt }
                : node);

            return {
                imagePath,
                markdown: buildRelativeMarkdownImageReference(input.documentPath, imagePath)
            };
        },

        async uploadMarkdownLinkResource(input: {
            documentPath: string;
            fileName: string;
            mimeType: string;
            bytes: Uint8Array;
        }): Promise<{ resourcePath: string }> {
            if (!this.contextProvider) {
                throw new Error('Context provider is not available.');
            }

            const documentDirectory = getParentPath(input.documentPath);
            const referencesDirectoryPath = documentDirectory === '/' ? '/references' : `${documentDirectory}/references`;
            const referencesNode = this.findNodeByPath(referencesDirectoryPath);

            if (!referencesNode) {
                await this.contextProvider.createNode({
                    parentPath: documentDirectory === '/' ? undefined : documentDirectory,
                    name: 'references',
                    kind: 'directory'
                });
            }

            const normalizedFileName = normalizeCreatedFileName(input.fileName, 'file');
            await this.contextProvider.createNode({
                parentPath: referencesDirectoryPath,
                name: normalizedFileName,
                kind: 'file'
            });

            const resourcePath = `${referencesDirectoryPath}/${normalizedFileName}`;
            await this.contextProvider.writeDocument({
                path: resourcePath,
                mimeType: input.mimeType || 'application/octet-stream',
                dataBase64: bytesToBase64(input.bytes)
            });

            await this.refreshTree();

            return { resourcePath };
        },

        async createImportedDocument(input: {
            path: string;
            content: string;
        }): Promise<void> {
            if (!this.contextProvider) {
                throw new Error('Context provider is not available.');
            }

            const normalizedPath = normalizeDocumentPath(input.path);
            const parentPath = getParentPath(normalizedPath);
            const fileName = normalizeCreatedFileName(normalizedPath.split('/').pop() ?? 'imported.md', 'file');
            const targetPath = parentPath === '/' ? `/${fileName}` : `${parentPath}/${fileName}`;

            if (!this.findNodeByPath(targetPath)) {
                await this.contextProvider.createNode({
                    parentPath: parentPath === '/' ? undefined : parentPath,
                    name: fileName,
                    kind: 'file'
                });
            }

            await this.contextProvider.writeDocument({
                path: targetPath,
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument(input.content)
            });

            await this.refreshTree();
        },

        async createImportedReferenceResource(input: {
            ownerDocumentPath: string;
            fileName: string;
            content: string;
        }): Promise<{ resourcePath: string; relativePathFromOwner: string }> {
            if (!this.contextProvider) {
                throw new Error('Context provider is not available.');
            }

            const ownerDocumentPath = normalizeDocumentPath(input.ownerDocumentPath);
            const documentDirectory = getParentPath(ownerDocumentPath);
            const referencesDirectoryPath = documentDirectory === '/' ? '/references' : `${documentDirectory}/references`;
            if (!this.findNodeByPath(referencesDirectoryPath)) {
                await this.contextProvider.createNode({
                    parentPath: documentDirectory === '/' ? undefined : documentDirectory,
                    name: 'references',
                    kind: 'directory'
                });
            }

            const normalizedFileName = normalizeCreatedFileName(input.fileName, 'file');
            const resourcePath = `${referencesDirectoryPath}/${normalizedFileName}`;
            if (!this.findNodeByPath(resourcePath)) {
                await this.contextProvider.createNode({
                    parentPath: referencesDirectoryPath,
                    name: normalizedFileName,
                    kind: 'file'
                });
            }

            await this.contextProvider.writeDocument({
                path: resourcePath,
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument(input.content)
            });

            await this.refreshTree();

            return {
                resourcePath,
                relativePathFromOwner: buildRelativeMarkdownLinkPath(ownerDocumentPath, resourcePath)
            };
        },

        async createNode(input: CreateContextNodeInput) {
            if (!this.contextProvider) {
                return;
            }

            await this.flushScopeIndexDocument();
            const createdNode = await this.contextProvider.createNode({
                ...input,
                name: normalizeCreatedFileName(input.name, input.kind)
            });
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
            this.syncActiveScope(createdNode.path);
        },

        async enableDirectoryMetadata(ownerPath: string) {
            if (!this.contextProvider) {
                return;
            }

            const normalizedOwnerPath = normalizeDocumentPath(ownerPath);
            if (normalizedOwnerPath === '/') {
                return;
            }

            const ownerNode = this.findNodeByPath(normalizedOwnerPath);
            if (!ownerNode || ownerNode.kind !== 'directory' || ownerNode.ownsMetadata) {
                return;
            }

            await this.flushScopeIndexDocument();
            const finalMetadataPath = resolveScopeMetadataPath(normalizedOwnerPath);
            const tempMetadataPath = resolveScopeMetadataTempPath(normalizedOwnerPath);
            const metadataDocument = encodeTextDocument(`${JSON.stringify(DEFAULT_WORKSPACE_METADATA_BOOTSTRAP, null, 2)}\n`);

            try {
                await this.contextProvider.readDocument(finalMetadataPath);
                await this.refreshTree();
                await this.openNode(normalizedOwnerPath);
                return;
            } catch {
                // Continue creating the metadata file when the final file does not exist.
            }

            let tempMetadataExists = false;
            try {
                await this.contextProvider.readDocument(tempMetadataPath);
                tempMetadataExists = true;
            } catch {
                tempMetadataExists = false;
            }

            if (!tempMetadataExists) {
                await this.contextProvider.createNode({
                    parentPath: normalizedOwnerPath,
                    name: DEFAULT_WORKSPACE_METADATA_TEMP_FILE_NAME,
                    kind: 'file'
                });
            }
            await this.contextProvider.writeDocument({
                path: tempMetadataPath,
                mimeType: 'application/json',
                dataBase64: metadataDocument
            });
            await this.contextProvider.renameNode({
                path: tempMetadataPath,
                name: DEFAULT_WORKSPACE_METADATA_FILE_NAME
            });
            await this.refreshTree();
            await this.openNode(normalizedOwnerPath);
        },

        async deleteNode(path: string) {
            if (!this.contextProvider || !path || path === '/') {
                return;
            }

            const fallbackPath = getParentPath(path);
            await this.flushScopeIndexDocument();
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
            this.syncActiveScope(fallbackPath);
        },

        async renameNode(input: { path: string; name: string }) {
            if (!this.contextProvider || !input.path || input.path === '/') {
                return;
            }

            await this.flushScopeIndexDocument();
            await this.flushActiveDocument();
            const currentNode = this.findNodeByPath(input.path);
            const renamedNode = await this.contextProvider.renameNode({
                ...input,
                name: normalizeRenamedFileName(input.name, currentNode?.kind ?? 'file')
            });

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
            this.syncActiveScope(nextSelectedPath || '/');
        },

        async moveNode(input: { path: string; targetParentPath?: string }): Promise<{ error?: string }> {
            if (!this.contextProvider || !input.path || input.path === '/') {
                return {};
            }

            await this.flushScopeIndexDocument();
            await this.flushActiveDocument();
            let movedNode;
            try {
                movedNode = await this.contextProvider.moveNode(input);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.currentError = message;
                return { error: message };
            }

            if (
                movedNode.kind === 'file'
                && (input.path.endsWith('.md') || input.path.endsWith('.markdown'))
            ) {
                const fromDir = input.path.slice(0, Math.max(0, input.path.lastIndexOf('/'))) || '/';
                const toDir = movedNode.path.slice(0, Math.max(0, movedNode.path.lastIndexOf('/'))) || '/';
                if (fromDir !== toDir) {
                    try {
                        const doc = await this.contextProvider.readDocument(movedNode.path);
                        if (isTextDocumentMimeType(doc.mimeType)) {
                            const originalContent = decodeTextDocument(doc.dataBase64);
                            const rewritten = rewriteOutgoingLinks(originalContent, fromDir, toDir);
                            if (rewritten !== originalContent) {
                                await this.contextProvider.writeDocument({
                                    path: movedNode.path,
                                    mimeType: doc.mimeType ?? 'text/markdown',
                                    dataBase64: encodeTextDocument(rewritten),
                                    expectedVersion: doc.version
                                });
                            }
                        }
                    } catch {
                        // Link rewrite is best-effort; don't block the move on failure.
                    }
                }
            }

            const previousActivePath = this.activePath;
            const previousSelectedPath = this.selectedNodePath;
            const nextActivePath = remapPath(previousActivePath, input.path, movedNode.path);
            const nextSelectedPath = remapPath(previousSelectedPath, input.path, movedNode.path);

            this.dirtyPaths = Object.fromEntries(
                Object.entries(this.dirtyPaths).map(([path, dirty]) => [remapPath(path, input.path, movedNode.path) || path, dirty])
            );

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

            const targetParentPath = input.targetParentPath && input.targetParentPath !== '/'
                ? input.targetParentPath
                : '/';
            if (!this.expandedPaths.includes(targetParentPath)) {
                this.expandedPaths = ensureRootExpanded([...this.expandedPaths, targetParentPath]);
            }

            this.selectedNodePath = nextSelectedPath;

            if (nextActivePath && this.nodes.some((node) => node.path === nextActivePath)) {
                await this.openNode(nextActivePath);
                return {};
            }

            if (nextSelectedPath && this.nodes.some((node) => node.path === nextSelectedPath)) {
                await this.openNode(nextSelectedPath);
                return {};
            }

            clearActiveDocumentState(this);
            this.syncActiveFileChange(null);
            this.syncActiveScope(resolveExistingPath(nextSelectedPath || targetParentPath, this.nodes) || '/');
            return {};
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
            this.applyDocumentWriteMetadata(this.activePath, result.writeResult);
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
            this.applyDocumentWriteMetadata(this.activePath, result.writeResult);
            this.syncActiveFileChange(this.activePath);
        },

        async reloadActiveDocumentFromDisk() {
            if (!this.contextProvider || !this.activePath || !this.activeDocument) {
                return;
            }

            const path = this.activePath;
            const refreshedDocument = await this.contextProvider.readDocument(path);
            const refreshedViewer = resolveDocumentViewer(refreshedDocument);

            this.activeDocument = refreshedDocument;
            this.activeViewerId = refreshedViewer?.id ?? null;
            this.activeViewerCapabilities = refreshedViewer?.capabilities ?? null;
            this.activePaneMode = refreshedViewer ? 'viewer' : 'unsupported';
            this.draftContent = refreshedViewer?.capabilities.edit && isTextDocumentMimeType(refreshedDocument.mimeType)
                ? decodeTextDocument(refreshedDocument.dataBase64)
                : '';
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [path]: false
            };
            this.syncActiveFileChange(path);
            this.applyDocumentWriteMetadata(path, {
                updatedAt: refreshedDocument.updatedAt,
                version: refreshedDocument.version
            });
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

        applyDocumentWriteMetadata(path: string, writeResult: WriteContextDocumentResult) {
            const updatedAt = writeResult.updatedAt ?? Date.now();
            this.nodes = this.nodes.map((node) => node.path === path
                ? { ...node, updatedAt }
                : node);

            if (this.activePath !== path || !this.activeDocument) {
                return;
            }

            this.activeDocument = {
                ...this.activeDocument,
                updatedAt,
                version: writeResult.version ?? this.activeDocument.version
            };
        },

        setPanelSizes(sizes: [number, number, number]) {
            this.panelSizes = normalizeSizes(sizes);
            this.middlePaneMode = 'default';
        },

        setMiddlePaneMode(mode: 'default' | 'maximized') {
            this.middlePaneMode = mode;
            this.panelSizes = mode === 'maximized' ? [...MAXIMIZED_PANEL_SIZES] : [...DEFAULT_PANEL_SIZES];
        },

        toggleMiddlePaneExpanded() {
            this.setMiddlePaneMode(this.middlePaneMode === 'maximized' ? 'default' : 'maximized');
        },

        setMiddlePaneZoom(zoom: number) {
            this.middlePaneZoom = normalizeMiddlePaneZoom(zoom);
        },

        stepMiddlePaneZoom(delta: number) {
            const direction = delta === 0 ? 0 : (delta > 0 ? 1 : -1);
            this.setMiddlePaneZoom(this.middlePaneZoom + direction * MIDDLE_PANE_ZOOM_STEP);
        },

        resetMiddlePaneZoom() {
            this.middlePaneZoom = 1;
        },

        applyActiveDocumentWriteResult(input: {
            path: string;
            document: ContextDocument;
            savedContent: string;
            writeResult: WriteContextDocumentResult;
        }): boolean {
            const updatedAt = input.writeResult.updatedAt ?? input.document.updatedAt ?? Date.now();
            this.nodes = this.nodes.map((node) => node.path === input.path
                ? { ...node, updatedAt }
                : node);

            if (this.activePath !== input.path) {
                this.dirtyPaths = {
                    ...this.dirtyPaths,
                    [input.path]: false
                };
                return false;
            }

            const hasNewerLocalDraft = this.draftContent !== input.savedContent;
            this.activeDocument = {
                ...input.document,
                dataBase64: encodeTextDocument(input.savedContent),
                updatedAt,
                version: input.writeResult.version ?? input.document.version
            };
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [input.path]: hasNewerLocalDraft
            };

            return hasNewerLocalDraft;
        }
    }
});

const autoSaveTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();
const scopeIndexAutoSaveTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();

function clearAutoSaveTimer(store: object) {
    const timer = autoSaveTimers.get(store);
    if (timer) {
        clearTimeout(timer);
        autoSaveTimers.delete(store);
    }
}

function clearScopeIndexAutoSaveTimer(store: object) {
    const timer = scopeIndexAutoSaveTimers.get(store);
    if (timer) {
        clearTimeout(timer);
        scopeIndexAutoSaveTimers.delete(store);
    }
}

function scheduleAutoSave(store: ReturnType<typeof useDocumentWorkspaceStore>) {
    clearAutoSaveTimer(store);
    const timer = setTimeout(() => {
        void store.flushActiveDocument();
    }, AUTO_SAVE_DELAY_MS);
    autoSaveTimers.set(store, timer);
}

function scheduleScopeIndexAutoSave(store: ReturnType<typeof useDocumentWorkspaceStore>) {
    clearScopeIndexAutoSaveTimer(store);
    const timer = setTimeout(() => {
        void store.flushScopeIndexDocument();
    }, AUTO_SAVE_DELAY_MS);
    scopeIndexAutoSaveTimers.set(store, timer);
}
