import { decodeTextDocument, encodeTextDocument, inferDocumentMimeType, isTextDocumentMimeType } from '../../utils/documentData';
import type { ContextDocument, ContextNode, IContextProvider } from '../../interfaces/IContextProvider';
import type { AgentToolDefinition, AgentToolExecutionContext } from './types';

type ToolArgs = Record<string, unknown>;
type FileChangeInput = { path: string; beforeContent: string; afterContent: string; alreadyPersisted?: boolean };
type RangeInput = {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
};

function requireContextProvider(context: AgentToolExecutionContext): IContextProvider {
    if (!context.contextProvider) {
        throw new Error('Workspace context provider is unavailable for the current agent tool call.');
    }

    return context.contextProvider;
}

function normalizeWorkspacePath(value: unknown, label: string, options: { allowRoot?: boolean } = {}): string {
    if (typeof value !== 'string') {
        throw new Error(`${label} must be a string.`);
    }

    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error(`${label} cannot be empty.`);
    }

    const normalized = (trimmed.startsWith('/') ? trimmed : `/${trimmed}`)
        .replace(/\/+/g, '/')
        .replace(/\/$/, '') || '/';

    const segments = normalized.split('/').filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..')) {
        throw new Error(`${label} must not contain '.' or '..' segments.`);
    }

    if (!options.allowRoot && normalized === '/') {
        throw new Error(`${label} cannot be the workspace root.`);
    }

    return normalized;
}

function normalizeOptionalTargetPath(context: AgentToolExecutionContext, value: unknown, label = 'path'): string {
    if (value === undefined || value === null || value === '') {
        if (!context.activePath) {
            throw new Error(`No active file is available. Provide '${label}' explicitly.`);
        }
        return normalizeWorkspacePath(context.activePath, 'activePath');
    }

    return normalizeWorkspacePath(value, label);
}

function resolveListDirectoryPath(context: AgentToolExecutionContext, value: unknown): string {
    if (value === undefined || value === null || value === '' || value === '.') {
        return context.agent.scopePath;
    }

    return normalizeWorkspacePath(value, 'path', { allowRoot: true });
}

function isPathWithinScope(path: string, scopePath: string): boolean {
    if (scopePath === '/') {
        return true;
    }

    return path === scopePath || path.startsWith(`${scopePath}/`);
}

function assertPathWithinScope(path: string, context: AgentToolExecutionContext): void {
    if (!isPathWithinScope(path, context.agent.scopePath)) {
        throw new Error(`Path '${path}' is outside the current agent scope '${context.agent.scopePath}'.`);
    }
}

function readTextDocument(document: ContextDocument, path: string): string {
    if (!isTextDocumentMimeType(document.mimeType)) {
        throw new Error(`File '${path}' is not a text document.`);
    }

    return decodeTextDocument(document.dataBase64);
}

