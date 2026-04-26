import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Conversation } from '../../../core/src/interfaces/Conversation.ts';
import type { ConversationQuery, IConversationQueryProvider } from '../../../core/src/interfaces/IConversationPersistProvider.ts';
import {
    DEFAULT_SCOPED_AGENT_CONFIG,
    type AgentConfig,
    type AgentInheritanceMode,
    type AgentSkillBinding,
    type AgentToolBinding,
    type ContextDocument,
    type ContextNode,
    type ContextSearchMatch,
    type ContextSearchRequest,
    type CreateContextNodeInput,
    type IContextProvider,
    type ResolvedAgentConfig,
    type WorkspaceContext,
    type WriteContextDocumentInput,
    type WriteContextDocumentResult,
    createResolvedAgentConfig,
    resolveChildAgentConfig
} from '../coreRuntime.ts';

const DEFAULT_WORKSPACE_AGENT_KEY = '/' as const;
const TEXT_ENCODER = new TextEncoder();

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    text: 'text/plain',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    json: 'application/json',
    xml: 'application/xml',
    yml: 'application/yaml',
    yaml: 'application/yaml',
    csv: 'text/csv',
    html: 'text/html',
    htm: 'text/html'
};

interface SearchableScopedFile {
    path: string;
    readContent: () => Promise<string>;
}

export interface FileSystemContextProviderOptions {
    rootPath?: string;
    conversationQueryProvider?: IConversationQueryProvider | null;
}

type AgentBinding = AgentToolBinding | AgentSkillBinding;
type ParsedAgentConfig = AgentConfig & { inheritance?: AgentInheritanceMode; linkDir?: string };

interface EffectiveAgentBinding {
    agentKey: string;
    config: ResolvedAgentConfig;
}

interface MountedDirectoryBinding {
    aliasPath: string;
    aliasRealPath: string;
    targetRealPath: string;
}

function stripDataUriPrefix(value: string): string {
    const marker = ';base64,';
    const markerIndex = value.indexOf(marker);
    if (markerIndex === -1) {
        return value;
    }

    return value.slice(markerIndex + marker.length);
}

function encodeBase64(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64');
}

function decodeBase64(base64Value: string): Uint8Array {
    const normalized = stripDataUriPrefix(base64Value);
    return Uint8Array.from(Buffer.from(normalized, 'base64'));
}

function encodeTextDocument(text: string): string {
    return encodeBase64(TEXT_ENCODER.encode(text));
}

function inferDocumentMimeType(targetPath: string): string {
    const fileName = targetPath.split('/').pop() ?? targetPath;
    const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : '';
    return MIME_TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

function serializeDefaultAgentConfig(): string {
    return `${JSON.stringify(DEFAULT_SCOPED_AGENT_CONFIG, null, 2)}\n`;
}

function isTextDocumentMimeType(mimeType: string): boolean {
    return mimeType.startsWith('text/')
        || mimeType === 'application/json'
        || mimeType === 'application/xml'
        || mimeType === 'application/yaml';
}

function normalizeSearchScopePath(value?: string): string | undefined {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed === '/') {
        return undefined;
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const normalized = withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/, '');
    return normalized || undefined;
}

function normalizeSearchRequest(query: string | undefined, maxResults?: number): { query: string; maxResults: number } {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery) {
        throw new Error('query must not be empty.');
    }

    return {
        query: normalizedQuery,
        maxResults: typeof maxResults === 'number' && Number.isFinite(maxResults)
            ? Math.max(1, Math.floor(maxResults))
            : 20
    };
}

function isPathWithinScope(targetPath: string, scopePath?: string): boolean {
    const normalizedScope = normalizeSearchScopePath(scopePath);
    if (!normalizedScope) {
        return true;
    }

    return targetPath === normalizedScope || targetPath.startsWith(`${normalizedScope}/`);
}

async function ensureRootAgentConfigFile(rootDirectory: string): Promise<void> {
    const rootAgentConfigPath = path.join(rootDirectory, '.agent.json');
    if (await exists(rootAgentConfigPath)) {
        return;
    }

    await fs.writeFile(rootAgentConfigPath, serializeDefaultAgentConfig(), 'utf8');
}

