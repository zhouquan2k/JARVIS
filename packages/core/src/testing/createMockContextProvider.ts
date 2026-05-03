import { DEFAULT_SCOPED_AGENT_CONFIG, resolveScopedAgentConfig } from '../agents/config/resolveScopedAgentConfig';
import type { Conversation } from '../interfaces/Conversation';
import type { ConversationQuery } from '../interfaces/IConversationPersistProvider';
import { DEFAULT_WORKSPACE_AGENT_KEY } from '../interfaces/IContextProvider';
import type {
    ContextDocument,
    ContextNode,
    ProjectDocumentEntry,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    IContextProvider,
    RenameContextNodeInput,
    WorkspaceContext,
    WriteContextDocumentInput,
    WriteContextDocumentResult
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
    conversations?: Conversation[];
}

function cloneSnapshot(snapshot: StoredWorkspaceSnapshot): StoredWorkspaceSnapshot {
    return {
        nodes: snapshot.nodes.map((node) => ({ ...node })),
        documents: Object.fromEntries(
            Object.entries(snapshot.documents).map(([path, value]) => [
                path,
                typeof value === 'string' ? value : { ...value }
            ])
        ),
        conversations: snapshot.conversations?.map((conversation) => ({
            ...conversation,
            documentPaths: conversation.documentPaths ? [...conversation.documentPaths] : undefined,
            messages: conversation.messages.map((message) => ({
                ...message,
                attachments: message.attachments?.map((attachment) => ({ ...attachment })),
                requestSnapshot: message.requestSnapshot
                    ? {
                        ...message.requestSnapshot,
                        attachments: message.requestSnapshot.attachments?.map((attachment) => ({ ...attachment }))
                    }
                    : undefined,
                annotations: message.annotations?.map((annotation) => ({ ...annotation }))
            }))
        }))
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
        throw new Error('Node name must not be empty.');
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

function isMarkdownPath(targetPath: string): boolean {
    return targetPath.endsWith('.md') || targetPath.endsWith('.markdown');
}

function ensureNode(snapshot: StoredWorkspaceSnapshot, path: string): StoredContextNode {
    const matched = snapshot.nodes.find((node) => node.path === path);
    if (!matched) {
        throw new Error(`Node does not exist: ${path}`);
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
        },
        conversations: []
    });

    const provider: IContextProvider = {
        id: 'mock-context',
        async initializeAccess(): Promise<void> {
            return undefined;
        },
        async getContext(): Promise<WorkspaceContext> {
            const agentConfigs = new Map<string, WorkspaceContext['agentConfigs'][string]>();
            const rootResolved = await resolveScopedAgentConfig(provider, '/', DEFAULT_SCOPED_AGENT_CONFIG);
            agentConfigs.set(DEFAULT_WORKSPACE_AGENT_KEY, {
                ...rootResolved,
                scopePath: '/',
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
        async getConversations(query: ConversationQuery): Promise<Conversation[]> {
            const normalizedPath = normalizePath(query.documentPath);
            if (query.documentPath !== undefined && !normalizedPath) {
                throw new Error('Document path must not be empty.');
            }

            return (currentSnapshot.conversations ?? [])
                .filter((conversation) => {
                    if (normalizedPath) {
                        return conversation.documentPaths?.includes(normalizedPath);
                    }
                    return true;
                })
                .map((conversation) => ({
                    ...conversation,
                    documentPaths: conversation.documentPaths ? [...conversation.documentPaths] : undefined,
                    messages: conversation.messages.map((message) => ({
                        ...message,
                        attachments: message.attachments?.map((attachment) => ({ ...attachment })),
                        requestSnapshot: message.requestSnapshot
                            ? {
                                ...message.requestSnapshot,
                                attachments: message.requestSnapshot.attachments?.map((attachment) => ({ ...attachment }))
                            }
                            : undefined,
                        annotations: message.annotations?.map((annotation) => ({ ...annotation }))
                    }))
                }))
                .sort((left, right) => right.updatedAt - left.updatedAt);
        },
        async getProjectDocuments(curNode: string): Promise<ProjectDocumentEntry[]> {
            const normalizedCurNode = normalizePath(curNode) ?? '/';
            const currentNode = normalizedCurNode === '/'
                ? null
                : currentSnapshot.nodes.find((node) => node.path === normalizedCurNode) ?? null;
            if (normalizedCurNode !== '/' && !currentNode) {
                throw new Error(`Node does not exist: ${curNode}`);
            }

            const scopePath = currentNode?.kind === 'file'
                ? normalizePath(currentNode.parentPath) ?? '/'
                : normalizedCurNode;
            const prefix = scopePath === '/' ? '/' : `${scopePath}/`;

            return currentSnapshot.nodes
                .filter((node) => {
                    if (node.kind !== 'file' || !isMarkdownPath(node.path)) {
                        return false;
                    }

                    return scopePath === '/'
                        ? true
                        : node.path === scopePath || node.path.startsWith(prefix);
                })
                .map((node) => ({
                    path: node.path,
                    name: node.name
                }))
                .sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'));
        },
        async readDocument(path: string): Promise<ContextDocument> {
            const normalizedPath = normalizePath(path);
            if (!normalizedPath) {
                throw new Error('Document path must not be empty.');
            }

            const node = ensureNode(currentSnapshot, normalizedPath);
            if (node.kind !== 'file') {
                throw new Error(`Node is not a file: ${normalizedPath}`);
            }

            return {
                ...readStoredDocument(currentSnapshot, normalizedPath),
                updatedAt: node.updatedAt
            };
        },
        async writeDocument(input: WriteContextDocumentInput): Promise<WriteContextDocumentResult> {
            const normalizedPath = normalizePath(input.path);
            if (!normalizedPath) {
                throw new Error('Document path must not be empty.');
            }

            const node = ensureNode(currentSnapshot, normalizedPath);
            if (node.kind !== 'file') {
                throw new Error(`Node is not a file: ${normalizedPath}`);
            }

            const previous = readStoredDocument(currentSnapshot, normalizedPath);
            if (input.expectedVersion && previous.version && input.expectedVersion !== previous.version) {
                throw new Error('The document version has changed. Please reload and try again.');
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
            return {
                updatedAt: nextDocument.updatedAt,
                version: nextDocument.version
            };
        },
        async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
            const parentPath = normalizePath(input.parentPath);
            if (parentPath) {
                const parentNode = ensureNode(currentSnapshot, parentPath);
                if (parentNode.kind !== 'directory') {
                    throw new Error(`Parent node is not a directory: ${parentPath}`);
                }
            }

            const path = getChildPath(parentPath, input.name);
            if (currentSnapshot.nodes.some((node) => node.path === path)) {
                throw new Error(`Node already exists: ${path}`);
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
                throw new Error('Deleting the root directory is not allowed.');
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
                throw new Error('Renaming the root directory is not allowed.');
            }

            const node = ensureNode(currentSnapshot, normalizedPath);
            const parentPath = normalizePath(node.parentPath);
            const targetPath = getChildPath(parentPath, input.name);
            if (currentSnapshot.nodes.some((candidate) => candidate.path === targetPath && candidate.path !== normalizedPath)) {
                throw new Error(`Node already exists: ${targetPath}`);
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
