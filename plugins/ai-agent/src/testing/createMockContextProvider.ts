import type { Conversation } from '../interfaces/Conversation';
import type { ConversationQuery, IConversationQueryProvider } from '../interfaces/IConversationPersistProvider';
import type { Task, TaskQueryTag, TaskService } from '@plugins/task-mgr/api';
import type {
    AgentConfig,
    AgentInheritanceMode,
    AgentSkillBinding,
    AgentToolBinding,
    ResolvedAgentConfig
} from '../interfaces/IAgentConfig';
import { DEFAULT_SCOPED_AGENT_CONFIG } from '../interfaces/DefaultScopedAgentConfig';

const DEFAULT_WORKSPACE_AGENT_KEY = '/';
import type {
    ContextDocument,
    ContextNode,
    FolderMetadata,
    ProjectDocumentEntry,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    IContextProvider,
    MoveContextNodeInput,
    RenameContextNodeInput,
    WorkspaceContext,
    WriteContextDocumentInput,
    WriteContextDocumentResult
} from '@plugins/ai-agent/src/internal';

let mockIdCounter = 0;
function generateMockId(): string {
    return `mock-id-${++mockIdCounter}-${Date.now()}`;
}
import { searchInScopedFiles } from '@plugins/ai-agent/src/internal';
import {
    decodeTextDocument,
    encodeTextDocument,
    inferDocumentMimeType,
    isTextDocumentMimeType
} from '@plugins/ai-agent/src/internal';

export interface StoredContextNode {
    path: string;
    name: string;
    kind: 'file' | 'directory';
    parentPath?: string;
    updatedAt?: number;
}

type AgentBinding = AgentToolBinding | AgentSkillBinding;

interface ScopedAgentMatch {
    scopePath: string;
    configPath: string;
    config: AgentConfig;
}

export interface StoredWorkspaceSnapshot {
    nodes: StoredContextNode[];
    documents: Record<string, string | Partial<ContextDocument>>;
    conversations?: Conversation[];
    tasks?: Task[];
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
        })),
        tasks: snapshot.tasks?.map((task) => ({ ...task }))
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

function getParentScopePath(path: string): string | null {
    const normalized = normalizePath(path) ?? '/';
    if (normalized === '/') {
        return null;
    }

    const lastSlashIndex = normalized.lastIndexOf('/');
    return lastSlashIndex <= 0 ? '/' : normalized.slice(0, lastSlashIndex);
}

