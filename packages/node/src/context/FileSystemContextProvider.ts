import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as contextProviderModule from '../../../core/src/interfaces/IContextProvider.ts';
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
    WorkspaceContext,
    WriteContextDocumentInput,
    WriteContextDocumentResult
} from '../../../core/src/interfaces/IContextProvider.ts';
import { DocumentIdentityIndex } from './DocumentIdentityIndex.ts';

const DEFAULT_WORKSPACE_AGENT_KEY = '/' as const;
const DEFAULT_SCOPE_METADATA_BOOTSTRAP = contextProviderModule.DEFAULT_WORKSPACE_METADATA_BOOTSTRAP;
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
}

type MetadataBinding = {
    id: string;
    description?: string;
};

type ScopeInheritanceMode = 'merge' | 'override';
type ParsedScopeMetadata = Record<string, unknown> & { linkDir?: string };

interface EffectiveScopeBinding {
    scopeKey: string;
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

function isMarkdownPath(targetPath: string): boolean {
    const extension = targetPath.split('.').pop()?.toLowerCase() ?? '';
    return extension === 'md' || extension === 'markdown';
}

function serializeDefaultScopeMetadata(): string {
    return `${JSON.stringify(DEFAULT_SCOPE_METADATA_BOOTSTRAP, null, 2)}\n`;
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

    await fs.writeFile(rootAgentConfigPath, serializeDefaultScopeMetadata(), 'utf8');
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

function parseInheritance(value: unknown, configPath: string): ScopeInheritanceMode | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === 'merge' || value === 'override') {
        return value;
    }

    throw new Error(`Invalid inheritance in ${configPath}: expected "merge" or "override".`);
}

function parseBindings(
    value: unknown,
    configPath: string,
    fieldName: 'tools' | 'skills'
): MetadataBinding[] | undefined {
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
        };
    });
}