function collectSearchMatches(filePath: string, content: string, query: string): ContextSearchMatch[] {
    const matches: ContextSearchMatch[] = [];
    const normalizedQuery = query.toLowerCase();
    const lines = content.split('\n');

    lines.forEach((lineContent, lineIndex) => {
        const haystack = lineContent.toLowerCase();
        let offset = 0;
        while (offset <= haystack.length) {
            const matchIndex = haystack.indexOf(normalizedQuery, offset);
            if (matchIndex < 0) {
                break;
            }

            matches.push({
                path: filePath,
                line: lineIndex + 1,
                column: matchIndex + 1,
                preview: lineContent
            });
            offset = matchIndex + Math.max(normalizedQuery.length, 1);
        }
    });

    return matches;
}

async function searchInScopedFiles(options: {
    query: string;
    scopePath?: string;
    maxResults?: number;
    files: Iterable<SearchableScopedFile> | AsyncIterable<SearchableScopedFile>;
}): Promise<ContextSearchMatch[]> {
    const { query, maxResults } = normalizeSearchRequest(options.query, options.maxResults);
    const searchableFiles: SearchableScopedFile[] = [];

    for await (const file of options.files) {
        if (!isPathWithinScope(file.path, options.scopePath)) {
            continue;
        }
        searchableFiles.push(file);
    }

    searchableFiles.sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'));

    const matches: ContextSearchMatch[] = [];
    for (const file of searchableFiles) {
        const content = await file.readContent();
        matches.push(...collectSearchMatches(file.path, content, query));
        if (matches.length >= maxResults) {
            return matches.slice(0, maxResults);
        }
    }

    return matches;
}

function normalizeVirtualPath(value?: string, { allowRoot = true }: { allowRoot?: boolean } = {}): string | undefined {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed === '/') {
        return allowRoot ? undefined : '/';
    }

    const rawPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const rawSegments = rawPath.split('/');
    if (rawSegments.some((segment) => segment === '..')) {
        throw new Error(`Path escapes the knowledge workspace root: ${value}`);
    }

    const normalized = path.posix.normalize(rawPath);
    if (!normalized.startsWith('/')) {
        throw new Error(`Invalid path: ${value}`);
    }
    if (normalized.includes('\0')) {
        throw new Error(`Invalid path: ${value}`);
    }
    return normalized;
}

function toVirtualPath(parentPath: string | undefined, name: string): string {
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.includes('/') || normalizedName === '.' || normalizedName === '..') {
        throw new Error('Node name is invalid.');
    }

    const normalizedParent = normalizeVirtualPath(parentPath);
    return normalizedParent ? path.posix.join(normalizedParent, normalizedName) : `/${normalizedName}`;
}

