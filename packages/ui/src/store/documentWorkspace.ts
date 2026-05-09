import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import {
    DEFAULT_WORKSPACE_AGENT_KEY,
    DEFAULT_SCOPED_AGENT_CONFIG,
    type AgentToolBinding,
    type ContextDocument,
    type ContextNode,
    type CreateContextNodeInput,
    type AgentInheritanceMode,
    type IContextProvider,
    type ResolvedAgentConfig,
    type WorkspaceContext,
    type WriteContextDocumentResult,
    decodeTextDocument,
    encodeTextDocument,
    isTextDocumentMimeType
} from '@packages/core/src';
import { buildLineDiffEntries, FileChangeService, type FileChangeRecord, type LineDiffEntry } from '../services/FileChangeService';
import { resolveDocumentViewer } from '../document-viewers';
import { formatHttpApiError } from '../utils/formatHttpApiError';
import { buildPastedMarkdownImagePath, buildRelativeMarkdownImageReference } from '../utils/markdownDocument';
import { normalizeCreatedFileName, normalizeRenamedFileName } from '../utils/contextNodePresentation';

type ActiveViewerCapabilities = {
    view: boolean;
    edit: boolean;
} | null;

export type SaveAgentConfigInput = {
    ownerPath: string;
    patch: {
        description?: string;
        instructions?: string;
        modelProviderName?: string;
        modelName?: string;
        inheritance?: AgentInheritanceMode;
        tools?: AgentToolBinding[];
        inheritTools?: boolean;
    };
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
    agentIndexPath: string | null;
    agentIndexDocument: ContextDocument | null;
    agentIndexViewerId: string | null;
    agentIndexViewerCapabilities: ActiveViewerCapabilities;
    agentIndexPaneMode: 'empty' | 'viewer' | 'unsupported';
    agentIndexDraftContent: string;
    agentIndexIsSaving: boolean;
    draftContent: string;
    dirtyPaths: Record<string, boolean>;
    panelSizes: [number, number, number];
    middlePaneMode: 'default' | 'maximized';
    middlePaneZoom: number;
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
    nodeHistory: string[];
    nodeHistoryIndex: number;
}

const AUTO_SAVE_DELAY_MS = 60_000;
const DEFAULT_PANEL_SIZES: [number, number, number] = [20, 50, 30];
const MAXIMIZED_PANEL_SIZES: [number, number, number] = [20, 80, 0];
const MIN_MIDDLE_PANE_ZOOM = 1;
const MAX_MIDDLE_PANE_ZOOM = 1.8;
const MIDDLE_PANE_ZOOM_STEP = 0.1;

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

export function getDefaultAgentIndexPath(ownerPath: string): string {
    return ownerPath === '/' ? '/index.md' : `${ownerPath.replace(/\/$/u, '')}/index.md`;
}