function getConfigPath(scopePath: string): string {
    return scopePath === '/' ? '/.agent.json' : `${scopePath}/.agent.json`;
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

function remapNodeSubtree(snapshot: StoredWorkspaceSnapshot, fromPath: string, toPath: string): void {
    const descendants = snapshot.nodes
        .filter((candidate) => candidate.path === fromPath || candidate.path.startsWith(`${fromPath}/`))
        .sort((left, right) => left.path.length - right.path.length);

    descendants.forEach((candidate) => {
        const suffix = candidate.path.slice(fromPath.length);
        candidate.path = `${toPath}${suffix}`;
        candidate.name = candidate.path.split('/').pop() || candidate.name;
        if (candidate.parentPath) {
            candidate.parentPath = normalizePath(candidate.parentPath === fromPath
                ? toPath
                : candidate.parentPath.replace(fromPath, toPath));
        }
        candidate.updatedAt = Date.now();
    });

    Object.entries(snapshot.documents).forEach(([documentPath, value]) => {
        if (documentPath === fromPath || documentPath.startsWith(`${fromPath}/`)) {
            const suffix = documentPath.slice(fromPath.length);
            const nextPath = `${toPath}${suffix}`;
            snapshot.documents[nextPath] = typeof value === 'string'
                ? value
                : { ...value, path: nextPath };
            delete snapshot.documents[documentPath];
        }
    });
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

function cloneTask(task: Task): Task {
    return { ...task };
}

function cloneBindings<T extends AgentBinding>(bindings?: T[]): T[] | undefined {
    if (!bindings || bindings.length === 0) {
        return undefined;
    }

    return bindings.map((binding) => ({ ...binding }));
}

function cloneAgentConfig(config: AgentConfig): AgentConfig {
    return {
        name: config.name,
        description: config.description,
        instructions: config.instructions,
        modelProviderName: config.modelProviderName,
        modelName: config.modelName,
        tools: cloneBindings(config.tools),
        skills: cloneBindings(config.skills),
        inheritance: config.inheritance
    };
}

function normalizeInstructions(value?: string): string {
    return value?.trim() ?? '';
}

function mergeInstructions(parent?: string, child?: string): string | undefined {
    const merged = [normalizeInstructions(parent), normalizeInstructions(child)].filter(Boolean).join('\n\n');
    return merged || undefined;
}

function mergeBindings<T extends AgentBinding>(parent?: T[], child?: T[]): T[] | undefined {
    const merged = new Map<string, T>();

    parent?.forEach((binding) => {
        merged.set(binding.id, { ...binding });
    });
    child?.forEach((binding) => {
        merged.set(binding.id, { ...binding });
    });

    if (merged.size === 0) {
        return undefined;
    }

    return Array.from(merged.values());
}

function mergeAgentConfigs(parent: AgentConfig, child: AgentConfig): AgentConfig {
    return {
        name: child.name || parent.name,
        description: child.description ?? parent.description,
        instructions: mergeInstructions(parent.instructions, child.instructions),
        modelProviderName: child.modelProviderName ?? parent.modelProviderName,
        modelName: child.modelName ?? parent.modelName,
        tools: mergeBindings(parent.tools, child.tools),
        skills: mergeBindings(parent.skills, child.skills),
        inheritance: child.inheritance
    };
}

function createResolvedAgentConfig(
    scopePath: string,
    sourcePaths: string[],
    config: AgentConfig,
    editableConfig: AgentConfig = config
): ResolvedAgentConfig {
    const instructions = normalizeInstructions(config.instructions);
    const editableInstructions = normalizeInstructions(editableConfig.instructions);

    return {
        ...cloneAgentConfig(config),
        scopePath,
        sourcePaths: [...sourcePaths],
        effectiveInstructions: instructions,
        instructions: editableInstructions || undefined
    };
}

function resolveChildAgentConfig(
    parent: ResolvedAgentConfig,
    scopePath: string,
    configPath: string,
    config: AgentConfig
): ResolvedAgentConfig {
    const effectiveParent: AgentConfig = {
        ...parent,
        instructions: parent.effectiveInstructions
    };
    const merged = config.inheritance === 'override'
        ? cloneAgentConfig(config)
        : mergeAgentConfigs(effectiveParent, config);
    const sourcePaths = config.inheritance === 'override'
        ? [configPath]
        : [...parent.sourcePaths, configPath];

    return createResolvedAgentConfig(scopePath, sourcePaths, merged, config);
}

function isMissingDocumentError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /节点不存在|does not exist|not found|enoent|http 404/i.test(message);
}

function isDirectoryReadError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /节点不是文件|not a file|is a directory|eisdir|illegal operation on a directory, read/i.test(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBindings<T extends AgentBinding>(
    value: unknown,
    configPath: string,
    fieldName: 'tools' | 'skills'
): T[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        throw new Error(`Invalid ${fieldName} in ${configPath}: expected an array.`);
    }

    return value.map((item, index) => {
        if (!isPlainObject(item)) {
            throw new Error(`Invalid ${fieldName}[${index}] in ${configPath}: expected an object.`);
        }

        const id = typeof item.id === 'string' ? item.id.trim() : '';
        if (!id) {
            throw new Error(`Invalid ${fieldName}[${index}] in ${configPath}: missing non-empty id.`);
        }

        if (item.description !== undefined && typeof item.description !== 'string') {
            throw new Error(`Invalid ${fieldName}[${index}] in ${configPath}: description must be a string.`);
        }

        return {
            id,
            description: item.description
        } as T;
    });
}

function parseInheritance(value: unknown, configPath: string): AgentInheritanceMode | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === 'merge' || value === 'override') {
        return value;
    }

    throw new Error(`Invalid agent config in ${configPath}: "inheritance" must be "merge" or "override".`);
}

