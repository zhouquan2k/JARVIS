import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import {
    type ContextDocument,
    type ContextNode,
    type CreateContextNodeInput,
    type IContextProvider,
    type ResolvedAgentConfig
} from '@packages/core/src';

export interface KnowledgeWorkspaceState {
    contextProvider: IContextProvider | null;
    nodes: ContextNode[];
    expandedPaths: string[];
    selectedNodePath: string | null;
    activePath: string | null;
    activeDocument: ContextDocument | null;
    draftContent: string;
    dirtyPaths: Record<string, boolean>;
    panelSizes: [number, number, number];
    isHydrating: boolean;
    isSaving: boolean;
    isResolvingAgent: boolean;
    accessInitialized: boolean;
    currentError: string | null;
    activeAgent: ResolvedAgentConfig | null;
    agentResolutionError: string | null;
}

const AUTO_SAVE_DELAY_MS = 400;
function isVisibleNode(node: ContextNode): boolean {
    return !node.name.startsWith('.');
}

async function loadTree(provider: IContextProvider, parentPath?: string): Promise<ContextNode[]> {
    const children = (await provider.listTree(parentPath)).filter(isVisibleNode);
    const nested = await Promise.all(
        children
            .filter((node) => node.kind === 'directory')
            .map((node) => loadTree(provider, node.path))
    );

    return [...children, ...nested.flat()];
}

function normalizeSizes(sizes: [number, number, number]): [number, number, number] {
    const bounded = sizes.map((size) => Math.max(15, Math.min(70, Number.isFinite(size) ? size : 0))) as [number, number, number];
    const total = bounded[0] + bounded[1] + bounded[2];
    if (total <= 0) {
        return [22, 48, 30];
    }

    return bounded.map((size) => Number(((size / total) * 100).toFixed(2))) as [number, number, number];
}

export const useKnowledgeWorkspaceStore = defineStore('knowledge-workspace', {
    state: (): KnowledgeWorkspaceState => ({
        contextProvider: null,
        nodes: [],
        expandedPaths: [],
        selectedNodePath: null,
        activePath: null,
        activeDocument: null,
        draftContent: '',
        dirtyPaths: {},
        panelSizes: [22, 48, 30],
        isHydrating: false,
        isSaving: false,
        isResolvingAgent: false,
        accessInitialized: false,
        currentError: null,
        activeAgent: null,
        agentResolutionError: null
    }),
    getters: {
        activeNode(state): ContextNode | null {
            const targetPath = state.selectedNodePath ?? state.activePath;
            return targetPath ? state.nodes.find((node) => node.path === targetPath) ?? null : null;
        }
    },
    actions: {
        setContextProvider(provider: IContextProvider | null) {
            this.contextProvider = provider ? markRaw(provider) : null;
            this.nodes = [];
            this.expandedPaths = [];
            this.selectedNodePath = null;
            this.activePath = null;
            this.activeDocument = null;
            this.draftContent = '';
            this.dirtyPaths = {};
            this.accessInitialized = false;
            this.currentError = null;
            this.activeAgent = null;
            this.agentResolutionError = null;
            this.isResolvingAgent = false;
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
                this.nodes = await loadTree(this.contextProvider);
                this.expandedPaths = [];

                if (!this.activePath) {
                    const firstFile = this.nodes.find((node) => node.kind === 'file');
                    if (firstFile) {
                        await this.openNode(firstFile.path);
                    } else {
                        await this.resolveActiveAgent('/');
                    }
                }
            } catch (error) {
                this.currentError = error instanceof Error ? error.message : String(error);
            } finally {
                this.isHydrating = false;
            }
        },

        toggleExpanded(path: string) {
            if (this.expandedPaths.includes(path)) {
                this.expandedPaths = this.expandedPaths.filter((item) => item !== path);
                return;
            }

            this.expandedPaths = [...this.expandedPaths, path];
        },

        async openNode(path: string) {
            if (!this.contextProvider) {
                return;
            }

            const node = this.nodes.find((item) => item.path === path);
            if (!node) {
                return;
            }

            if (node.kind === 'directory') {
                this.selectedNodePath = path;
                this.toggleExpanded(path);
                await this.resolveActiveAgent(path);
                return;
            }

            await this.flushActiveDocument();
            const document = await this.contextProvider.readDocument(path);
            this.selectedNodePath = path;
            this.activePath = path;
            this.activeDocument = document;
            this.draftContent = document.content;
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [path]: false
            };
            await this.resolveActiveAgent(path);
        },

        updateActiveDocument(content: string) {
            if (!this.activePath) {
                return;
            }

            this.draftContent = content;
            this.dirtyPaths = {
                ...this.dirtyPaths,
                [this.activePath]: this.activeDocument?.content !== content
            };
            scheduleAutoSave(this);
        },

        async flushActiveDocument() {
            if (!this.contextProvider || !this.activePath || !this.dirtyPaths[this.activePath]) {
                return;
            }

            clearAutoSaveTimer(this);
            this.isSaving = true;
            try {
                await this.contextProvider.writeDocument(this.activePath, this.draftContent);
                const updatedAt = Date.now();
                this.activeDocument = {
                    path: this.activePath,
                    content: this.draftContent,
                    updatedAt
                };
                this.nodes = this.nodes.map((node) => node.path === this.activePath
                    ? { ...node, updatedAt }
                    : node);
                this.dirtyPaths = {
                    ...this.dirtyPaths,
                    [this.activePath]: false
                };
            } finally {
                this.isSaving = false;
            }
        },

        async resolveActiveAgent(path: string) {
            if (!this.contextProvider) {
                this.activeAgent = null;
                this.agentResolutionError = null;
                this.isResolvingAgent = false;
                return;
            }

            this.isResolvingAgent = true;
            this.agentResolutionError = null;

            try {
                this.activeAgent = await this.contextProvider.resolveScopedAgentConfig(path);
            } catch (error) {
                this.activeAgent = null;
                this.agentResolutionError = error instanceof Error ? error.message : String(error);
            } finally {
                this.isResolvingAgent = false;
            }
        },

        async createNode(input: CreateContextNodeInput) {
            if (!this.contextProvider) {
                return;
            }

            await this.contextProvider.createNode(input);
            this.nodes = await loadTree(this.contextProvider);

            if (input.parentPath && !this.expandedPaths.includes(input.parentPath)) {
                this.expandedPaths = [...this.expandedPaths, input.parentPath];
            }

            const createdPath = input.parentPath ? `${input.parentPath}/${input.name}` : `/${input.name}`;
            if (input.kind === 'file') {
                await this.openNode(createdPath);
            }
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

function scheduleAutoSave(store: ReturnType<typeof useKnowledgeWorkspaceStore>) {
    clearAutoSaveTimer(store);
    const timer = setTimeout(() => {
        void store.flushActiveDocument();
    }, AUTO_SAVE_DELAY_MS);
    autoSaveTimers.set(store, timer);
}