export function findDefaultAgentIndexNode(nodes: ContextNode[], ownerPath: string): ContextNode | null {
    const indexPath = getDefaultAgentIndexPath(ownerPath);
    const node = findNodeByPath(nodes, indexPath);
    return node?.kind === 'file' && node.name === 'index.md' ? node : null;
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

function getAgentConfigPath(ownerPath: string): string {
    const normalizedOwnerPath = normalizeDocumentPath(ownerPath);
    return normalizedOwnerPath === '/' ? '/.agent.json' : `${normalizedOwnerPath}/.agent.json`;
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
        throw new Error(`Invalid agent config in ${path}: expected a JSON object.`);
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
    agentKey: string;
}): ContextNode {
    return {
        path: input.path,
        name: input.name,
        kind: input.kind,
        parentPath: input.parentPath,
        hasChildren: false,
        agentKey: input.agentKey
    };
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isMissingDocumentError(error: unknown): boolean {
    return /节点不存在|node does not exist|not found|enoent|http 404/i.test(getErrorMessage(error));
}

function isRootAgentConfigBootstrapError(error: unknown): boolean {
    return /invalid agent config in \/.agent\.json|failed to parse \/.agent\.json/i.test(getErrorMessage(error));
}

function patchOptionalStringField(
    target: Record<string, unknown>,
    patch: Record<string, unknown>,
    fieldName: 'description' | 'instructions' | 'modelProviderName' | 'modelName'
) {
    if (!Object.prototype.hasOwnProperty.call(patch, fieldName)) {
        return;
    }

    const value = typeof patch[fieldName] === 'string' ? patch[fieldName].trim() : '';
    if (value) {
        target[fieldName] = value;
        return;
    }

    delete target[fieldName];
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

function clearAgentIndexDocumentState(store: {
    agentIndexPath: string | null;
    agentIndexDocument: ContextDocument | null;
    agentIndexViewerId: string | null;
    agentIndexViewerCapabilities: ActiveViewerCapabilities;
    agentIndexPaneMode: 'empty' | 'viewer' | 'unsupported';
    agentIndexDraftContent: string;
    agentIndexIsSaving: boolean;
}) {
    store.agentIndexPath = null;
    store.agentIndexDocument = null;
    store.agentIndexViewerId = null;
    store.agentIndexViewerCapabilities = null;
    store.agentIndexPaneMode = 'empty';
    store.agentIndexDraftContent = '';
    store.agentIndexIsSaving = false;
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
        agentIndexPath: null,
        agentIndexDocument: null,
        agentIndexViewerId: null,
        agentIndexViewerCapabilities: null,
        agentIndexPaneMode: 'empty',
        agentIndexDraftContent: '',
        agentIndexIsSaving: false,
        draftContent: '',
        dirtyPaths: {},
        panelSizes: DEFAULT_PANEL_SIZES,
        middlePaneMode: 'default',
        middlePaneZoom: 1,
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
        canRedoActiveFile: false,
        nodeHistory: [],
        nodeHistoryIndex: -1
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

            const scopePath = this.activeAgent?.scopePath ?? '/';
            const scopedTree = scopePath === '/'
                ? collectMarkdownTree(this.context?.nodes ?? [])
                : this.collectMarkdownDocuments(scopePath);

            return flattenAllNodes(scopedTree)
                .filter((node) => node.kind === 'file' && node.path !== path)
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
            clearAgentIndexDocumentState(this);
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
            this.nodeHistory = [];
            this.nodeHistoryIndex = -1;
            clearAutoSaveTimer(this);
            clearAgentIndexAutoSaveTimer(this);
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

            if (this.activePath && !hasNodePath(this.activePath, nextNodes)) {
                clearActiveDocumentState(this);
                this.syncActiveFileChange(null);
            }

            if (this.agentIndexPath && !hasNodePath(this.agentIndexPath, nextNodes)) {
                clearAgentIndexDocumentState(this);
            } else if (this.agentIndexPath && this.agentIndexDocument) {
                const refreshedAgentIndexDocument = await this.contextProvider.readDocument(this.agentIndexPath);
                const refreshedAgentIndexViewer = resolveDocumentViewer(refreshedAgentIndexDocument);
                this.agentIndexDocument = refreshedAgentIndexDocument;
                this.agentIndexViewerId = refreshedAgentIndexViewer?.id ?? null;
                this.agentIndexViewerCapabilities = refreshedAgentIndexViewer?.capabilities ?? null;
                this.agentIndexPaneMode = refreshedAgentIndexViewer ? 'viewer' : 'unsupported';
                if (!this.dirtyPaths[this.agentIndexPath]) {
                    this.agentIndexDraftContent = refreshedAgentIndexViewer?.capabilities.edit
                        && isTextDocumentMimeType(refreshedAgentIndexDocument.mimeType)
                        ? decodeTextDocument(refreshedAgentIndexDocument.dataBase64)
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

            this.syncActiveAgent(this.activePath ?? this.selectedNodePath ?? '/');

            if (!this.activePath && this.isAgentOwnerSelected) {
                await this.loadAgentIndexDocument(this.selectedNodePath ?? '/');
            }
        },

        async refreshTree() {
            await this.refreshContext();
        },

        async saveAgentConfig(input: SaveAgentConfigInput): Promise<void> {
            if (!this.contextProvider) {
                return;
            }

            this.currentError = null;
            const configPath = getAgentConfigPath(input.ownerPath);
            let document: ContextDocument | null = null;
            let config: Record<string, unknown>;
            try {
                try {
                    document = await this.contextProvider.readDocument(configPath);
                    config = parseJsonObject(decodeTextDocument(document.dataBase64), configPath);
                } catch (error) {
                    if (configPath !== '/.agent.json' || !isMissingDocumentError(error)) {
                        throw error;
                    }

                    config = { ...DEFAULT_SCOPED_AGENT_CONFIG };

                    try {
                        await this.contextProvider.createNode({
                            name: '.agent.json',
                            kind: 'file'
                        });
                    } catch (createError) {
                        if (!isRootAgentConfigBootstrapError(createError)) {
                            throw createError;
                        }
                    }
                }
                const patch = input.patch as Record<string, unknown>;

                patchOptionalStringField(config, patch, 'description');
                patchOptionalStringField(config, patch, 'instructions');
                patchOptionalStringField(config, patch, 'modelProviderName');
                patchOptionalStringField(config, patch, 'modelName');

                if (Object.prototype.hasOwnProperty.call(patch, 'inheritance')) {
                    const inheritance = patch.inheritance;
                    if (inheritance === 'override') {
                        config.inheritance = inheritance;
                    } else {
                        delete config.inheritance;
                    }
                }

                if (Object.prototype.hasOwnProperty.call(patch, 'inheritTools') && patch.inheritTools === true) {
                    delete config.tools;
                } else if (Object.prototype.hasOwnProperty.call(patch, 'tools')) {
                    config.tools = normalizeToolBindings(patch.tools);
                }

                await this.contextProvider.writeDocument({
                    path: configPath,
                    mimeType: document?.mimeType || 'application/json',
                    dataBase64: encodeTextDocument(`${JSON.stringify(config, null, 2)}\n`),
                    expectedVersion: document?.version
                });
                await this.refreshContext();
                this.syncActiveAgent(input.ownerPath);
            } catch (error) {
                this.currentError = getErrorMessage(error) || '保存 Agent 配置失败，请稍后重试。';
                throw error;
            }
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
            const isRootAgentOwner = path === '/' && !!findNodeByPath(this.context.nodes, '/.agent.json');
            this.activeAgentKey = agentKey;
            this.activeAgent = agentKey ? this.context.agentConfigs[agentKey] ?? null : null;
            this.isAgentOwnerSelected = isRootAgentOwner || (activeNode?.kind === 'directory' && activeNode.isAgentOwner === true);
            this.agentResolutionError = agentKey && !this.activeAgent
                ? `No Agent configuration was found for agentConfigs['${agentKey}'].`
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
                await this.flushAgentIndexDocument();
                this.selectedNodePath = '/';
                this.expandedPaths = ensureRootExpanded(this.expandedPaths);
                clearActiveDocumentState(this);
                clearAgentIndexDocumentState(this);
                this.syncActiveFileChange(null);
                this.syncActiveAgent('/');
                if (shouldRecordHistory) {
                    this.recordNodeHistory('/');
                }
                await this.loadAgentIndexDocument('/');
                return;
            }

            const node = this.findNodeByPath(path);
            if (!node) {
                return;
            }

            const selectedNodePath = options?.selectedNodePath ?? path;
            if (node.kind === 'directory') {
                await this.flushAgentIndexDocument();
                this.selectedNodePath = selectedNodePath;
                clearActiveDocumentState(this);
                clearAgentIndexDocumentState(this);
                this.syncActiveFileChange(null);
                this.syncActiveAgent(selectedNodePath);
                if (shouldRecordHistory) {
                    this.recordNodeHistory(path);
                }
                if (node.isAgentOwner) {
                    await this.loadAgentIndexDocument(selectedNodePath);
                }
                return;
            }

            await this.flushAgentIndexDocument();
            await this.flushActiveDocument();
            clearAgentIndexDocumentState(this);
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
            if (shouldRecordHistory) {
                this.recordNodeHistory(path);
            }
        },

        async loadAgentIndexDocument(ownerPath: string): Promise<boolean> {
            if (!this.contextProvider) {
                return false;
            }

            const indexNode = findDefaultAgentIndexNode(this.nodes, ownerPath);
            if (!indexNode) {
                clearAgentIndexDocumentState(this);
                return false;
            }

            this.agentIndexPath = indexNode.path;
            const document = await this.contextProvider.readDocument(indexNode.path);
            const viewer = resolveDocumentViewer(document);
            this.agentIndexDocument = document;
            this.agentIndexViewerId = viewer?.id ?? null;
            this.agentIndexViewerCapabilities = viewer?.capabilities ?? null;
            this.agentIndexPaneMode = viewer ? 'viewer' : 'unsupported';
            this.agentIndexDraftContent = viewer?.capabilities.edit && isTextDocumentMimeType(document.mimeType)
                ? decodeTextDocument(document.dataBase64)
                : '';
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [indexNode.path]: false
            };
            return true;
        },

        updateAgentIndexDocument(content: string) {
            if (!this.agentIndexPath || !this.agentIndexViewerCapabilities?.edit) {
                return;
            }

            this.agentIndexDraftContent = content;
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [this.agentIndexPath]: getEditableDocumentText(this.agentIndexDocument) !== content
            };
            scheduleAgentIndexAutoSave(this);
        },

        async flushAgentIndexDocument() {
            if (
                !this.contextProvider
                || !this.agentIndexPath
                || !this.agentIndexDocument
                || !this.agentIndexViewerCapabilities?.edit
                || !this.dirtyPaths[this.agentIndexPath]
                || this.agentIndexIsSaving
            ) {
                return;
            }

            clearAgentIndexAutoSaveTimer(this);
            const activePath = this.agentIndexPath;
            const activeDocument = this.agentIndexDocument;
            const savedContent = this.agentIndexDraftContent;
            this.agentIndexIsSaving = true;
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

                const hasNewerLocalDraft = this.agentIndexDraftContent !== savedContent;
                this.agentIndexDocument = {
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
                    scheduleAgentIndexAutoSave(this);
                }
            } catch (error) {
                this.currentError = formatHttpApiError(error);
                throw error;
            } finally {
                this.agentIndexIsSaving = false;
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
            if (
                !this.contextProvider
                || !this.activePath
                || !this.activeDocument
                || !this.activeViewerCapabilities?.edit
                || !this.dirtyPaths[this.activePath]
                || this.isSaving
            ) {
                return;
            }

            clearAutoSaveTimer(this);
            const activePath = this.activePath;
            const activeDocument = this.activeDocument;
            const savedContent = this.draftContent;
            let shouldScheduleNextSave = false;
            this.isSaving = true;
            try {
                this.currentError = null;
                const writeResult = await this.contextProvider.writeDocument({
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
            const parentAgentKey = this.findNodeByPath(documentDirectory)?.agentKey
                ?? this.findNodeByPath(input.documentPath)?.agentKey
                ?? this.activeAgentKey
                ?? DEFAULT_WORKSPACE_AGENT_KEY;

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
                        agentKey: parentAgentKey
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
                        agentKey: parentAgentKey
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

        async createNode(input: CreateContextNodeInput) {
            if (!this.contextProvider) {
                return;
            }

            await this.flushAgentIndexDocument();
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
            this.syncActiveAgent(createdNode.path);
        },

        async deleteNode(path: string) {
            if (!this.contextProvider || !path || path === '/') {
                return;
            }

            const fallbackPath = getParentPath(path);
            await this.flushAgentIndexDocument();
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

            await this.flushAgentIndexDocument();
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
const agentIndexAutoSaveTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();

function clearAutoSaveTimer(store: object) {
    const timer = autoSaveTimers.get(store);
    if (timer) {
        clearTimeout(timer);
        autoSaveTimers.delete(store);
    }
}

function clearAgentIndexAutoSaveTimer(store: object) {
    const timer = agentIndexAutoSaveTimers.get(store);
    if (timer) {
        clearTimeout(timer);
        agentIndexAutoSaveTimers.delete(store);
    }
}

function normalizeToolBindings(value: unknown): Array<{ id: string; description?: string }> {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((binding) => {
        if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
            return [];
        }

        const id = typeof (binding as { id?: unknown }).id === 'string'
            ? (binding as { id: string }).id.trim()
            : '';
        if (!id) {
            return [];
        }

        const description = typeof (binding as { description?: unknown }).description === 'string'
            ? (binding as { description: string }).description.trim()
            : '';

        return [{
            id,
            ...(description ? { description } : {})
        }];
    });
}

function scheduleAutoSave(store: ReturnType<typeof useDocumentWorkspaceStore>) {
    clearAutoSaveTimer(store);
    const timer = setTimeout(() => {
        void store.flushActiveDocument();
    }, AUTO_SAVE_DELAY_MS);
    autoSaveTimers.set(store, timer);
}

function scheduleAgentIndexAutoSave(store: ReturnType<typeof useDocumentWorkspaceStore>) {
    clearAgentIndexAutoSaveTimer(store);
    const timer = setTimeout(() => {
        void store.flushAgentIndexDocument();
    }, AUTO_SAVE_DELAY_MS);
    agentIndexAutoSaveTimers.set(store, timer);
}