function parseAgentConfig(content: string, configPath: string): AgentConfig {
    let parsed: unknown;

    try {
        parsed = JSON.parse(content.replace(/^\uFEFF/, ''));
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse ${configPath}: ${reason}`);
    }

    if (!isPlainObject(parsed)) {
        throw new Error(`Invalid agent config in ${configPath}: expected a JSON object.`);
    }

    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    if (!name) {
        throw new Error(`Invalid agent config in ${configPath}: missing non-empty "name".`);
    }

    if (parsed.description !== undefined && typeof parsed.description !== 'string') {
        throw new Error(`Invalid agent config in ${configPath}: "description" must be a string.`);
    }

    if (parsed.instructions !== undefined && typeof parsed.instructions !== 'string') {
        throw new Error(`Invalid agent config in ${configPath}: "instructions" must be a string.`);
    }

    if (parsed.modelProviderName !== undefined && typeof parsed.modelProviderName !== 'string') {
        throw new Error(`Invalid agent config in ${configPath}: "modelProviderName" must be a string.`);
    }

    if (parsed.modelName !== undefined && typeof parsed.modelName !== 'string') {
        throw new Error(`Invalid agent config in ${configPath}: "modelName" must be a string.`);
    }

    const inheritance = parseInheritance(parsed.inheritance, configPath);

    return {
        name,
        description: parsed.description,
        instructions: parsed.instructions,
        modelProviderName: parsed.modelProviderName,
        modelName: parsed.modelName,
        tools: parseBindings<AgentToolBinding>(parsed.tools, configPath, 'tools'),
        skills: parseBindings<AgentSkillBinding>(parsed.skills, configPath, 'skills'),
        inheritance
    };
}

async function determineStartScopePath(provider: IContextProvider, targetPath: string): Promise<string> {
    const normalizedTargetPath = normalizePath(targetPath) ?? '/';
    if (normalizedTargetPath === '/') {
        return '/';
    }

    try {
        await provider.readDocument(normalizedTargetPath);
        return getParentScopePath(normalizedTargetPath) ?? '/';
    } catch (error) {
        if (isDirectoryReadError(error)) {
            return normalizedTargetPath;
        }

        if (isMissingDocumentError(error)) {
            return getParentScopePath(normalizedTargetPath) ?? '/';
        }

        throw error;
    }
}

async function readScopedAgentMatch(provider: IContextProvider, scopePath: string): Promise<ScopedAgentMatch | null> {
    const configPath = getConfigPath(scopePath);

    try {
        const document = await provider.readDocument(configPath);
        return {
            scopePath,
            configPath,
            config: parseAgentConfig(decodeTextDocument(document.dataBase64), configPath)
        };
    } catch (error) {
        if (isMissingDocumentError(error)) {
            return null;
        }

        throw error;
    }
}

async function resolveScopedAgentConfig(
    provider: IContextProvider,
    targetPath: string,
    fallback: AgentConfig
): Promise<ResolvedAgentConfig> {
    const scopePath = await determineStartScopePath(provider, targetPath);
    const matches: ScopedAgentMatch[] = [];

    let cursor: string | null = scopePath;
    while (cursor) {
        const match = await readScopedAgentMatch(provider, cursor);
        if (match) {
            matches.push(match);
        }

        cursor = getParentScopePath(cursor);
    }

    const orderedMatches = [...matches].reverse();
    const fallbackResolved = createResolvedAgentConfig(scopePath, [], fallback);
    return orderedMatches.reduce<ResolvedAgentConfig>((current, match) => {
        return resolveChildAgentConfig(current, match.scopePath, match.configPath, match.config);
    }, fallbackResolved);
}

function normalizeTaskCalendarState(task: Task): Pick<
    Task,
    'calendarProviderId' | 'calendarEventId' | 'calendarSyncStatus' | 'calendarLastSyncedAt' | 'calendarLastSyncError'
> {
    return {
        calendarProviderId: task.calendarProviderId ?? null,
        calendarEventId: task.calendarEventId ?? null,
        calendarSyncStatus: task.calendarSyncStatus ?? null,
        calendarLastSyncedAt: task.calendarLastSyncedAt ?? null,
        calendarLastSyncError: task.calendarLastSyncError ?? null
    };
}

function normalizeTaskExecutionState(task: Task): Task['executionState'] {
    if (task.executionState === 'doing' || task.executionState === 'morning' || task.executionState === 'afternoon' || task.executionState === 'evening') {
        return task.executionState;
    }
    return null;
}

function normalizeTaskScope(documentPath?: string | null, agentKey?: string | null): { documentPath: string | null; agentKey: string | null } {
    const normalizedDocumentPath = documentPath ? normalizePath(documentPath) ?? null : null;
    const normalizedAgentKey = agentKey?.trim() ? agentKey.trim() : null;

    if (normalizedDocumentPath) {
        return {
            documentPath: normalizedDocumentPath,
            agentKey: null
        };
    }

    return {
        documentPath: null,
        agentKey: normalizedAgentKey
    };
}

export function createMockContextProvider(
    snapshot?: StoredWorkspaceSnapshot
): IContextProvider & { getTaskService(): TaskService; getTaskProvider(): TaskService } {
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
        conversations: [],
        tasks: []
    });

    let taskSequence = (currentSnapshot.tasks?.length ?? 0) + 1;

    const mockIdToPath = new Map<string, string>();
    const mockPathToId = new Map<string, string>();

    const taskService: TaskService = {
        async getTasks(
            documentPath?: string | null,
            agentKey?: string | null,
            completed?: boolean,
            tag?: TaskQueryTag | null
        ): Promise<Task[]> {
            const scope = normalizeTaskScope(documentPath, agentKey);
            const now = Date.now();
            return (currentSnapshot.tasks ?? [])
                .filter((task) => {
                    if (scope.documentPath !== null) {
                        if (task.documentPath !== scope.documentPath) {
                            return false;
                        }
                    } else if (scope.agentKey !== null) {
                        if ((scope.agentKey ?? null) !== (task.agentKey ?? null) || task.documentPath !== null) {
                            return false;
                        }
                    }

                    if (typeof completed === 'boolean' && task.completed !== completed) {
                        return false;
                    }

                    if (!matchesTaskTag(task, tag, now)) {
                        return false;
                    }

                    return true;
                })
                .map(cloneTask)
                .sort((left, right) => right.updatedAt - left.updatedAt);
        },
        async createTask(task: Task): Promise<Task> {
            const now = Date.now();
            const scope = normalizeTaskScope(task.documentPath, task.agentKey);
            const normalized: Task = {
                ...cloneTask(task),
                ...scope,
                ...normalizeTaskCalendarState(task),
                id: `mock-task-${taskSequence++}`,
                notes: task.notes ?? '',
                dueAt: task.dueAt ?? null,
                priority: task.priority ?? null,
                executionState: normalizeTaskExecutionState(task),
                completed: !!task.completed,
                createdAt: now,
                updatedAt: now,
                completedAt: task.completed ? now : null
            };
            currentSnapshot.tasks = [...(currentSnapshot.tasks ?? []), normalized];
            return cloneTask(normalized);
        },
        async updateTask(task: Task): Promise<Task> {
            const scope = normalizeTaskScope(task.documentPath, task.agentKey);
            const index = (currentSnapshot.tasks ?? []).findIndex((item) => item.id === task.id);
            if (index < 0) {
                throw new Error(`Task does not exist: ${task.id}`);
            }

            const existing = currentSnapshot.tasks![index];
            const updatedAt = Date.now();
            const normalized: Task = {
                ...existing,
                ...cloneTask(task),
                ...scope,
                ...normalizeTaskCalendarState(task),
                notes: task.notes ?? '',
                dueAt: task.dueAt ?? null,
                priority: task.priority ?? null,
                executionState: normalizeTaskExecutionState(task),
                updatedAt,
                completedAt: task.completed ? (existing.completedAt ?? updatedAt) : null
            };
            currentSnapshot.tasks![index] = normalized;
            return cloneTask(normalized);
        },
        async deleteTask(taskId: string): Promise<void> {
            currentSnapshot.tasks = (currentSnapshot.tasks ?? []).filter((task) => task.id !== taskId);
        },
        async setTaskCompleted(taskId: string, completed: boolean): Promise<Task> {
            const index = (currentSnapshot.tasks ?? []).findIndex((item) => item.id === taskId);
            if (index < 0) {
                throw new Error(`Task does not exist: ${taskId}`);
            }

            const existing = currentSnapshot.tasks![index];
            const updatedAt = Date.now();
            const normalized: Task = {
                ...existing,
                completed,
                updatedAt,
                completedAt: completed ? updatedAt : null
            };
            currentSnapshot.tasks![index] = normalized;
            return cloneTask(normalized);
        }
    };

    const provider: IContextProvider & IConversationQueryProvider & { getTaskService(): TaskService; getTaskProvider(): TaskService } = {
        id: 'mock-context',
        async initializeAccess(): Promise<void> {
            return undefined;
        },
        async getContext(): Promise<WorkspaceContext> {
            const agentConfigs = new Map<string, ResolvedAgentConfig>();
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
                            ownsMetadata: currentSnapshot.nodes.some((candidate) => (
                                candidate.kind === 'file'
                                && normalizePath(candidate.parentPath) === node.path
                                && candidate.name === '.agent.json'
                            )),
                            scopeKey: agentKey
                        };
                    }

                    return {
                        ...node,
                        parentPath: normalizePath(node.parentPath),
                        hasChildren: false,
                        scopeKey: agentKey
                    };
                }));
            };

            return {
                nodes: await buildNodes(),
                folderMetadata: Object.fromEntries(
                    [...agentConfigs.entries()].map(([scopeKey, config]) => [
                        scopeKey,
                        { scopeKey, data: config as unknown as Record<string, unknown> } satisfies FolderMetadata
                    ])
                )
            };
        },
        async getFolderMetadata(targetPath: string): Promise<FolderMetadata | null> {
            const context = await this.getContext();
            const normalized = normalizePath(targetPath) || '/';
            const findNode = (nodes: ContextNode[]): ContextNode | null => {
                for (const n of nodes) {
                    if (n.path === normalized) return n;
                    if (n.children) {
                        const found = findNode(n.children);
                        if (found) return found;
                    }
                }
                return null;
            };
            const node = findNode(context.nodes);
            const scopeKey = node?.scopeKey ?? DEFAULT_WORKSPACE_AGENT_KEY;
            return context.folderMetadata[scopeKey] ?? null;
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
        getTaskService() {
            return taskService;
        },
        // Legacy alias for older tests that still reach through the mock provider.
        getTaskProvider() {
            return taskService;
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
                ownsMetadata: false,
                scopeKey: resolved.scopePath.endsWith('/') ? resolved.scopePath : `${resolved.scopePath}/`
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

            remapNodeSubtree(currentSnapshot, normalizedPath, targetPath);
            remapMockIdIndex(mockIdToPath, mockPathToId, normalizedPath, targetPath);

            const resolved = await resolveScopedAgentConfig(provider, targetPath, DEFAULT_SCOPED_AGENT_CONFIG);
            return {
                path: targetPath,
                name: input.name.trim(),
                kind: node.kind,
                parentPath,
                hasChildren: node.kind === 'directory' ? nodeHasChildren(currentSnapshot.nodes, targetPath) : false,
                updatedAt: node.updatedAt,
                ownsMetadata: false,
                scopeKey: resolved.scopePath.endsWith('/') ? resolved.scopePath : `${resolved.scopePath}/`
            };
        },
        async moveNode(input: MoveContextNodeInput): Promise<ContextNode> {
            const normalizedPath = normalizePath(input.path);
            if (!normalizedPath) {
                throw new Error('Moving the root directory is not allowed.');
            }

            const node = ensureNode(currentSnapshot, normalizedPath);
            const targetParentPath = normalizePath(input.targetParentPath);
            if (targetParentPath) {
                const targetParentNode = ensureNode(currentSnapshot, targetParentPath);
                if (targetParentNode.kind !== 'directory') {
                    throw new Error(`Target parent is not a directory: ${targetParentPath}`);
                }
            }

            if (targetParentPath === normalizedPath || targetParentPath?.startsWith(`${normalizedPath}/`)) {
                throw new Error('Cannot move a node into itself or its descendant.');
            }

            const targetPath = getChildPath(targetParentPath, node.name);
            if (targetPath === normalizedPath) {
                const resolvedUnchanged = await resolveScopedAgentConfig(provider, targetPath, DEFAULT_SCOPED_AGENT_CONFIG);
                return {
                    path: targetPath,
                    name: node.name,
                    kind: node.kind,
                    parentPath: targetParentPath,
                    hasChildren: node.kind === 'directory' ? nodeHasChildren(currentSnapshot.nodes, targetPath) : false,
                    updatedAt: node.updatedAt,
                    ownsMetadata: false,
                    scopeKey: resolvedUnchanged.scopePath.endsWith('/') ? resolvedUnchanged.scopePath : `${resolvedUnchanged.scopePath}/`
                };
            }
            if (currentSnapshot.nodes.some((candidate) => candidate.path === targetPath && candidate.path !== normalizedPath)) {
                throw new Error(`Node already exists: ${targetPath}`);
            }

            remapNodeSubtree(currentSnapshot, normalizedPath, targetPath);
            remapMockIdIndex(mockIdToPath, mockPathToId, normalizedPath, targetPath);

            const movedNode = ensureNode(currentSnapshot, targetPath);
            const resolved = await resolveScopedAgentConfig(provider, targetPath, DEFAULT_SCOPED_AGENT_CONFIG);
            return {
                path: targetPath,
                name: movedNode.name,
                kind: movedNode.kind,
                parentPath: targetParentPath,
                hasChildren: movedNode.kind === 'directory' ? nodeHasChildren(currentSnapshot.nodes, targetPath) : false,
                updatedAt: movedNode.updatedAt,
                ownsMetadata: false,
                scopeKey: resolved.scopePath.endsWith('/') ? resolved.scopePath : `${resolved.scopePath}/`
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
        },
        async getDocumentId(path: string): Promise<string> {
            const normalizedPath = normalizePath(path);
            if (!normalizedPath) {
                throw new Error('Document path must not be empty.');
            }
            if (!isMarkdownPath(normalizedPath)) {
                throw new Error('Only Markdown documents can have document IDs.');
            }
            const existing = mockPathToId.get(normalizedPath);
            if (existing) {
                return existing;
            }
            const id = generateMockId();
            mockPathToId.set(normalizedPath, id);
            mockIdToPath.set(id, normalizedPath);
            return id;
        },
        async resolveDocumentIds(ids: string[]): Promise<Map<string, ContextNode | null>> {
            const context = await provider.getContext();
            const result = new Map<string, ContextNode | null>();
            for (const id of ids) {
                const virtualPath = mockIdToPath.get(id);
                if (!virtualPath) {
                    result.set(id, null);
                    continue;
                }
                const node = context.nodes.find((n) => n.path === virtualPath) ?? null;
                result.set(id, node);
            }
            return result;
        }
    };

    return provider;
}

function remapMockIdIndex(
    idToPath: Map<string, string>,
    pathToId: Map<string, string>,
    fromPath: string,
    toPath: string
): void {
    const affected: Array<{ from: string; to: string; id: string }> = [];
    for (const [vPath, id] of pathToId) {
        if (vPath === fromPath || vPath.startsWith(`${fromPath}/`)) {
            const suffix = vPath.slice(fromPath.length);
            affected.push({ from: vPath, to: `${toPath}${suffix}`, id });
        }
    }
    for (const { from, to, id } of affected) {
        pathToId.delete(from);
        pathToId.set(to, id);
        idToPath.set(id, to);
    }
}

function matchesTaskTag(task: Task, tag: TaskQueryTag | null | undefined, now: number): boolean {
    if (!tag || tag === 'all') {
        return true;
    }

    if (task.dueAt === null) {
        return false;
    }

    if (tag === 'planned') {
        return task.dueAt > now;
    }

    const dueDate = new Date(task.dueAt);
    const currentDate = new Date(now);
    return dueDate.getFullYear() === currentDate.getFullYear()
        && dueDate.getMonth() === currentDate.getMonth()
        && dueDate.getDate() === currentDate.getDate();
}