async function exists(targetPath: string): Promise<boolean> {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function getConfigPath(scopePath: string): string {
    return scopePath === '/' ? '/.agent.json' : `${scopePath}/.agent.json`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseInheritance(value: unknown, configPath: string): AgentInheritanceMode | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === 'merge' || value === 'override') {
        return value;
    }

    throw new Error(`Invalid inheritance in ${configPath}: expected "merge" or "override".`);
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

function parseAgentConfig(content: string, configPath: string): ParsedAgentConfig {
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

    if (parsed.linkDir !== undefined && typeof parsed.linkDir !== 'string') {
        throw new Error(`Invalid agent config in ${configPath}: "linkDir" must be a string.`);
    }

    return {
        name,
        description: parsed.description,
        instructions: parsed.instructions,
        modelProviderName: parsed.modelProviderName,
        modelName: parsed.modelName,
        tools: parseBindings<AgentToolBinding>(parsed.tools, configPath, 'tools'),
        skills: parseBindings<AgentSkillBinding>(parsed.skills, configPath, 'skills'),
        inheritance: parseInheritance(parsed.inheritance, configPath),
        linkDir: typeof parsed.linkDir === 'string' ? parsed.linkDir : undefined
    };
}

function sortContextNodes(nodes: ContextNode[]): ContextNode[] {
    return [...nodes].sort((left, right) => {
        if (left.kind !== right.kind) {
            return left.kind === 'directory' ? -1 : 1;
        }
        return left.name.localeCompare(right.name, 'zh-Hans-CN');
    });
}

function createDefaultAgentBinding(): EffectiveAgentBinding {
    return {
        agentKey: DEFAULT_WORKSPACE_AGENT_KEY,
        config: createResolvedAgentConfig('/', [], DEFAULT_SCOPED_AGENT_CONFIG)
    };
}

function normalizeMountedAliasPath(aliasName: string): string {
    return `/${aliasName}`;
}

function resolveMountedTargetCandidate(aliasRealPath: string, linkDir: string): string {
    const normalizedLinkDir = linkDir.trim();
    if (!normalizedLinkDir) {
        throw new Error('linkDir must not be empty.');
    }

    return path.resolve(aliasRealPath, normalizedLinkDir);
}

function isPathWithin(parentPath: string, candidatePath: string): boolean {
    const relative = path.relative(parentPath, candidatePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function findMountedDirectoryBinding(
    virtualPath: string,
    bindings: MountedDirectoryBinding[]
): MountedDirectoryBinding | undefined {
    let matched: MountedDirectoryBinding | undefined;

    for (const binding of bindings) {
        if (virtualPath === binding.aliasPath || virtualPath.startsWith(`${binding.aliasPath}/`)) {
            if (!matched || binding.aliasPath.length > matched.aliasPath.length) {
                matched = binding;
            }
        }
    }

    return matched;
}

function findContextNodeByPath(nodes: ContextNode[], targetPath: string): ContextNode | null {
    for (const node of nodes) {
        if (node.path === targetPath) {
            return node;
        }

        if (node.children?.length) {
            const nested = findContextNodeByPath(node.children, targetPath);
            if (nested) {
                return nested;
            }
        }
    }

    return null;
}

function resolveEffectiveAgentBinding(
    parent: EffectiveAgentBinding,
    scopePath: string,
    configPath: string,
    config: ParsedAgentConfig
): EffectiveAgentBinding {
    const normalizedAgentKey = scopePath.endsWith('/') ? scopePath : `${scopePath}/`;

    return {
        agentKey: normalizedAgentKey,
        config: resolveChildAgentConfig(parent.config, scopePath, configPath, config)
    };
}

export class FileSystemContextProvider implements IContextProvider {
    readonly id = 'local-file-context';
    private readonly rootPath?: string;
    private readonly conversationQueryProvider: IConversationQueryProvider | null;

    constructor(options: FileSystemContextProviderOptions = {}) {
        this.rootPath = options.rootPath?.trim() || undefined;
        this.conversationQueryProvider = options.conversationQueryProvider ?? null;
    }

    async initializeAccess(): Promise<void> {
        await this.resolveRootDirectory();
    }

    async getContext(): Promise<WorkspaceContext> {
        const rootDirectory = await this.resolveRootDirectory();
        await ensureRootAgentConfigFile(rootDirectory);
        const mountBindings = await this.resolveMountedDirectoryBindings(rootDirectory);
        const agentConfigs = new Map<string, ResolvedAgentConfig>();
        const rootAgent = await this.resolveDirectoryAgentBinding(rootDirectory, '/', createDefaultAgentBinding());
        agentConfigs.set(rootAgent.agentKey, rootAgent.config);

        const nodes = await this.buildDirectoryNodes({
            realPath: rootDirectory,
            virtualPath: undefined,
            inheritedAgent: rootAgent,
            agentConfigs,
            mountBindings
        });

        return {
            nodes,
            agentConfigs: Object.fromEntries(agentConfigs.entries())
        };
    }

    async getConversations(query: ConversationQuery): Promise<Conversation[]> {
        if (!this.conversationQueryProvider) {
            return [];
        }

        const normalizedDocumentPath = query.documentPath === undefined
            ? undefined
            : normalizeVirtualPath(query.documentPath, { allowRoot: false });
        if (query.documentPath !== undefined && !normalizedDocumentPath) {
            throw new Error('Document path must not be empty.');
        }

        return this.conversationQueryProvider.getConversations({
            ...query,
            documentPath: normalizedDocumentPath
        });
    }

    async readDocument(filePath: string): Promise<ContextDocument> {
        const normalizedPath = normalizeVirtualPath(filePath, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('Document path must not be empty.');
        }

        const realPath = await this.resolveRealPath(normalizedPath, { expectExisting: true, expectDirectory: false });
        const mimeType = inferDocumentMimeType(normalizedPath);
        const [contentBuffer, stats] = await Promise.all([
            fs.readFile(realPath),
            fs.stat(realPath)
        ]);

        return {
            path: normalizedPath,
            mimeType,
            dataBase64: isTextDocumentMimeType(mimeType)
                ? encodeTextDocument(contentBuffer.toString('utf8'))
                : encodeBase64(contentBuffer),
            updatedAt: stats.mtimeMs,
            version: `${stats.mtimeMs}`,
            canWrite: isTextDocumentMimeType(mimeType)
        };
    }

    async writeDocument(input: WriteContextDocumentInput): Promise<WriteContextDocumentResult> {
        const normalizedPath = normalizeVirtualPath(input.path, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('Document path must not be empty.');
        }

        if (!isTextDocumentMimeType(input.mimeType)) {
            throw new Error(`Current document type does not support writing yet: ${input.mimeType}`);
        }

        const realPath = await this.resolveRealPath(normalizedPath, { expectExisting: true, expectDirectory: false });
        if (input.expectedVersion) {
            const stats = await fs.stat(realPath);
            if (`${stats.mtimeMs}` !== input.expectedVersion) {
                throw new Error('The document version has changed. Please reload and try again.');
            }
        }

        await fs.writeFile(realPath, Buffer.from(decodeBase64(input.dataBase64)));
        const stats = await fs.stat(realPath);
        return {
            updatedAt: stats.mtimeMs,
            version: `${stats.mtimeMs}`
        };
    }

    async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
        const parentPath = normalizeVirtualPath(input.parentPath);
        const targetPath = toVirtualPath(parentPath, input.name);
        const targetRealPath = await this.resolveRealPath(targetPath, { expectExisting: false });

        if (await exists(targetRealPath)) {
            throw new Error(`Node already exists: ${targetPath}`);
        }

        if (parentPath) {
            await this.resolveRealPath(parentPath, { expectExisting: true, expectDirectory: true });
        }

        if (input.kind === 'directory') {
            await fs.mkdir(targetRealPath);
        } else {
            await fs.writeFile(targetRealPath, '', 'utf8');
        }

        const context = await this.getContext();
        const createdNode = findContextNodeByPath(context.nodes, targetPath);
        if (!createdNode) {
            throw new Error(`Unable to find the node in context after creation: ${targetPath}`);
        }

        return createdNode;
    }

    async deleteNode(targetPath: string): Promise<void> {
        const normalizedPath = normalizeVirtualPath(targetPath, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('Deleting the root directory is not allowed.');
        }

        const rootDirectory = await this.resolveRootDirectory();
        const mountBindings = await this.resolveMountedDirectoryBindings(rootDirectory);
        const mountedRoot = mountBindings.find((binding) => binding.aliasPath === normalizedPath);
        const realPath = mountedRoot?.aliasRealPath
            ?? await this.resolveRealPath(normalizedPath, { expectExisting: true });
        await fs.rm(realPath, { recursive: true, force: false });
    }

    async renameNode(input: { path: string; name: string }): Promise<ContextNode> {
        const normalizedPath = normalizeVirtualPath(input.path, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('Renaming the root directory is not allowed.');
        }

        const rootDirectory = await this.resolveRootDirectory();
        const mountBindings = await this.resolveMountedDirectoryBindings(rootDirectory);
        const mountedRoot = mountBindings.find((binding) => binding.aliasPath === normalizedPath);
        const sourceRealPath = mountedRoot?.aliasRealPath
            ?? await this.resolveRealPath(normalizedPath, { expectExisting: true });
        const parentPath = path.posix.dirname(normalizedPath) === '/' ? undefined : path.posix.dirname(normalizedPath);
        const targetPath = toVirtualPath(parentPath, input.name);
        const targetRealPath = await this.resolveRealPath(targetPath, { expectExisting: false });

        if (await exists(targetRealPath)) {
            throw new Error(`Node already exists: ${targetPath}`);
        }

        await fs.rename(sourceRealPath, targetRealPath);
        const context = await this.getContext();
        const renamedNode = findContextNodeByPath(context.nodes, targetPath);
        if (!renamedNode) {
            throw new Error(`Unable to find the node in context after rename: ${targetPath}`);
        }

        return renamedNode;
    }

    async searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
        const rootDirectory = await this.resolveRootDirectory();
        const mountBindings = await this.resolveMountedDirectoryBindings(rootDirectory);
        const scopePath = normalizeVirtualPath(request.scopePath);
        const startDirectory = scopePath
            ? await this.resolveRealPath(scopePath, { expectExisting: true, expectDirectory: true })
            : rootDirectory;
        const files = await this.collectSearchableFiles({
            directoryPath: startDirectory,
            virtualPath: normalizeSearchScopePath(scopePath ?? '/'),
            mountBindings
        });
        return searchInScopedFiles({
            query: request.query,
            scopePath,
            maxResults: request.maxResults,
            files
        });
    }

    private async resolveRootDirectory(): Promise<string> {
        if (!this.rootPath) {
            throw new Error('CHATPRISM_KNOWLEDGE_ROOT is not configured.');
        }

        const configuredRoot = path.resolve(this.rootPath);
        const stats = await fs.stat(configuredRoot).catch(() => {
            throw new Error(`Knowledge workspace root directory does not exist: ${configuredRoot}`);
        });

        if (!stats.isDirectory()) {
            throw new Error(`Knowledge workspace root path is not a directory: ${configuredRoot}`);
        }

        return fs.realpath(configuredRoot);
    }

    private async resolveRealPath(
        virtualPath: string | undefined,
        options: { expectExisting: boolean; expectDirectory?: boolean }
    ): Promise<string> {
        const rootDirectory = await this.resolveRootDirectory();
        const normalizedPath = virtualPath ? normalizeVirtualPath(virtualPath, { allowRoot: false }) : undefined;
        const mountBindings = await this.resolveMountedDirectoryBindings(rootDirectory);
        const mountedBinding = normalizedPath ? findMountedDirectoryBinding(normalizedPath, mountBindings) : undefined;

        if (normalizedPath && mountedBinding) {
            const suffix = normalizedPath.length === mountedBinding.aliasPath.length
                ? ''
                : normalizedPath.slice(mountedBinding.aliasPath.length);
            const candidatePath = suffix === '/.agent.json'
                ? path.join(mountedBinding.aliasRealPath, '.agent.json')
                : suffix
                ? path.resolve(mountedBinding.targetRealPath, `.${suffix}`)
                : mountedBinding.targetRealPath;

            if (!options.expectExisting) {
                const parentDirectory = path.dirname(candidatePath);
                await fs.realpath(parentDirectory).catch(() => {
                    throw new Error(`Parent directory does not exist: ${virtualPath ?? '/'}`);
                });
                return candidatePath;
            }

            const resolvedPath = await fs.realpath(candidatePath).catch(() => {
                throw new Error(`Node does not exist: ${virtualPath ?? '/'}`);
            });

            if (options.expectDirectory !== undefined) {
                const stats = await fs.stat(resolvedPath);
                if (options.expectDirectory && !stats.isDirectory()) {
                    throw new Error(`Node is not a directory: ${virtualPath ?? '/'}`);
                }
                if (!options.expectDirectory && !stats.isFile()) {
                    throw new Error(`Node is not a file: ${virtualPath ?? '/'}`);
                }
            }

            return resolvedPath;
        }

        const relativePath = normalizedPath ? `.${normalizedPath}` : '.';
        const candidatePath = path.resolve(rootDirectory, relativePath);

        if (!this.isInsideRoot(rootDirectory, candidatePath)) {
            throw new Error(`Path escapes the knowledge workspace root: ${virtualPath ?? '/'}`);
        }

        if (!options.expectExisting) {
            const parentDirectory = path.dirname(candidatePath);
            const resolvedParent = await fs.realpath(parentDirectory).catch(() => {
                throw new Error(`Parent directory does not exist: ${virtualPath ?? '/'}`);
            });
            if (!this.isInsideRoot(rootDirectory, resolvedParent)) {
                throw new Error(`Path escapes the knowledge workspace root: ${virtualPath ?? '/'}`);
            }
            return candidatePath;
        }

        const resolvedPath = await fs.realpath(candidatePath).catch(() => {
            throw new Error(`Node does not exist: ${virtualPath ?? '/'}`);
        });
        if (!this.isInsideRoot(rootDirectory, resolvedPath)) {
            throw new Error(`Path escapes the knowledge workspace root: ${virtualPath ?? '/'}`);
        }

        if (options.expectDirectory !== undefined) {
            const stats = await fs.stat(resolvedPath);
            if (options.expectDirectory && !stats.isDirectory()) {
                throw new Error(`Node is not a directory: ${virtualPath ?? '/'}`);
            }
            if (!options.expectDirectory && !stats.isFile()) {
                throw new Error(`Node is not a file: ${virtualPath ?? '/'}`);
            }
        }

        return resolvedPath;
    }

    private isInsideRoot(rootDirectory: string, candidatePath: string): boolean {
        const relative = path.relative(rootDirectory, candidatePath);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }

    private async buildDirectoryNodes(input: {
        realPath: string;
        virtualPath?: string;
        inheritedAgent: EffectiveAgentBinding;
        agentConfigs: Map<string, ResolvedAgentConfig>;
        mountBindings: MountedDirectoryBinding[];
    }): Promise<ContextNode[]> {
        const entries = await fs.readdir(input.realPath, { withFileTypes: true });
        const visibleEntries = entries.filter((entry) => !entry.name.startsWith('.'));
        const nodes = await Promise.all(visibleEntries.map(async (entry) => {
            const virtualPath = input.virtualPath
                ? path.posix.join(input.virtualPath, entry.name)
                : `/${entry.name}`;
            const mountedBinding = input.virtualPath ? undefined : findMountedDirectoryBinding(virtualPath, input.mountBindings);

            if (entry.isDirectory() && mountedBinding) {
                const stats = await fs.stat(mountedBinding.aliasRealPath);
                const directoryAgent = await this.resolveDirectoryAgentBinding(
                    mountedBinding.aliasRealPath,
                    virtualPath,
                    input.inheritedAgent
                );
                input.agentConfigs.set(directoryAgent.agentKey, directoryAgent.config);
                const children = await this.buildDirectoryNodes({
                    realPath: mountedBinding.targetRealPath,
                    virtualPath,
                    inheritedAgent: directoryAgent,
                    agentConfigs: input.agentConfigs,
                    mountBindings: input.mountBindings
                });

                return {
                    path: virtualPath,
                    name: entry.name,
                    kind: 'directory',
                    parentPath: input.virtualPath,
                    hasChildren: children.length > 0,
                    updatedAt: stats.mtimeMs,
                    children,
                    isAgentOwner: directoryAgent.agentKey === (virtualPath.endsWith('/') ? virtualPath : `${virtualPath}/`),
                    agentKey: directoryAgent.agentKey
                } satisfies ContextNode;
            }

            const realPath = path.join(input.realPath, entry.name);
            const stats = await fs.stat(realPath);

            if (entry.isDirectory()) {
                const directoryAgent = await this.resolveDirectoryAgentBinding(realPath, virtualPath, input.inheritedAgent);
                input.agentConfigs.set(directoryAgent.agentKey, directoryAgent.config);
                const children = await this.buildDirectoryNodes({
                    realPath,
                    virtualPath,
                    inheritedAgent: directoryAgent,
                    agentConfigs: input.agentConfigs,
                    mountBindings: input.mountBindings
                });

                return {
                    path: virtualPath,
                    name: entry.name,
                    kind: 'directory',
                    parentPath: input.virtualPath,
                    hasChildren: children.length > 0,
                    updatedAt: stats.mtimeMs,
                    children,
                    isAgentOwner: directoryAgent.agentKey === (virtualPath.endsWith('/') ? virtualPath : `${virtualPath}/`),
                    agentKey: directoryAgent.agentKey
                } satisfies ContextNode;
            }

            return {
                path: virtualPath,
                name: entry.name,
                kind: 'file',
                parentPath: input.virtualPath,
                hasChildren: false,
                updatedAt: stats.mtimeMs,
                agentKey: input.inheritedAgent.agentKey
            } satisfies ContextNode;
        }));

        return sortContextNodes(nodes);
    }

    private async resolveDirectoryAgentBinding(
        realPath: string,
        scopePath: string,
        inheritedAgent: EffectiveAgentBinding
    ): Promise<EffectiveAgentBinding> {
        const configPath = getConfigPath(scopePath);
        const realConfigPath = path.join(realPath, '.agent.json');

        if (!(await exists(realConfigPath))) {
            return inheritedAgent;
        }

        const content = await fs.readFile(realConfigPath, 'utf8');
        const config = parseAgentConfig(content, configPath);
        if (scopePath === '/') {
            return {
                agentKey: DEFAULT_WORKSPACE_AGENT_KEY,
                config: createResolvedAgentConfig(scopePath, [configPath], config)
            };
        }

        return resolveEffectiveAgentBinding(inheritedAgent, scopePath, configPath, config);
    }

    private async resolveMountedDirectoryBindings(rootDirectory: string): Promise<MountedDirectoryBinding[]> {
        const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
        const visibleEntries = entries.filter((entry) => !entry.name.startsWith('.'));
        const bindings: MountedDirectoryBinding[] = [];

        for (const entry of visibleEntries) {
            if (!entry.isDirectory()) {
                continue;
            }

            const aliasPath = normalizeMountedAliasPath(entry.name);
            const aliasRealPath = path.join(rootDirectory, entry.name);
            const configRealPath = path.join(aliasRealPath, '.agent.json');
            if (!(await exists(configRealPath))) {
                continue;
            }

            const configContent = await fs.readFile(configRealPath, 'utf8');
            const config = parseAgentConfig(configContent, getConfigPath(aliasPath));
            if (config.linkDir === undefined) {
                continue;
            }

            const visibleChildren = (await fs.readdir(aliasRealPath, { withFileTypes: true }))
                .filter((child) => !child.name.startsWith('.') && child.name !== '.agent.json');
            if (visibleChildren.length > 0) {
                throw new Error(`Invalid mount entry ${aliasPath}: only .agent.json is allowed.`);
            }

            const targetCandidate = resolveMountedTargetCandidate(aliasRealPath, config.linkDir);
            const targetRealPath = await fs.realpath(targetCandidate).catch(() => {
                throw new Error(`Mount target directory does not exist: ${config.linkDir}`);
            });
            const targetStats = await fs.stat(targetRealPath);
            if (!targetStats.isDirectory()) {
                throw new Error(`Mount target is not a directory: ${config.linkDir}`);
            }

            if (isPathWithin(targetRealPath, aliasRealPath)) {
                throw new Error(`Mount target must not contain the mount entry itself: ${config.linkDir}`);
            }

            bindings.push({
                aliasPath,
                aliasRealPath,
                targetRealPath
            });
        }

        bindings.sort((left, right) => left.aliasPath.localeCompare(right.aliasPath, 'zh-Hans-CN'));
        return bindings;
    }

    private async collectSearchableFiles(input: {
        directoryPath: string;
        virtualPath?: string;
        mountBindings: MountedDirectoryBinding[];
    }): Promise<Array<{ path: string; readContent: () => Promise<string> }>> {
        const files: Array<{ path: string; readContent: () => Promise<string> }> = [];

        const walk = async (directoryPath: string, currentVirtualPath?: string): Promise<void> => {
            const entries = await fs.readdir(directoryPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.')) {
                    continue;
                }

                const entryVirtualPath = currentVirtualPath ? `${currentVirtualPath}/${entry.name}` : `/${entry.name}`;
                const entryRealPath = path.join(directoryPath, entry.name);

                if (!currentVirtualPath) {
                    const mountedBinding = findMountedDirectoryBinding(entryVirtualPath, input.mountBindings);
                    if (entry.isDirectory() && mountedBinding) {
                        await walk(mountedBinding.targetRealPath, entryVirtualPath);
                        continue;
                    }
                }

                if (entry.isDirectory()) {
                    await walk(entryRealPath, entryVirtualPath);
                    continue;
                }

                files.push({
                    path: entryVirtualPath,
                    readContent: async () => {
                        const mimeType = inferDocumentMimeType(entryVirtualPath);
                        if (!isTextDocumentMimeType(mimeType)) {
                            return '';
                        }

                        return fs.readFile(entryRealPath, 'utf8');
                    }
                });
            }
        };

        await walk(input.directoryPath, input.virtualPath);
        return files;
    }
}
