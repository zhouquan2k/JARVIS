import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
    type AgentConfig,
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
    type WriteContextDocumentInput
} from '../coreRuntime.ts';

const DEFAULT_WORKSPACE_AGENT_KEY = '/' as const;
const TEXT_ENCODER = new TextEncoder();

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    text: 'text/plain',
    pdf: 'application/pdf',
    json: 'application/json',
    xml: 'application/xml',
    yml: 'application/yaml',
    yaml: 'application/yaml',
    csv: 'text/csv',
    html: 'text/html',
    htm: 'text/html'
};

const DEFAULT_SCOPED_AGENT_CONFIG: AgentConfig = Object.freeze({
    name: 'Default Knowledge Agent',
    description: 'General-purpose assistant for the knowledge workspace.',
    modelProviderName: 'gemini-api',
    modelName: 'Gemini Pro Latest',
    instructions: [
        'Treat the active file as the primary context for the current request when it is provided.',
        'Use workspace tools to gather additional relevant information from the current scope only when needed.',
        'Do not claim to have used tools that are not available, and do not infer facts outside the current scope without checking.'
    ].join(' '),
    tools: [
        { id: 'read_current_file', description: 'Read the currently active file.' },
        { id: 'list_directory', description: 'List files and directories within the knowledge workspace.' },
        { id: 'read_file', description: 'Read a file within the current knowledge workspace.' },
        { id: 'search_in_scope', description: 'Search for relevant text within the current agent scope.' },
        { id: 'replace_text_in_file', description: 'Replace an exact text match in a file.' },
        { id: 'replace_range_in_file', description: 'Replace text within a specific line and column range.' },
        { id: 'insert_text_in_file', description: 'Insert text at a specific position in a file.' },
        { id: 'delete_range_in_file', description: 'Delete text within a specific line and column range.' },
        { id: 'write_file', description: 'Create or overwrite an entire file.' }
    ]
});

interface SearchableScopedFile {
    path: string;
    readContent: () => Promise<string>;
}

export interface FileSystemContextProviderOptions {
    rootPath?: string;
}

type AgentInheritanceMode = 'merge' | 'override';
type AgentBinding = AgentToolBinding | AgentSkillBinding;
type ParsedAgentConfig = AgentConfig & { inheritance?: AgentInheritanceMode };

interface EffectiveAgentBinding {
    agentKey: string;
    config: ResolvedAgentConfig;
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
        throw new Error('query 不能为空。');
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
        throw new Error(`路径超出知识工作区根目录: ${value}`);
    }

    const normalized = path.posix.normalize(rawPath);
    if (!normalized.startsWith('/')) {
        throw new Error(`非法路径: ${value}`);
    }
    if (normalized.includes('\0')) {
        throw new Error(`非法路径: ${value}`);
    }
    return normalized;
}

