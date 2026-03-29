import { DEFAULT_SCOPED_AGENT_CONFIG, resolveScopedAgentConfig } from '../agents/resolveScopedAgentConfig';
import type {
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    IContextProvider
} from '../interfaces/IContextProvider';
import { searchInScopedFiles } from '../providers/fileSearch';

export interface StoredContextNode {
    path: string;
    name: string;
    kind: 'file' | 'directory';
    parentPath?: string;
    updatedAt?: number;
}

export interface StoredWorkspaceSnapshot {
    nodes: StoredContextNode[];
    documents: Record<string, string>;
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

export function createMockContextProvider(snapshot?: StoredWorkspaceSnapshot): IContextProvider {
    let currentSnapshot = cloneSnapshot(snapshot ?? {
        nodes: [
            {
                path: '/welcome.md',
                name: 'welcome.md',
                kind: 'file'
            }
        ],
        documents: {
            '/welcome.md': '# Welcome\n\nMock context provider'
        }
    });

    return {
        id: 'mock-context',
        async initializeAccess(): Promise<void> {
            return undefined;
        },
        async listTree(parentPath?: string): Promise<ContextNode[]> {
            const normalizedParent = normalizePath(parentPath);

            return currentSnapshot.nodes
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
                    hasChildren: node.kind === 'directory' ? nodeHasChildren(currentSnapshot.nodes, node.path) : false
                }));
        },
        async readDocument(path: string): Promise<ContextDocument> {
            const normalizedPath = normalizePath(path);
            if (!normalizedPath) {
                throw new Error('文档路径不能为空');
            }

            const node = ensureNode(currentSnapshot, normalizedPath);
            if (node.kind !== 'file') {
                throw new Error(`节点不是文件: ${normalizedPath}`);
            }

            return {
                path: normalizedPath,
                content: currentSnapshot.documents[normalizedPath] ?? '',
                updatedAt: node.updatedAt
            };
        },
        async writeDocument(path: string, content: string): Promise<void> {
            const normalizedPath = normalizePath(path);
            if (!normalizedPath) {
                throw new Error('文档路径不能为空');
            }

            const node = ensureNode(currentSnapshot, normalizedPath);
            if (node.kind !== 'file') {
                throw new Error(`节点不是文件: ${normalizedPath}`);
            }

            node.updatedAt = Date.now();
            currentSnapshot.documents[normalizedPath] = content;
        },
        async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
            const parentPath = normalizePath(input.parentPath);
            if (parentPath) {
                const parentNode = ensureNode(currentSnapshot, parentPath);
                if (parentNode.kind !== 'directory') {
                    throw new Error(`父节点不是目录: ${parentPath}`);
                }
            }

            const path = getChildPath(parentPath, input.name);
            if (currentSnapshot.nodes.some((node) => node.path === path)) {
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
            currentSnapshot.nodes.push(node);
            if (input.kind === 'file' && !(path in currentSnapshot.documents)) {
                currentSnapshot.documents[path] = '';
            }

            return {
                ...node,
                hasChildren: false
            };
        },
        async searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
            return searchInScopedFiles({
                query: request.query,
                scopePath: request.scopePath,
                maxResults: request.maxResults,
                files: currentSnapshot.nodes
                    .filter((node) => node.kind === 'file')
                    .map((node) => ({
                        path: node.path,
                        readContent: async () => currentSnapshot.documents[node.path] ?? ''
                    }))
            });
        },
        async resolveScopedAgentConfig(targetPath: string) {
            return resolveScopedAgentConfig(this, targetPath, DEFAULT_SCOPED_AGENT_CONFIG);
        }
    };
}