async function readDocumentForEdit(
    context: AgentToolExecutionContext,
    pathInput: unknown
): Promise<{ path: string; beforeContent: string; provider: IContextProvider; mimeType: string }> {
    const provider = requireContextProvider(context);
    const path = normalizeOptionalTargetPath(context, pathInput);
    assertPathWithinScope(path, context);
    const document = await provider.readDocument(path);
    return {
        path,
        beforeContent: readTextDocument(document, path),
        provider,
        mimeType: document.mimeType
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

async function listDirectoryEntries(provider: IContextProvider, directoryPath: string): Promise<ContextNode[]> {
    const context = await provider.getContext();
    if (directoryPath === '/') {
        return context.nodes;
    }

    const node = findContextNodeByPath(context.nodes, directoryPath);
    if (!node || node.kind !== 'directory') {
        throw new Error(`Directory does not exist: ${directoryPath}`);
    }

    return node.children ?? [];
}

function asObject(value: unknown, label: string): ToolArgs {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} must be an object.`);
    }

    return value as ToolArgs;
}

function readString(args: ToolArgs, key: string, options: { allowEmpty?: boolean } = {}): string {
    const value = args[key];
    if (typeof value !== 'string') {
        throw new Error(`'${key}' must be a string.`);
    }

    if (!options.allowEmpty && value.length === 0) {
        throw new Error(`'${key}' cannot be empty.`);
    }

    return value;
}

function readBoolean(args: ToolArgs, key: string, defaultValue = false): boolean {
    const value = args[key];
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value !== 'boolean') {
        throw new Error(`'${key}' must be a boolean.`);
    }
    return value;
}

function readOptionalNumber(args: ToolArgs, key: string): number | undefined {
    const value = args[key];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`'${key}' must be a finite number.`);
    }
    return value;
}

function readPositiveInteger(args: ToolArgs, key: string, options: { min?: number } = {}): number {
    const value = args[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < (options.min ?? 0)) {
        throw new Error(`'${key}' must be an integer greater than or equal to ${options.min ?? 0}.`);
    }

    return value;
}

function splitLines(content: string): string[] {
    return content.split('\n');
}

function toOffset(content: string, line: number, column: number): number {
    if (line < 1 || column < 1) {
        throw new Error('Line and column positions are 1-based and must be positive integers.');
    }

    const lines = splitLines(content);
    if (line > lines.length) {
        throw new Error(`Line ${line} is outside the file.`);
    }

    const targetLine = lines[line - 1] ?? '';
    if (column > targetLine.length + 1) {
        throw new Error(`Column ${column} is outside line ${line}.`);
    }

    let offset = 0;
    for (let index = 0; index < line - 1; index += 1) {
        offset += lines[index]?.length ?? 0;
        offset += 1;
    }

    return offset + column - 1;
}

function resolveRange(content: string, input: RangeInput): { start: number; end: number } {
    const start = toOffset(content, input.startLine, input.startColumn);
    const end = toOffset(content, input.endLine, input.endColumn);
    if (end < start) {
        throw new Error('Range end must not be before range start.');
    }

    return { start, end };
}

async function persistEdit(
    provider: IContextProvider,
    change: FileChangeInput & { mimeType?: string },
    context: AgentToolExecutionContext
): Promise<void> {
    await provider.writeDocument({
        path: change.path,
        mimeType: change.mimeType ?? inferDocumentMimeType(change.path),
        dataBase64: encodeTextDocument(change.afterContent)
    });
    await context.onFileChanged?.({
        ...change,
        alreadyPersisted: true
    });
}

async function ensureDirectoryExists(provider: IContextProvider, path: string): Promise<void> {
    if (path === '/') {
        return;
    }

    const lastSlashIndex = path.lastIndexOf('/');
    const parentPath = lastSlashIndex <= 0 ? undefined : path.slice(0, lastSlashIndex);
    const name = path.slice(lastSlashIndex + 1);
    const siblings = await listDirectoryEntries(provider, parentPath ?? '/');
    const directoryNode = siblings.find((node) => node.path === path && node.kind === 'directory' && node.name === name);
    if (!directoryNode) {
        throw new Error(`Directory does not exist: ${path}`);
    }
}

function serializeDirectoryEntries(path: string, entries: ContextNode[]) {
    return {
        path,
        entries: entries.map((entry) => ({
            path: entry.path,
            name: entry.name,
            kind: entry.kind,
            parentPath: entry.parentPath,
            hasChildren: entry.hasChildren
        }))
    };
}

async function buildWriteFileResult(args: ToolArgs, context: AgentToolExecutionContext) {
    const provider = requireContextProvider(context);
    const path = normalizeWorkspacePath(args.path, 'path');
    assertPathWithinScope(path, context);

    const content = readString(args, 'content', { allowEmpty: true });
    const mimeType = inferDocumentMimeType(path);
    if (!isTextDocumentMimeType(mimeType)) {
        throw new Error(`File '${path}' is not a supported text document.`);
    }
    const mode = (() => {
        const raw = args.mode;
        if (raw === undefined) {
            return 'overwrite';
        }
        if (raw !== 'create' && raw !== 'overwrite') {
            throw new Error(`'mode' must be either 'create' or 'overwrite'.`);
        }
        return raw;
    })();

    if (mode === 'create') {
        try {
            await provider.readDocument(path);
            throw new Error(`Cannot create '${path}' because the file already exists.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('already exists')) {
                throw error;
            }
        }

        const lastSlashIndex = path.lastIndexOf('/');
        const parentPath = lastSlashIndex <= 0 ? undefined : path.slice(0, lastSlashIndex);
        if (parentPath) {
            await ensureDirectoryExists(provider, parentPath);
        }

        await provider.createNode({
            parentPath,
            name: path.slice(lastSlashIndex + 1),
            kind: 'file'
        });
        await persistEdit(provider, {
            path,
            beforeContent: '',
            afterContent: content,
            mimeType
        }, context);

        return {
            ok: true,
            path,
            mode,
            content
        };
    }

    const document = await provider.readDocument(path);
    const beforeContent = readTextDocument(document, path);
    await persistEdit(provider, {
        path,
        beforeContent,
        afterContent: content,
        mimeType: document.mimeType
    }, context);

    return {
        ok: true,
        path,
        mode,
        content
    };
}

