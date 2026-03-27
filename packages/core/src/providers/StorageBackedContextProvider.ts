import type { ContextDocument, ContextNode, CreateContextNodeInput, IContextProvider } from '../interfaces/IContextProvider';

interface StoredContextNode {
    path: string;
    name: string;
    kind: 'file' | 'directory';
    parentPath?: string;
    updatedAt?: number;
}

interface StoredWorkspaceSnapshot {
    nodes: StoredContextNode[];
    documents: Record<string, string>;
}

interface StorageBackedContextProviderOptions {
    id: string;
    readSnapshot: () => Promise<StoredWorkspaceSnapshot | null>;
    writeSnapshot: (snapshot: StoredWorkspaceSnapshot) => Promise<void>;
    initialSnapshot?: StoredWorkspaceSnapshot;
}

function cloneSnapshot(snapshot: StoredWorkspaceSnapshot): StoredWorkspaceSnapshot {
    return {
        nodes: snapshot.nodes.map((node) => ({ ...node })),
        documents: { ...snapshot.documents }
    };
}

function normalizePath(path?: string): string | undefined {
    if (!path) {
        return undefined;
    }

    const trimmed = path.trim();
    if (!trimmed || trimmed === '/') {
        return undefined;
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const normalized = withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/, '');
    return normalized || undefined;
}

function getChildPath(parentPath: string | undefined, name: string): string {
    const trimmedName = name.trim();
    if (!trimmedName) {
        throw new Error('节点名称不能为空');
    }

    const normalizedParent = normalizePath(parentPath);
    return normalizedParent ? `${normalizedParent}/${trimmedName}` : `/${trimmedName}`;
}

function nodeHasChildren(nodes: StoredContextNode[], path: string): boolean {
    return nodes.some((node) => normalizePath(node.parentPath) === path);
}

function ensureNode(snapshot: StoredWorkspaceSnapshot, path: string): StoredContextNode {
    const matched = snapshot.nodes.find((node) => node.path === path);
    if (!matched) {
        throw new Error(`节点不存在: ${path}`);
    }
    return matched;
}

export class StorageBackedContextProvider implements IContextProvider {
    readonly id: string;
    private snapshot: StoredWorkspaceSnapshot | null = null;
    private readonly readSnapshot: StorageBackedContextProviderOptions['readSnapshot'];
    private readonly writeSnapshot: StorageBackedContextProviderOptions['writeSnapshot'];
    private readonly initialSnapshot: StoredWorkspaceSnapshot;

    constructor(options: StorageBackedContextProviderOptions) {
        this.id = options.id;
        this.readSnapshot = options.readSnapshot;
        this.writeSnapshot = options.writeSnapshot;
        this.initialSnapshot = cloneSnapshot(options.initialSnapshot ?? {
            nodes: [],
            documents: {}
        });
    }

    async initializeAccess(): Promise<void> {
        if (this.snapshot) {
            return;
        }

        const existing = await this.readSnapshot();
        this.snapshot = cloneSnapshot(existing ?? this.initialSnapshot);
        if (!existing) {
            await this.persist();
        }
    }

    async listTree(parentPath?: string): Promise<ContextNode[]> {
        const snapshot = await this.requireSnapshot();
        const normalizedParent = normalizePath(parentPath);

        return snapshot.nodes
            .filter((node) => normalizePath(node.parentPath) === normalizedParent)
            .sort((left, right) => {
                if (left.kind !== right.kind) {
                    return left.kind === 'directory' ? -1 : 1;
                }
                return left.name.localeCompare(right.name, 'zh-Hans-CN');
            })
            .map((node) => ({
                ...node,
                parentPath: normalizePath(node.parentPath),
                hasChildren: node.kind === 'directory' ? nodeHasChildren(snapshot.nodes, node.path) : false
            }));
    }

    async readDocument(path: string): Promise<ContextDocument> {
        const snapshot = await this.requireSnapshot();
        const normalizedPath = normalizePath(path);
        if (!normalizedPath) {
            throw new Error('文档路径不能为空');
        }

        const node = ensureNode(snapshot, normalizedPath);
        if (node.kind !== 'file') {
            throw new Error(`节点不是文件: ${normalizedPath}`);
        }

        return {
            path: normalizedPath,
            content: snapshot.documents[normalizedPath] ?? '',
            updatedAt: node.updatedAt
        };
    }

    async writeDocument(path: string, content: string): Promise<void> {
        const snapshot = await this.requireSnapshot();
        const normalizedPath = normalizePath(path);
        if (!normalizedPath) {
            throw new Error('文档路径不能为空');
        }

        const node = ensureNode(snapshot, normalizedPath);
        if (node.kind !== 'file') {
            throw new Error(`节点不是文件: ${normalizedPath}`);
        }

        node.updatedAt = Date.now();
        snapshot.documents[normalizedPath] = content;
        await this.persist();
    }

    async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
        const snapshot = await this.requireSnapshot();
        const parentPath = normalizePath(input.parentPath);
        if (parentPath) {
            const parentNode = ensureNode(snapshot, parentPath);
            if (parentNode.kind !== 'directory') {
                throw new Error(`父节点不是目录: ${parentPath}`);
            }
        }

        const path = getChildPath(parentPath, input.name);
        if (snapshot.nodes.some((node) => node.path === path)) {
            throw new Error(`节点已存在: ${path}`);
        }

        const createdAt = Date.now();
        const node: StoredContextNode = {
            path,
            name: input.name.trim(),
            kind: input.kind,
            parentPath,
            updatedAt: createdAt
        };
        snapshot.nodes.push(node);
        if (input.kind === 'file' && !(path in snapshot.documents)) {
            snapshot.documents[path] = '';
        }
        await this.persist();

        return {
            ...node,
            hasChildren: false
        };
    }

    private async requireSnapshot(): Promise<StoredWorkspaceSnapshot> {
        await this.initializeAccess();
        return this.snapshot as StoredWorkspaceSnapshot;
    }

    private async persist(): Promise<void> {
        if (!this.snapshot) {
            return;
        }

        await this.writeSnapshot(cloneSnapshot(this.snapshot));
    }
}

export type { StoredWorkspaceSnapshot };
