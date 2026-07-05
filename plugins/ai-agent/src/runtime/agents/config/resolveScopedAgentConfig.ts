import type { IContextProvider } from '@plugins/ai-agent/src/internal';
import type {
    AgentConfig,
    AgentInheritanceMode,
    AgentSkillBinding,
    AgentToolBinding,
    ResolvedAgentConfig,
    WorkspaceContext
} from '@plugins/ai-agent/src/internal';
import { decodeTextDocument } from '@plugins/ai-agent/src/internal';

type AgentBinding = AgentToolBinding | AgentSkillBinding;

interface ScopedAgentMatch {
    scopePath: string;
    configPath: string;
    config: AgentConfig;
}

export const DEFAULT_SCOPED_AGENT_CONFIG: AgentConfig = Object.freeze({
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
        { id: 'list_directory', description: 'List files and directories within the knowledge workspace. Use "." for the current agent root and absolute paths for workspace locations.' },
        { id: 'read_file', description: 'Read a file within the current knowledge workspace.' },
        { id: 'search_in_scope', description: 'Search for relevant text within the current agent scope.' },
        { id: 'replace_text_in_file', description: 'Replace an exact text match in a file.' },
        { id: 'replace_range_in_file', description: 'Replace text within a specific line and column range.' },
        { id: 'insert_text_in_file', description: 'Insert text at a specific position in a file.' },
        { id: 'delete_range_in_file', description: 'Delete text within a specific line and column range.' },
        { id: 'write_file', description: 'Create or overwrite an entire file.' }
    ]
});

function normalizePath(path: string): string {
    const trimmed = path.trim();
    if (!trimmed || trimmed === '/') {
        return '/';
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function getParentScopePath(path: string): string | null {
    const normalized = normalizePath(path);
    if (normalized === '/') {
        return null;
    }

    const lastSlashIndex = normalized.lastIndexOf('/');
    return lastSlashIndex <= 0 ? '/' : normalized.slice(0, lastSlashIndex);
}

function getConfigPath(scopePath: string): string {
    return scopePath === '/' ? '/.agent.json' : `${scopePath}/.agent.json`;
}

function normalizeScopeKey(scopeKey: string): string {
    const normalized = normalizePath(scopeKey);
    return normalized === '/' ? '/' : `${normalized}/`;
}

function scopeKeyToScopePath(scopeKey: string): string {
    const normalized = normalizeScopeKey(scopeKey);
    return normalized === '/' ? '/' : normalized.slice(0, -1);
}

function buildScopeKeyHierarchy(scopeKey: string): string[] {
    const normalizedScopePath = scopeKeyToScopePath(scopeKey);
    const hierarchy: string[] = [];
    let cursor: string | null = normalizedScopePath;

    while (cursor) {
        hierarchy.push(normalizeScopeKey(cursor));
        cursor = getParentScopePath(cursor);
    }

    return hierarchy.reverse();
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

export function createResolvedAgentConfig(
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

export function resolveChildAgentConfig(
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

function parseAgentConfigValue(parsed: unknown, configPath: string): AgentConfig {
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

function parseAgentConfig(content: string, configPath: string): AgentConfig {
    let parsed: unknown;

    try {
        parsed = JSON.parse(content.replace(/^\uFEFF/, ''));
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse ${configPath}: ${reason}`);
    }

    return parseAgentConfigValue(parsed, configPath);
}

async function determineStartScopePath(provider: IContextProvider, targetPath: string): Promise<string> {
    const normalizedTargetPath = normalizePath(targetPath);
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

export function isResolvedAgentConfig(value: unknown): value is ResolvedAgentConfig {
    if (!isPlainObject(value)) {
        return false;
    }

    return Array.isArray(value.sourcePaths) && typeof value.effectiveInstructions === 'string';
}

export function resolveScopedAgentConfigFromWorkspaceContext(
    context: WorkspaceContext | null | undefined,
    targetScopeKey: string | null | undefined,
    fallback: AgentConfig = DEFAULT_SCOPED_AGENT_CONFIG
): ResolvedAgentConfig | null {
    if (!context || !targetScopeKey?.trim()) {
        return null;
    }

    const folderMetadata = context.folderMetadata ?? {};
    const normalizedTargetScopeKey = normalizeScopeKey(targetScopeKey);
    const orderedMatches = buildScopeKeyHierarchy(normalizedTargetScopeKey)
        .map((scopeKey) => {
            const metadata = folderMetadata[scopeKey];
            if (!metadata) {
                return null;
            }

            const scopePath = scopeKeyToScopePath(scopeKey);
            const configPath = getConfigPath(scopePath);
            return {
                scopePath,
                configPath,
                config: parseAgentConfigValue(metadata.data, configPath)
            } satisfies ScopedAgentMatch;
        })
        .filter((match): match is ScopedAgentMatch => match !== null);

    const fallbackResolved = createResolvedAgentConfig(scopeKeyToScopePath(normalizedTargetScopeKey), [], fallback);
    return orderedMatches.reduce<ResolvedAgentConfig>((current, match) => {
        return resolveChildAgentConfig(current, match.scopePath, match.configPath, match.config);
    }, fallbackResolved);
}

export function resolveAllScopedAgentConfigsFromWorkspaceContext(
    context: WorkspaceContext | null | undefined,
    fallback: AgentConfig = DEFAULT_SCOPED_AGENT_CONFIG
): Record<string, ResolvedAgentConfig> {
    if (!context) {
        return {};
    }

    const folderMetadata = context.folderMetadata ?? {};
    return Object.fromEntries(
        Object.keys(folderMetadata).map((scopeKey) => [
            scopeKey,
            resolveScopedAgentConfigFromWorkspaceContext(context, scopeKey, fallback)
        ]).filter((entry): entry is [string, ResolvedAgentConfig] => entry[1] !== null)
    );
}

export async function resolveScopedAgentConfig(
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