export function createBuiltinWorkspaceToolDefinitions(): AgentToolDefinition[] {
    return [
        {
            id: 'read_current_file',
            description: 'Read the current active file from the knowledge workspace.',
            inputSchema: {
                type: 'OBJECT',
                properties: {}
            },
            async execute(_args, context) {
                const provider = requireContextProvider(context);
                if (!context.activePath) {
                    throw new Error('No active file is available in the current workspace.');
                }

                const path = normalizeWorkspacePath(context.activePath, 'activePath');
                assertPathWithinScope(path, context);
                const document = await provider.readDocument(path);
                return {
                    path: document.path,
                    mimeType: document.mimeType,
                    content: readTextDocument(document, path)
                };
            }
        },
        {
            id: 'list_directory',
            description: 'List files and directories under a workspace directory. Use "." for the current agent root and "/" for the workspace root when allowed.',
            inputSchema: {
                type: 'OBJECT',
                properties: {
                    path: { type: 'STRING', description: 'Use "." for the current agent root, or an absolute workspace path such as "/docs".' }
                }
            },
            async execute(rawArgs, context) {
                const args = asObject(rawArgs, 'list_directory arguments');
                const provider = requireContextProvider(context);
                const path = resolveListDirectoryPath(context, args.path);
                assertPathWithinScope(path, context);
                const entries = await listDirectoryEntries(provider, path);
                return serializeDirectoryEntries(path, entries);
            }
        },
        {
            id: 'read_file',
            description: 'Read a file by path from the current knowledge workspace scope.',
            inputSchema: {
                type: 'OBJECT',
                properties: {
                    path: { type: 'STRING', description: 'Absolute file path inside the workspace scope.' }
                },
                required: ['path']
            },
            async execute(rawArgs, context) {
                const args = asObject(rawArgs, 'read_file arguments');
                const provider = requireContextProvider(context);
                const path = normalizeWorkspacePath(args.path, 'path');
                assertPathWithinScope(path, context);
                const document = await provider.readDocument(path);
                return {
                    path: document.path,
                    mimeType: document.mimeType,
                    content: readTextDocument(document, path)
                };
            }
        },
        {
            id: 'search_in_scope',
            description: 'Search text matches inside the current agent scope.',
            inputSchema: {
                type: 'OBJECT',
                properties: {
                    query: { type: 'STRING', description: 'The text to search for.' },
                    maxResults: { type: 'INTEGER', description: 'Optional maximum number of matches to return.' }
                },
                required: ['query']
            },
            async execute(rawArgs, context) {
                const args = asObject(rawArgs, 'search_in_scope arguments');
                const provider = requireContextProvider(context);
                const query = readString(args, 'query');
                const maxResults = readOptionalNumber(args, 'maxResults');
                const matches = await provider.searchInScope({
                    query,
                    maxResults,
                    scopePath: context.agent.scopePath
                });
                return {
                    scopePath: context.agent.scopePath,
                    matches
                };
            }
        },
        {
            id: 'replace_text_in_file',
            description: 'Replace text in a workspace file by exact string matching.',
            inputSchema: {
                type: 'OBJECT',
                properties: {
                    path: { type: 'STRING', description: 'Optional absolute file path. Defaults to the active file.' },
                    target: { type: 'STRING', description: 'Exact text to replace.' },
                    replacement: { type: 'STRING', description: 'Replacement text.' },
                    allOccurrences: { type: 'BOOLEAN', description: 'Replace all exact matches when true.' }
                },
                required: ['target', 'replacement']
            },
            async execute(rawArgs, context) {
                const args = asObject(rawArgs, 'replace_text_in_file arguments');
                const { path, beforeContent, provider } = await readDocumentForEdit(context, args.path);
                const target = readString(args, 'target');
                const replacement = readString(args, 'replacement', { allowEmpty: true });
                const replaceAll = readBoolean(args, 'allOccurrences');

                if (!beforeContent.includes(target)) {
                    throw new Error(`Failed to find the target text in '${path}'.`);
                }

                const replacedCount = replaceAll
                    ? beforeContent.split(target).length - 1
                    : 1;
                const afterContent = replaceAll
                    ? beforeContent.split(target).join(replacement)
                    : beforeContent.replace(target, replacement);

                await persistEdit(provider, { path, beforeContent, afterContent }, context);
                return {
                    ok: true,
                    path,
                    replacedCount,
                    content: afterContent
                };
            }
        },
        {
            id: 'replace_range_in_file',
            description: 'Replace a line and column range in a workspace file.',
            inputSchema: {
                type: 'OBJECT',
                properties: {
                    path: { type: 'STRING', description: 'Optional absolute file path. Defaults to the active file.' },
                    startLine: { type: 'INTEGER' },
                    startColumn: { type: 'INTEGER' },
                    endLine: { type: 'INTEGER' },
                    endColumn: { type: 'INTEGER' },
                    replacement: { type: 'STRING', description: 'Replacement text.' }
                },
                required: ['startLine', 'startColumn', 'endLine', 'endColumn', 'replacement']
            },
            async execute(rawArgs, context) {
                const args = asObject(rawArgs, 'replace_range_in_file arguments');
                const { path, beforeContent, provider } = await readDocumentForEdit(context, args.path);
                const range = resolveRange(beforeContent, {
                    startLine: readPositiveInteger(args, 'startLine', { min: 1 }),
                    startColumn: readPositiveInteger(args, 'startColumn', { min: 1 }),
                    endLine: readPositiveInteger(args, 'endLine', { min: 1 }),
                    endColumn: readPositiveInteger(args, 'endColumn', { min: 1 })
                });
                const replacement = readString(args, 'replacement', { allowEmpty: true });
                const afterContent = `${beforeContent.slice(0, range.start)}${replacement}${beforeContent.slice(range.end)}`;
                await persistEdit(provider, { path, beforeContent, afterContent }, context);
                return {
                    ok: true,
                    path,
                    content: afterContent
                };
            }
        },
        {
            id: 'insert_text_in_file',
            description: 'Insert text at a specific line and column position in a workspace file.',
            inputSchema: {
                type: 'OBJECT',
                properties: {
                    path: { type: 'STRING', description: 'Optional absolute file path. Defaults to the active file.' },
                    line: { type: 'INTEGER' },
                    column: { type: 'INTEGER' },
                    text: { type: 'STRING', description: 'Text to insert.' }
                },
                required: ['line', 'column', 'text']
            },
            async execute(rawArgs, context) {
                const args = asObject(rawArgs, 'insert_text_in_file arguments');
                const { path, beforeContent, provider } = await readDocumentForEdit(context, args.path);
                const offset = toOffset(
                    beforeContent,
                    readPositiveInteger(args, 'line', { min: 1 }),
                    readPositiveInteger(args, 'column', { min: 1 })
                );
                const text = readString(args, 'text', { allowEmpty: true });
                const afterContent = `${beforeContent.slice(0, offset)}${text}${beforeContent.slice(offset)}`;
                await persistEdit(provider, { path, beforeContent, afterContent }, context);
                return {
                    ok: true,
                    path,
                    content: afterContent
                };
            }
        },
        {
            id: 'delete_range_in_file',
            description: 'Delete a line and column range from a workspace file.',
            inputSchema: {
                type: 'OBJECT',
                properties: {
                    path: { type: 'STRING', description: 'Optional absolute file path. Defaults to the active file.' },
                    startLine: { type: 'INTEGER' },
                    startColumn: { type: 'INTEGER' },
                    endLine: { type: 'INTEGER' },
                    endColumn: { type: 'INTEGER' }
                },
                required: ['startLine', 'startColumn', 'endLine', 'endColumn']
            },
            async execute(rawArgs, context) {
                const args = asObject(rawArgs, 'delete_range_in_file arguments');
                const { path, beforeContent, provider } = await readDocumentForEdit(context, args.path);
                const range = resolveRange(beforeContent, {
                    startLine: readPositiveInteger(args, 'startLine', { min: 1 }),
                    startColumn: readPositiveInteger(args, 'startColumn', { min: 1 }),
                    endLine: readPositiveInteger(args, 'endLine', { min: 1 }),
                    endColumn: readPositiveInteger(args, 'endColumn', { min: 1 })
                });
                const afterContent = `${beforeContent.slice(0, range.start)}${beforeContent.slice(range.end)}`;
                await persistEdit(provider, { path, beforeContent, afterContent }, context);
                return {
                    ok: true,
                    path,
                    content: afterContent
                };
            }
        },
        {
            id: 'write_file',
            description: 'Create or overwrite a whole file in the workspace scope.',
            inputSchema: {
                type: 'OBJECT',
                properties: {
                    path: { type: 'STRING', description: 'Absolute file path inside the workspace scope.' },
                    content: { type: 'STRING', description: 'Complete file content to write.' },
                    mode: { type: 'STRING', enum: ['create', 'overwrite'] }
                },
                required: ['path', 'content']
            },
            execute(rawArgs, context) {
                return buildWriteFileResult(asObject(rawArgs, 'write_file arguments'), context);
            }
        }
    ];
}