function toVirtualPath(parentPath: string | undefined, name: string): string {
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.includes('/') || normalizedName === '.' || normalizedName === '..') {
        throw new Error('节点名称不合法。');
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

function normalizeInstructions(value?: string): string {
    return value?.trim() ?? '';
}

function mergeInstructions(parent?: string, child?: string): string | undefined {
    const merged = [normalizeInstructions(parent), normalizeInstructions(child)].filter(Boolean).join('\n\n');
    return merged || undefined;
}

function cloneBindings<T extends AgentBinding>(bindings?: T[]): T[] | undefined {
    return bindings?.map((binding) => ({ ...binding }));
}

function mergeBindings<T extends AgentBinding>(parent?: T[], child?: T[]): T[] | undefined {
    const merged = new Map<string, T>();

    parent?.forEach((binding) => {
        merged.set(binding.id, { ...binding });
    });
    child?.forEach((binding) => {
        merged.set(binding.id, { ...binding });
    });

    return merged.size > 0 ? Array.from(merged.values()) : undefined;
}

function cloneAgentConfig(config: AgentConfig): AgentConfig {
    return {
        name: config.name,
        description: config.description,
        instructions: config.instructions,
        modelProviderName: config.modelProviderName,
        modelName: config.modelName,
        tools: cloneBindings(config.tools),
        skills: cloneBindings(config.skills)
    };
}

function mergeAgentConfigs(parent: AgentConfig, child: AgentConfig): AgentConfig {
    return {
        name: child.name || parent.name,
        description: child.description ?? parent.description,
        instructions: mergeInstructions(parent.instructions, child.instructions),
        modelProviderName: child.modelProviderName ?? parent.modelProviderName,
        modelName: child.modelName ?? parent.modelName,
        tools: mergeBindings(parent.tools, child.tools),
        skills: mergeBindings(parent.skills, child.skills)
    };
}

function createResolvedAgentConfig(
    scopePath: string,
    sourcePaths: string[],
    config: AgentConfig
): ResolvedAgentConfig {
    const instructions = normalizeInstructions(config.instructions);

    return {
        ...cloneAgentConfig(config),
        scopePath,
        sourcePaths: [...sourcePaths],
        effectiveInstructions: instructions,
        instructions: instructions || undefined
    };
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

    return {
        name,
        description: parsed.description,
        instructions: parsed.instructions,
        modelProviderName: parsed.modelProviderName,
        modelName: parsed.modelName,
        tools: parseBindings<AgentToolBinding>(parsed.tools, configPath, 'tools'),
        skills: parseBindings<AgentSkillBinding>(parsed.skills, configPath, 'skills'),
        inheritance: parseInheritance(parsed.inheritance, configPath)
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
    const parentConfig = parent.config;
    const merged = config.inheritance === 'override'
        ? cloneAgentConfig(config)
        : mergeAgentConfigs(parentConfig, config);
    const sourcePaths = config.inheritance === 'override'
        ? [configPath]
        : [...parentConfig.sourcePaths, configPath];

    const normalizedAgentKey = scopePath.endsWith('/') ? scopePath : `${scopePath}/`;

    return {
        agentKey: normalizedAgentKey,
        config: createResolvedAgentConfig(scopePath, sourcePaths, merged)
    };
}

export class FileSystemContextProvider implements IContextProvider {
    readonly id = 'local-file-context';
    private readonly rootPath?: string;

    constructor(options: FileSystemContextProviderOptions = {}) {
        this.rootPath = options.rootPath?.trim() || undefined;
    }

    async initializeAccess(): Promise<void> {
        await this.resolveRootDirectory();
    }

    async getContext(): Promise<WorkspaceContext> {
        const rootDirectory = await this.resolveRootDirectory();
        const agentConfigs = new Map<string, ResolvedAgentConfig>();
        const rootAgent = await this.resolveDirectoryAgentBinding(rootDirectory, '/', createDefaultAgentBinding());
        agentConfigs.set(rootAgent.agentKey, rootAgent.config);

        const nodes = await this.buildDirectoryNodes({
            realPath: rootDirectory,
            virtualPath: undefined,
            inheritedAgent: rootAgent,
            agentConfigs
        });

        return {
            nodes,
            agentConfigs: Object.fromEntries(agentConfigs.entries())
        };
    }

    async readDocument(filePath: string): Promise<ContextDocument> {
        const normalizedPath = normalizeVirtualPath(filePath, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('文档路径不能为空。');
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

    async writeDocument(input: WriteContextDocumentInput): Promise<void> {
        const normalizedPath = normalizeVirtualPath(input.path, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('文档路径不能为空。');
        }

        if (!isTextDocumentMimeType(input.mimeType)) {
            throw new Error(`当前文档类型暂不支持写入: ${input.mimeType}`);
        }

        const realPath = await this.resolveRealPath(normalizedPath, { expectExisting: true, expectDirectory: false });
        if (input.expectedVersion) {
            const stats = await fs.stat(realPath);
            if (`${stats.mtimeMs}` !== input.expectedVersion) {
                throw new Error('文档版本已变更，请重新读取后再试。');
            }
        }

        await fs.writeFile(realPath, Buffer.from(decodeBase64(input.dataBase64)));
    }

    async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
        const parentPath = normalizeVirtualPath(input.parentPath);
        const targetPath = toVirtualPath(parentPath, input.name);
        const targetRealPath = await this.resolveRealPath(targetPath, { expectExisting: false });

        if (await exists(targetRealPath)) {
            throw new Error(`节点已存在: ${targetPath}`);
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
            throw new Error(`创建节点后无法在上下文中找到: ${targetPath}`);
        }

        return createdNode;
    }

    async deleteNode(targetPath: string): Promise<void> {
        const normalizedPath = normalizeVirtualPath(targetPath, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('不允许删除根目录。');
        }

        const realPath = await this.resolveRealPath(normalizedPath, { expectExisting: true });
        await fs.rm(realPath, { recursive: true, force: false });
    }

    async renameNode(input: { path: string; name: string }): Promise<ContextNode> {
        const normalizedPath = normalizeVirtualPath(input.path, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('不允许重命名根目录。');
        }

        const sourceRealPath = await this.resolveRealPath(normalizedPath, { expectExisting: true });
        const parentPath = path.posix.dirname(normalizedPath) === '/' ? undefined : path.posix.dirname(normalizedPath);
        const targetPath = toVirtualPath(parentPath, input.name);
        const targetRealPath = await this.resolveRealPath(targetPath, { expectExisting: false });

        if (await exists(targetRealPath)) {
            throw new Error(`节点已存在: ${targetPath}`);
        }

        await fs.rename(sourceRealPath, targetRealPath);
        const context = await this.getContext();
        const renamedNode = findContextNodeByPath(context.nodes, targetPath);
        if (!renamedNode) {
            throw new Error(`重命名节点后无法在上下文中找到: ${targetPath}`);
        }

        return renamedNode;
    }

    async searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
        const rootDirectory = await this.resolveRootDirectory();
        const scopePath = normalizeVirtualPath(request.scopePath);
        const startDirectory = scopePath
            ? path.join(rootDirectory, ...scopePath.split('/').filter(Boolean))
            : rootDirectory;

        const files: Array<{ path: string; readContent: () => Promise<string> }> = [];
        const walk = async (directoryPath: string, currentVirtualPath?: string): Promise<void> => {
            const entries = await fs.readdir(directoryPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.')) continue;
                const entryVirtualPath = currentVirtualPath ? `${currentVirtualPath}/${entry.name}` : `/${entry.name}`;
                const entryRealPath = path.join(directoryPath, entry.name);
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

        await walk(startDirectory, normalizeSearchScopePath(scopePath ?? '/'));
        return searchInScopedFiles({
            query: request.query,
            scopePath,
            maxResults: request.maxResults,
            files
        });
    }

    private async resolveRootDirectory(): Promise<string> {
        if (!this.rootPath) {
            throw new Error('CHATPRISM_KNOWLEDGE_ROOT 未配置。');
        }

        const configuredRoot = path.resolve(this.rootPath);
        const stats = await fs.stat(configuredRoot).catch(() => {
            throw new Error(`知识工作区根目录不存在: ${configuredRoot}`);
        });

        if (!stats.isDirectory()) {
            throw new Error(`知识工作区根路径不是目录: ${configuredRoot}`);
        }

        return fs.realpath(configuredRoot);
    }

    private async resolveRealPath(
        virtualPath: string | undefined,
        options: { expectExisting: boolean; expectDirectory?: boolean }
    ): Promise<string> {
        const rootDirectory = await this.resolveRootDirectory();
        const relativePath = virtualPath ? `.${virtualPath}` : '.';
        const candidatePath = path.resolve(rootDirectory, relativePath);

        if (!this.isInsideRoot(rootDirectory, candidatePath)) {
            throw new Error(`路径超出知识工作区根目录: ${virtualPath ?? '/'}`);
        }

        if (!options.expectExisting) {
            const parentDirectory = path.dirname(candidatePath);
            const resolvedParent = await fs.realpath(parentDirectory).catch(() => {
                throw new Error(`父目录不存在: ${virtualPath ?? '/'}`);
            });
            if (!this.isInsideRoot(rootDirectory, resolvedParent)) {
                throw new Error(`路径超出知识工作区根目录: ${virtualPath ?? '/'}`);
            }
            return candidatePath;
        }

        const resolvedPath = await fs.realpath(candidatePath).catch(() => {
            throw new Error(`节点不存在: ${virtualPath ?? '/'}`);
        });
        if (!this.isInsideRoot(rootDirectory, resolvedPath)) {
            throw new Error(`路径超出知识工作区根目录: ${virtualPath ?? '/'}`);
        }

        if (options.expectDirectory !== undefined) {
            const stats = await fs.stat(resolvedPath);
            if (options.expectDirectory && !stats.isDirectory()) {
                throw new Error(`节点不是目录: ${virtualPath ?? '/'}`);
            }
            if (!options.expectDirectory && !stats.isFile()) {
                throw new Error(`节点不是文件: ${virtualPath ?? '/'}`);
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
    }): Promise<ContextNode[]> {
        const entries = await fs.readdir(input.realPath, { withFileTypes: true });
        const visibleEntries = entries.filter((entry) => !entry.name.startsWith('.'));
        const nodes = await Promise.all(visibleEntries.map(async (entry) => {
            const virtualPath = input.virtualPath
                ? path.posix.join(input.virtualPath, entry.name)
                : `/${entry.name}`;
            const realPath = path.join(input.realPath, entry.name);
            const stats = await fs.stat(realPath);

            if (entry.isDirectory()) {
                const directoryAgent = await this.resolveDirectoryAgentBinding(realPath, virtualPath, input.inheritedAgent);
                input.agentConfigs.set(directoryAgent.agentKey, directoryAgent.config);
                const children = await this.buildDirectoryNodes({
                    realPath,
                    virtualPath,
                    inheritedAgent: directoryAgent,
                    agentConfigs: input.agentConfigs
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
        return resolveEffectiveAgentBinding(inheritedAgent, scopePath, configPath, config);
    }
}
