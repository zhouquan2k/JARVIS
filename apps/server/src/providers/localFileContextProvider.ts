import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
    normalizeScopePath as normalizeSearchScopePath,
    searchInScopedFiles
} from '../../../../packages/core/src/providers/fileSearch.ts';
import type {
    AgentConfig,
    AgentInheritanceMode,
    AgentSkillBinding,
    AgentToolBinding,
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    ContextProvider,
    CreateContextNodeInput,
    ResolvedAgentConfig
} from '../types/context.js';

export interface LocalFileContextProviderOptions {
    rootPath?: string;
}

const DEFAULT_SCOPED_AGENT_CONFIG: AgentConfig = {
    name: 'Default Knowledge Agent',
    description: 'General-purpose assistant for the knowledge workspace.',
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
};

type AgentBinding = AgentToolBinding | AgentSkillBinding;

interface ScopedAgentMatch {
    scopePath: string;
    configPath: string;
    config: AgentConfig;
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

function normalizeScopePath(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '/') {
        return '/';
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function getParentScopePath(pathValue: string): string | null {
    const normalized = normalizeScopePath(pathValue);
    if (normalized === '/') {
        return null;
    }

    const lastSlashIndex = normalized.lastIndexOf('/');
    return lastSlashIndex <= 0 ? '/' : normalized.slice(0, lastSlashIndex);
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
        skills: cloneBindings(config.skills),
        inheritance: config.inheritance
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
        skills: mergeBindings(parent.skills, child.skills),
        inheritance: child.inheritance ?? parent.inheritance ?? 'merge'
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

export class LocalFileContextProvider implements ContextProvider {
    readonly id = 'local-file-context';
    private readonly rootPath?: string;

    constructor(options: LocalFileContextProviderOptions = {}) {
        this.rootPath = options.rootPath?.trim() || undefined;
    }

    async initializeAccess(): Promise<void> {
        await this.resolveRootDirectory();
    }

    async listTree(parentPath?: string): Promise<ContextNode[]> {
        const rootDirectory = await this.resolveRootDirectory();
        const normalizedParent = normalizeVirtualPath(parentPath);
        const directoryPath = await this.resolveRealPath(normalizedParent, { expectExisting: true, expectDirectory: true });
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });

        const nodes = await Promise.all(entries.map(async (entry) => {
            const virtualPath = normalizedParent
                ? path.posix.join(normalizedParent, entry.name)
                : `/${entry.name}`;
            const entryPath = path.join(directoryPath, entry.name);
            const stats = await fs.stat(entryPath);
            const kind = entry.isDirectory() ? 'directory' : 'file';

            let hasChildren = false;
            if (kind === 'directory') {
                const childEntries = await fs.readdir(entryPath);
                hasChildren = childEntries.length > 0;
            }

            return {
                path: virtualPath,
                name: entry.name,
                kind,
                parentPath: normalizedParent,
                hasChildren,
                updatedAt: stats.mtimeMs
            } satisfies ContextNode;
        }));

        return nodes.sort((left, right) => {
            if (left.kind !== right.kind) {
                return left.kind === 'directory' ? -1 : 1;
            }
            return left.name.localeCompare(right.name, 'zh-Hans-CN');
        });
    }

    async readDocument(filePath: string): Promise<ContextDocument> {
        const normalizedPath = normalizeVirtualPath(filePath, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('文档路径不能为空。');
        }

        const realPath = await this.resolveRealPath(normalizedPath, { expectExisting: true, expectDirectory: false });
        const [content, stats] = await Promise.all([
            fs.readFile(realPath, 'utf8'),
            fs.stat(realPath)
        ]);

        return {
            path: normalizedPath,
            content,
            updatedAt: stats.mtimeMs,
            version: `${stats.mtimeMs}`
        };
    }

    async writeDocument(filePath: string, content: string): Promise<void> {
        const normalizedPath = normalizeVirtualPath(filePath, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('文档路径不能为空。');
        }

        const realPath = await this.resolveRealPath(normalizedPath, { expectExisting: true, expectDirectory: false });
        await fs.writeFile(realPath, content, 'utf8');
    }

    async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
        const rootDirectory = await this.resolveRootDirectory();
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

        const stats = await fs.stat(targetRealPath);
        const hasChildren = input.kind === 'directory' ? false : undefined;

        return {
            path: targetPath,
            name: input.name.trim(),
            kind: input.kind,
            parentPath,
            hasChildren,
            updatedAt: stats.mtimeMs
        };
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
                const entryVirtualPath = currentVirtualPath ? `${currentVirtualPath}/${entry.name}` : `/${entry.name}`;
                const entryRealPath = path.join(directoryPath, entry.name);
                if (entry.isDirectory()) {
                    await walk(entryRealPath, entryVirtualPath);
                    continue;
                }

                files.push({
                    path: entryVirtualPath,
                    readContent: async () => fs.readFile(entryRealPath, 'utf8')
                });
            }
        };

        await walk(startDirectory, normalizeSearchScopePath(scopePath ?? '/'));
        return searchInScopedFiles({
            query: request.query,
            scopePath: scopePath,
            maxResults: request.maxResults,
            files
        });
    }

    async resolveScopedAgentConfig(targetPath: string): Promise<ResolvedAgentConfig> {
        const scopePath = await this.determineStartScopePath(targetPath);
        const matches: ScopedAgentMatch[] = [];

        let cursor: string | null = scopePath;
        while (cursor) {
            const match = await this.readScopedAgentMatch(cursor);
            if (match) {
                matches.push(match);
                if (match.config.inheritance === 'override') {
                    break;
                }
            }

            cursor = getParentScopePath(cursor);
        }

        if (matches.length === 0) {
            return createResolvedAgentConfig('/', [], DEFAULT_SCOPED_AGENT_CONFIG);
        }

        const orderedMatches = [...matches].reverse();
        const merged = orderedMatches.reduce<AgentConfig>((current, match) => {
            if (!current) {
                return cloneAgentConfig(match.config);
            }

            return mergeAgentConfigs(current, match.config);
        }, null as unknown as AgentConfig);

        return createResolvedAgentConfig(
            scopePath,
            orderedMatches.map((match) => match.configPath),
            merged
        );
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

    private async determineStartScopePath(targetPath: string): Promise<string> {
        const normalizedTargetPath = normalizeScopePath(targetPath);
        if (normalizedTargetPath === '/') {
            return '/';
        }

        try {
            await this.readDocument(normalizedTargetPath);
            return getParentScopePath(normalizedTargetPath) ?? '/';
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/节点不是文件/i.test(message)) {
                return normalizedTargetPath;
            }

            if (/节点不存在/i.test(message)) {
                return getParentScopePath(normalizedTargetPath) ?? '/';
            }

            throw error;
        }
    }

    private async readScopedAgentMatch(scopePath: string): Promise<ScopedAgentMatch | null> {
        const configPath = getConfigPath(scopePath);

        try {
            const document = await this.readDocument(configPath);
            return {
                scopePath,
                configPath,
                config: parseAgentConfig(document.content, configPath)
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/节点不存在/i.test(message)) {
                return null;
            }

            throw error;
        }
    }

    private isInsideRoot(rootDirectory: string, candidatePath: string): boolean {
        const relative = path.relative(rootDirectory, candidatePath);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }
}
