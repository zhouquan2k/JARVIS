import { DEFAULT_SCOPED_AGENT_CONFIG, resolveScopedAgentConfig } from '../agents/config/resolveScopedAgentConfig';
import { DEFAULT_WORKSPACE_AGENT_KEY } from '../interfaces/IContextProvider';
import type {
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    IContextProvider,
    RenameContextNodeInput,
    WorkspaceContext,
    WriteContextDocumentInput
} from '../interfaces/IContextProvider';
import { searchInScopedFiles } from '../providers/context/fileSearch';
import {
    decodeTextDocument,
    encodeTextDocument,
    inferDocumentMimeType,
    isTextDocumentMimeType
} from '../utils/documentData';

export interface StoredContextNode {
    path: string;
    name: string;
    kind: 'file' | 'directory';
    parentPath?: string;
    updatedAt?: number;
}

export interface StoredWorkspaceSnapshot {
    nodes: StoredContextNode[];
    documents: Record<string, string | Partial<ContextDocument>>;
}

function cloneSnapshot(snapshot: StoredWorkspaceSnapshot): StoredWorkspaceSnapshot {
    return {
        nodes: snapshot.nodes.map((node) => ({ ...node })),
        documents: Object.fromEntries(
            Object.entries(snapshot.documents).map(([path, value]) => [
                path,
                typeof value === 'string' ? value : { ...value }
            ])
        )
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

function getAgentScopePath(agentKey: string): string {
    if (agentKey === '/') return '/';
    return agentKey.endsWith('/') ? agentKey.slice(0, -1) : agentKey;
}

function ensureNode(snapshot: StoredWorkspaceSnapshot, path: string): StoredContextNode {
    const matched = snapshot.nodes.find((node) => node.path === path);
    if (!matched) {
        throw new Error(`节点不存在: ${path}`);
    }
    return matched;
}

function readStoredDocument(snapshot: StoredWorkspaceSnapshot, path: string): ContextDocument {
    const stored = snapshot.documents[path];
    if (typeof stored === 'string') {
        return {
            path,
            mimeType: inferDocumentMimeType(path),
            dataBase64: encodeTextDocument(stored)
        };
    }

    return {
        path,
        mimeType: stored?.mimeType ?? inferDocumentMimeType(path),
        dataBase64: stored?.dataBase64 ?? encodeTextDocument(''),
        updatedAt: stored?.updatedAt,
        version: stored?.version,
        canWrite: stored?.canWrite
    };
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

    const provider: IContextProvider = {
        id: 'mock-context',
        async initializeAccess(): Promise<void> {
            return undefined;
        },
        async getContext(): Promise<WorkspaceContext> {
            const agentConfigs = new Map<string, WorkspaceContext['agentConfigs'][string]>();
            agentConfigs.set(DEFAULT_WORKSPACE_AGENT_KEY, {
                ...DEFAULT_SCOPED_AGENT_CONFIG,
                scopePath: '/',
                sourcePaths: [],
                effectiveInstructions: DEFAULT_SCOPED_AGENT_CONFIG.instructions ?? '',
                instructions: DEFAULT_SCOPED_AGENT_CONFIG.instructions ?? undefined
            });

            const ensureAgentConfig = async (targetPath: string): Promise<string> => {
                const resolved = await resolveScopedAgentConfig(provider, targetPath, DEFAULT_SCOPED_AGENT_CONFIG);
                const agentKey = resolved.scopePath.endsWith('/') ? resolved.scopePath : `${resolved.scopePath}/`;
                if (!agentConfigs.has(agentKey)) {
                    if (agentKey === DEFAULT_WORKSPACE_AGENT_KEY) {
                        agentConfigs.set(agentKey, {
                            ...resolved,
                            scopePath: '/',
                            sourcePaths: []
                        });
                    } else {
                        const ownerScopePath = getAgentScopePath(agentKey);
                        const ownerResolved = await resolveScopedAgentConfig(provider, ownerScopePath, DEFAULT_SCOPED_AGENT_CONFIG);
                        agentConfigs.set(agentKey, {
                            ...ownerResolved,
                            scopePath: ownerScopePath
                        });
                    }
                }

                return agentKey;
            };

            const buildNodes = async (parentPath?: string): Promise<ContextNode[]> => {
                const normalizedParent = normalizePath(parentPath);
                const siblings = currentSnapshot.nodes
                    .filter((node) => normalizePath(node.parentPath) === normalizedParent)
                    .sort((left, right) => {
                        if (left.kind !== right.kind) {
                            return left.kind === 'directory' ? -1 : 1;
                        }
                        return left.name.localeCompare(right.name, 'zh-Hans-CN');
                    });

                return Promise.all(siblings.map(async (node) => {
                    const agentKey = await ensureAgentConfig(node.path);
                    if (node.kind === 'directory') {
                        const children = await buildNodes(node.path);
                        return {
                            ...node,
                            parentPath: normalizePath(node.parentPath),
                            hasChildren: children.length > 0,
                            children,
                            isAgentOwner: currentSnapshot.nodes.some((candidate) => (
                                candidate.kind === 'file'
                                && normalizePath(candidate.parentPath) === node.path
                                && candidate.name === '.agent.json'
                            )),
                            agentKey
                        };
                    }

                    return {
                        ...node,
                        parentPath: normalizePath(node.parentPath),
                        hasChildren: false,
                        agentKey
                    };
                }));
            };

            return {
                nodes: await buildNodes(),
                agentConfigs: Object.fromEntries(agentConfigs.entries())
            };
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
                ...readStoredDocument(currentSnapshot, normalizedPath),
                updatedAt: node.updatedAt
            };
        },
        async writeDocument(input: WriteContextDocumentInput): Promise<void> {
            const normalizedPath = normalizePath(input.path);
            if (!normalizedPath) {
                throw new Error('文档路径不能为空');
            }

            const node = ensureNode(currentSnapshot, normalizedPath);
            if (node.kind !== 'file') {
                throw new Error(`节点不是文件: ${normalizedPath}`);
            }

            const previous = readStoredDocument(currentSnapshot, normalizedPath);
            if (input.expectedVersion && previous.version && input.expectedVersion !== previous.version) {
                throw new Error('文档版本已变更，请重新读取后再试。');
            }

            node.updatedAt = Date.now();
            const mimeType = input.mimeType || previous.mimeType;
            const nextDocument: ContextDocument = {
                path: normalizedPath,
                mimeType,
                dataBase64: input.dataBase64,
                updatedAt: node.updatedAt,
                version: `${node.updatedAt}`,
                canWrite: previous.canWrite ?? isTextDocumentMimeType(mimeType)
            };
            currentSnapshot.documents[normalizedPath] = nextDocument;
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

            const resolved = await resolveScopedAgentConfig(provider, path, DEFAULT_SCOPED_AGENT_CONFIG);
            return {
                ...node,
                hasChildren: false,
                isAgentOwner: false,
                agentKey: resolved.scopePath.endsWith('/') ? resolved.scopePath : `${resolved.scopePath}/`
            };
        },
        async deleteNode(path: string): Promise<void> {
            const normalizedPath = normalizePath(path);
            if (!normalizedPath) {
                throw new Error('不允许删除根目录。');
            }

            const node = ensureNode(currentSnapshot, normalizedPath);
            const descendantPaths = currentSnapshot.nodes
                .filter((candidate) => candidate.path === normalizedPath || candidate.path.startsWith(`${normalizedPath}/`))
                .map((candidate) => candidate.path);

            currentSnapshot.nodes = currentSnapshot.nodes.filter((candidate) => !descendantPaths.includes(candidate.path));
            descendantPaths.forEach((candidatePath) => {
                delete currentSnapshot.documents[candidatePath];
            });

            if (node.kind === 'file') {
                delete currentSnapshot.documents[normalizedPath];
            }
        },
        async renameNode(input: RenameContextNodeInput): Promise<ContextNode> {
            const normalizedPath = normalizePath(input.path);
            if (!normalizedPath) {
                throw new Error('不允许重命名根目录。');
            }

            const node = ensureNode(currentSnapshot, normalizedPath);
            const parentPath = normalizePath(node.parentPath);
            const targetPath = getChildPath(parentPath, input.name);
            if (currentSnapshot.nodes.some((candidate) => candidate.path === targetPath && candidate.path !== normalizedPath)) {
                throw new Error(`节点已存在: ${targetPath}`);
            }

            const descendants = currentSnapshot.nodes
                .filter((candidate) => candidate.path === normalizedPath || candidate.path.startsWith(`${normalizedPath}/`))
                .sort((left, right) => left.path.length - right.path.length);

            descendants.forEach((candidate) => {
                const suffix = candidate.path.slice(normalizedPath.length);
                candidate.path = `${targetPath}${suffix}`;
                candidate.name = candidate.path.split('/').pop() || candidate.name;
                if (candidate.parentPath) {
                    candidate.parentPath = normalizePath(candidate.parentPath === normalizedPath
                        ? targetPath
                        : candidate.parentPath.replace(normalizedPath, targetPath));
                }
                candidate.updatedAt = Date.now();
            });

            Object.entries(currentSnapshot.documents).forEach(([documentPath, value]) => {
                if (documentPath === normalizedPath || documentPath.startsWith(`${normalizedPath}/`)) {
                    const suffix = documentPath.slice(normalizedPath.length);
                    const nextPath = `${targetPath}${suffix}`;
                    currentSnapshot.documents[nextPath] = typeof value === 'string'
                        ? value
                        : { ...value, path: nextPath };
                    delete currentSnapshot.documents[documentPath];
                }
            });

            const resolved = await resolveScopedAgentConfig(provider, targetPath, DEFAULT_SCOPED_AGENT_CONFIG);
            return {
                path: targetPath,
                name: input.name.trim(),
                kind: node.kind,
                parentPath,
                hasChildren: node.kind === 'directory' ? nodeHasChildren(currentSnapshot.nodes, targetPath) : false,
                updatedAt: node.updatedAt,
                isAgentOwner: false,
                agentKey: resolved.scopePath.endsWith('/') ? resolved.scopePath : `${resolved.scopePath}/`
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
                        readContent: async () => {
                            const document = readStoredDocument(currentSnapshot, node.path);
                            if (!isTextDocumentMimeType(document.mimeType)) {
                                return '';
                            }

                            return decodeTextDocument(document.dataBase64);
                        }
                    }))
            });
        }
    };

    return provider;
}
