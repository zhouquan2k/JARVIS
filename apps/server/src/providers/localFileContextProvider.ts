import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
    ContextDocument,
    ContextNode,
    ContextProvider,
    CreateContextNodeInput
} from '../types/context.js';

export interface LocalFileContextProviderOptions {
    rootPath?: string;
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
}