function parseScopeMetadata(content: string, configPath: string): ParsedScopeMetadata {
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
        tools: parseBindings(parsed.tools, configPath, 'tools'),
        skills: parseBindings(parsed.skills, configPath, 'skills'),
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

function createDefaultScopeBinding(): EffectiveScopeBinding {
    return {
        scopeKey: DEFAULT_WORKSPACE_AGENT_KEY
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

function buildHiddenContextNode(input: {
    targetPath: string;
    name: string;
    kind: 'file' | 'directory';
    parentPath?: string;
    updatedAt: number;
    agentKey: string;
}): ContextNode {
    return {
        path: input.targetPath,
        name: input.name,
        kind: input.kind,
        parentPath: input.parentPath,
        hasChildren: input.kind === 'directory' ? false : undefined,
        updatedAt: input.updatedAt,
        ownsMetadata: false,
        scopeKey: input.agentKey
    };
}

function getParentAgentKeyFromContext(context: WorkspaceContext, parentPath?: string): string {
    if (!parentPath || parentPath === '/') {
        return DEFAULT_WORKSPACE_AGENT_KEY;
    }

    return findContextNodeByPath(context.nodes, parentPath)?.scopeKey ?? DEFAULT_WORKSPACE_AGENT_KEY;
}

export class FileSystemContextProvider implements IContextProvider {
    readonly id = 'local-file-context';
    private readonly rootPath?: string;
    private readonly identityIndex = new DocumentIdentityIndex();

    constructor(options: FileSystemContextProviderOptions = {}) {
        this.rootPath = options.rootPath?.trim() || undefined;
    }

    async initializeAccess(): Promise<void> {
        const rootDirectory = await this.resolveRootDirectory();
        await this.identityIndex.initialize(rootDirectory, '/');
    }

    async getDocumentId(virtualPath: string): Promise<string> {
        const normalizedPath = normalizeVirtualPath(virtualPath, { allowRoot: false });
        if (!normalizedPath) {
            throw new Error('Document path must not be empty.');
        }
        if (!isMarkdownPath(normalizedPath)) {
            throw new Error('Only Markdown documents can have document IDs.');
        }
        const existing = this.identityIndex.resolveByPath(normalizedPath);
        if (existing) {
            return existing;
        }
        const realPath = await this.resolveRealPath(normalizedPath, { expectExisting: true, expectDirectory: false });
        return this.identityIndex.assignId(normalizedPath, realPath);
    }

    async resolveDocumentIds(ids: string[]): Promise<Map<string, ContextNode | null>> {
        const context = await this.getContext();
        const result = new Map<string, ContextNode | null>();
        for (const id of ids) {
            const virtualPath = this.identityIndex.resolve(id);
            if (!virtualPath) {
                result.set(id, null);
                continue;
            }
            result.set(id, findContextNodeByPath(context.nodes, virtualPath));
        }
        return result;
    }

    private assertSameAgent(context: WorkspaceContext, srcPath: string, dstParentPath: string | undefined): void {
        const srcNode = findContextNodeByPath(context.nodes, srcPath);
        const srcAgentKey = srcNode?.scopeKey ?? getParentAgentKeyFromContext(context, path.posix.dirname(srcPath));
        const dstAgentKey = getParentAgentKeyFromContext(context, dstParentPath);
        if (srcAgentKey !== dstAgentKey) {
            throw new Error(`Cross-agent moves are not supported. Source agent: "${srcAgentKey}", target agent: "${dstAgentKey}".`);
        }
    }

    async getContext(): Promise<WorkspaceContext> {
        const rootDirectory = await this.resolveRootDirectory();
        await ensureRootAgentConfigFile(rootDirectory);
        const mountBindings = await this.resolveMountedDirectoryBindings(rootDirectory);
        const folderMetadataMap = new Map<string, Record<string, unknown>>();
        const rootScope = await this.resolveDirectoryScopeBinding(rootDirectory, '/', createDefaultScopeBinding(), folderMetadataMap);

        const nodes = await this.buildDirectoryNodes({
            realPath: rootDirectory,
            virtualPath: undefined,
            inheritedScope: rootScope,
            folderMetadataMap,
            mountBindings
        });

        return {
            nodes,
            folderMetadata: Object.fromEntries(
                [...folderMetadataMap.entries()].map(([scopeKey, metadata]) => [
                    scopeKey,
                    { scopeKey, data: metadata } satisfies FolderMetadata
                ])
            )
        };
    }

    async getFolderMetadata(targetPath: string): Promise<FolderMetadata | null> {
        const context = await this.getContext();
        const node = findContextNodeByPath(context.nodes, targetPath);
        const scopeKey = node?.scopeKey ?? getParentAgentKeyFromContext(context, targetPath);
        return context.folderMetadata[scopeKey] ?? null;
    }

    async getProjectDocuments(curNode: string): Promise<ProjectDocumentEntry[]> {
        const normalizedCurNode = normalizeVirtualPath(curNode, { allowRoot: false }) ?? '/';
        const context = await this.getContext();
        const scopeNode = normalizedCurNode === '/'
            ? null
            : findContextNodeByPath(context.nodes, normalizedCurNode);
        if (normalizedCurNode !== '/' && !scopeNode) {
            throw new Error(`Node does not exist: ${curNode}`);
        }

        const scopePath = scopeNode?.kind === 'file'
            ? scopeNode.parentPath ?? '/'
            : normalizedCurNode;
        const documents: ProjectDocumentEntry[] = [];
        const prefix = scopePath === '/' ? '/' : `${scopePath}/`;
        const stack = [...context.nodes];

        while (stack.length > 0) {
            const node = stack.shift();
            if (!node) {
                continue;
            }

            if (node.kind === 'directory') {
                if (node.children?.length) {
                    stack.unshift(...node.children);
                }
                continue;
            }

            if (!isMarkdownPath(node.path)) {
                continue;
            }

            if (scopePath !== '/' && !(node.path === scopePath || node.path.startsWith(prefix))) {
                continue;
            }

            documents.push({
                path: node.path,
                name: node.name
            });
        }

        return documents.sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'));
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
            canWrite: isTextDocumentMimeType(mimeType),
            documentId: this.identityIndex.resolveByPath(normalizedPath)
        };
    }

    async writeDocument(input: WriteContextDocumentInput): Promise<WriteContextDocumentResult> {
        const normalizedPath = normalizeVirtualPath(input.path, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('Document path must not be empty.');
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
        const hiddenParentAgentKey = input.name.startsWith('.')
            ? getParentAgentKeyFromContext(await this.getContext(), parentPath)
            : null;

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
            if (isMarkdownPath(targetPath)) {
                await this.identityIndex.assignId(targetPath, targetRealPath);
            }
        }

        const stats = await fs.stat(targetRealPath);
        if (input.name.startsWith('.')) {
            return buildHiddenContextNode({
                targetPath,
                name: input.name,
                kind: input.kind,
                parentPath,
                updatedAt: stats.mtimeMs,
                agentKey: hiddenParentAgentKey ?? DEFAULT_WORKSPACE_AGENT_KEY
            });
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
        const hiddenParentAgentKey = input.name.startsWith('.')
            ? getParentAgentKeyFromContext(await this.getContext(), parentPath)
            : null;

        if (await exists(targetRealPath)) {
            throw new Error(`Node already exists: ${targetPath}`);
        }

        await fs.rename(sourceRealPath, targetRealPath);
        this.identityIndex.remap(normalizedPath, targetPath);
        const stats = await fs.stat(targetRealPath);
        if (input.name.startsWith('.')) {
            return buildHiddenContextNode({
                targetPath,
                name: input.name,
                kind: stats.isDirectory() ? 'directory' : 'file',
                parentPath,
                updatedAt: stats.mtimeMs,
                agentKey: hiddenParentAgentKey ?? DEFAULT_WORKSPACE_AGENT_KEY
            });
        }
        const context = await this.getContext();
        const renamedNode = findContextNodeByPath(context.nodes, targetPath);
        if (!renamedNode) {
            throw new Error(`Unable to find the node in context after rename: ${targetPath}`);
        }

        return renamedNode;
    }

    async moveNode(input: MoveContextNodeInput): Promise<ContextNode> {
        const normalizedPath = normalizeVirtualPath(input.path, { allowRoot: false });
        if (!normalizedPath || normalizedPath === '/') {
            throw new Error('Moving the root directory is not allowed.');
        }

        const targetParentPath = normalizeVirtualPath(input.targetParentPath);
        if (targetParentPath === normalizedPath || targetParentPath?.startsWith(`${normalizedPath}/`)) {
            throw new Error('Cannot move a node into itself or its descendant.');
        }

        const preContext = await this.getContext();
        this.assertSameAgent(preContext, normalizedPath, targetParentPath);

        const sourceRealPath = await this.resolveRealPath(normalizedPath, { expectExisting: true });
        const sourceStats = await fs.stat(sourceRealPath);
        if (targetParentPath) {
            await this.resolveRealPath(targetParentPath, { expectExisting: true, expectDirectory: true });
        }

        const targetPath = toVirtualPath(targetParentPath, path.posix.basename(normalizedPath));
        if (targetPath === normalizedPath) {
            const unchangedNode = findContextNodeByPath(preContext.nodes, normalizedPath);
            if (!unchangedNode) {
                throw new Error(`Unable to find the node in context after move: ${normalizedPath}`);
            }
            return unchangedNode;
        }

        const targetRealPath = await this.resolveRealPath(targetPath, { expectExisting: false });
        if (await exists(targetRealPath)) {
            throw new Error(`Node already exists: ${targetPath}`);
        }

        await fs.rename(sourceRealPath, targetRealPath);
        this.identityIndex.remap(normalizedPath, targetPath);
        const stats = await fs.stat(targetRealPath);
        const movedPath = sourceStats.isDirectory() ? targetPath : targetPath;
        const context = await this.getContext();
        const movedNode = findContextNodeByPath(context.nodes, movedPath);
        if (!movedNode) {
            throw new Error(`Unable to find the node in context after move: ${movedPath}`);
        }

        return {
            ...movedNode,
            updatedAt: stats.mtimeMs
        };
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
        inheritedScope: EffectiveScopeBinding;
        folderMetadataMap: Map<string, Record<string, unknown>>;
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
                const directoryScope = await this.resolveDirectoryScopeBinding(
                    mountedBinding.aliasRealPath,
                    virtualPath,
                    input.inheritedScope,
                    input.folderMetadataMap
                );
                const children = await this.buildDirectoryNodes({
                    realPath: mountedBinding.targetRealPath,
                    virtualPath,
                    inheritedScope: directoryScope,
                    folderMetadataMap: input.folderMetadataMap,
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
                    ownsMetadata: directoryScope.scopeKey === (virtualPath.endsWith('/') ? virtualPath : `${virtualPath}/`),
                    scopeKey: directoryScope.scopeKey
                } satisfies ContextNode;
            }

            const realPath = path.join(input.realPath, entry.name);
            const stats = await fs.stat(realPath);

            if (entry.isDirectory()) {
                const directoryScope = await this.resolveDirectoryScopeBinding(
                    realPath,
                    virtualPath,
                    input.inheritedScope,
                    input.folderMetadataMap
                );
                const children = await this.buildDirectoryNodes({
                    realPath,
                    virtualPath,
                    inheritedScope: directoryScope,
                    folderMetadataMap: input.folderMetadataMap,
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
                    ownsMetadata: directoryScope.scopeKey === (virtualPath.endsWith('/') ? virtualPath : `${virtualPath}/`),
                    scopeKey: directoryScope.scopeKey
                } satisfies ContextNode;
            }

            return {
                path: virtualPath,
                name: entry.name,
                kind: 'file',
                parentPath: input.virtualPath,
                hasChildren: false,
                updatedAt: stats.mtimeMs,
                scopeKey: input.inheritedScope.scopeKey
            } satisfies ContextNode;
        }));

        return sortContextNodes(nodes);
    }

    private async resolveDirectoryScopeBinding(
        realPath: string,
        scopePath: string,
        inheritedScope: EffectiveScopeBinding,
        folderMetadataMap: Map<string, Record<string, unknown>>
    ): Promise<EffectiveScopeBinding> {
        const configPath = getConfigPath(scopePath);
        const realConfigPath = path.join(realPath, '.agent.json');

        if (!(await exists(realConfigPath))) {
            return inheritedScope;
        }

        const content = await fs.readFile(realConfigPath, 'utf8');
        const metadata = parseScopeMetadata(content, configPath);
        const normalizedScopeKey = scopePath === '/' ? DEFAULT_WORKSPACE_AGENT_KEY : `${scopePath.replace(/\/$/, '')}/`;
        folderMetadataMap.set(normalizedScopeKey, metadata);

        return {
            scopeKey: normalizedScopeKey
        };
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
            const config = parseScopeMetadata(configContent, getConfigPath(aliasPath));
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
