import { ipcMain } from 'electron';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import path from 'node:path';
import {
    DEFAULT_SCOPED_AGENT_CONFIG,
    decodeTextDocument,
    decodeBase64,
    encodeBase64,
    encodeTextDocument,
    inferDocumentMimeType,
    isTextDocumentMimeType,
    normalizeScopePath,
    resolveScopedAgentConfig,
    type ContextSearchRequest,
    type IContextProvider,
    type ResolvedAgentConfig,
    searchInScopedFiles
} from '@packages/core/src';
import {
    DESKTOP_CONTEXT_CREATE_NODE_CHANNEL,
    DESKTOP_CONTEXT_DELETE_NODE_CHANNEL,
    DESKTOP_CONTEXT_INITIALIZE_CHANNEL,
    DESKTOP_CONTEXT_LIST_TREE_CHANNEL,
    DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL,
    DESKTOP_CONTEXT_RENAME_NODE_CHANNEL,
    DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL,
    DESKTOP_CONTEXT_RESOLVE_AGENT_CHANNEL,
    DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL
} from '../shared/contextBridge';

type ContextNodeKind = 'file' | 'directory';

interface IpcHandlerRegistry {
    handle(channel: string, listener: (...args: any[]) => unknown): void;
    removeHandler(channel: string): void;
}

interface RegisterContextIpcOptions {
    ipc?: IpcHandlerRegistry;
    workspaceRoot?: string;
}

export async function resolveDesktopWorkspaceRoot(configuredRoot = process.env.CHATPRISM_KNOWLEDGE_ROOT): Promise<string> {
    const trimmedRoot = configuredRoot?.trim();
    if (!trimmedRoot) {
        throw new Error('Desktop knowledge workspace root is not configured. Set CHATPRISM_KNOWLEDGE_ROOT.');
    }

    const resolvedRoot = path.resolve(trimmedRoot);
    let workspaceStat;
    try {
        workspaceStat = await stat(resolvedRoot);
    } catch {
        throw new Error(`Desktop knowledge workspace root does not exist: ${resolvedRoot}`);
    }

    if (!workspaceStat.isDirectory()) {
        throw new Error(`Desktop knowledge workspace root must be a directory: ${resolvedRoot}`);
    }

    return resolvedRoot;
}

function normalizeVirtualPath(input?: string): string | undefined {
    if (!input) {
        return undefined;
    }

    if (input.includes('\\')) {
        throw new Error('Knowledge workspace paths must use forward slashes.');
    }

    const normalizedInput = input.startsWith('/') ? input : `/${input}`;
    const segments = normalizedInput.split('/').filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..')) {
        throw new Error(`Knowledge workspace path escapes the configured root: ${input}`);
    }

    const normalized = path.posix.normalize(normalizedInput);
    if (normalized === '/' || normalized === '.') {
        return undefined;
    }
    return normalized.replace(/\/$/, '');
}

function assertValidNodeName(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
        throw new Error('Knowledge workspace node name is required.');
    }

    if (trimmedName.includes('/') || trimmedName.includes('\\') || trimmedName === '.' || trimmedName === '..') {
        throw new Error(`Knowledge workspace node name is invalid: ${name}`);
    }
}

function toActualPath(workspaceRoot: string, virtualPath?: string) {
    const normalized = normalizeVirtualPath(virtualPath);
    if (!normalized) {
        return workspaceRoot;
    }
    const parts = normalized.split('/').filter(Boolean);
    return join(workspaceRoot, ...parts);
}

async function listTree(workspaceRoot: string, parentPath?: string) {
    const actualPath = toActualPath(workspaceRoot, parentPath);
    const entries = await readdir(actualPath, { withFileTypes: true });

    const nodes = await Promise.all(entries.map(async (entry) => {
        const nodePath = normalizeVirtualPath(parentPath)
            ? `${normalizeVirtualPath(parentPath)}/${entry.name}`
            : `/${entry.name}`;
        const entryStat = await stat(join(actualPath, entry.name));
        const kind: ContextNodeKind = entry.isDirectory() ? 'directory' : 'file';
        return {
            path: nodePath,
            name: entry.name,
            kind,
            parentPath: normalizeVirtualPath(parentPath),
            updatedAt: entryStat.mtimeMs
        };
    }));

    return nodes
        .sort((left, right) => {
            if (left.kind !== right.kind) {
                return left.kind === 'directory' ? -1 : 1;
            }
            return left.name.localeCompare(right.name, 'zh-Hans-CN');
        })
        .map((node) => ({
            ...node,
            hasChildren: node.kind === 'directory'
        }));
}

export function registerContextIpc(options: RegisterContextIpcOptions = {}) {
    const ipc = options.ipc ?? ipcMain;
    const getWorkspaceRoot = (() => {
        let cachedRootPromise: Promise<string> | null = null;
        return () => {
            cachedRootPromise ??= resolveDesktopWorkspaceRoot(options.workspaceRoot);
            return cachedRootPromise;
        };
    })();

    const provider: IContextProvider = {
        id: 'desktop-context',
        async initializeAccess() {
            await getWorkspaceRoot();
        },
        async listTree(parentPath?: string) {
            return listTree(await getWorkspaceRoot(), parentPath);
        },
        async readDocument(targetPath: string) {
            const actualPath = toActualPath(await getWorkspaceRoot(), targetPath);
            const mimeType = inferDocumentMimeType(targetPath);
            const content = await readFile(actualPath);
            const entryStat = await stat(actualPath);
            return {
                path: normalizeVirtualPath(targetPath) ?? '/',
                mimeType,
                dataBase64: isTextDocumentMimeType(mimeType)
                    ? encodeTextDocument(content.toString('utf8'))
                    : encodeBase64(content),
                updatedAt: entryStat.mtimeMs,
                version: `${entryStat.mtimeMs}`,
                canWrite: isTextDocumentMimeType(mimeType)
            };
        },
        async writeDocument(input: { path: string; mimeType: string; dataBase64: string; expectedVersion?: string }) {
            if (!isTextDocumentMimeType(input.mimeType)) {
                throw new Error(`Unsupported document write mime type: ${input.mimeType}`);
            }

            const actualPath = toActualPath(await getWorkspaceRoot(), input.path);
            await mkdir(dirname(actualPath), { recursive: true });
            if (input.expectedVersion) {
                const entryStat = await stat(actualPath);
                if (`${entryStat.mtimeMs}` !== input.expectedVersion) {
                    throw new Error('Document has changed on disk.');
                }
            }
            await writeFile(actualPath, Buffer.from(decodeBase64(input.dataBase64)));
        },
        async createNode(input: { parentPath?: string; name: string; kind: ContextNodeKind }) {
            assertValidNodeName(input.name);
            const parentPath = normalizeVirtualPath(input.parentPath);
            const targetVirtualPath = parentPath ? `${parentPath}/${input.name}` : `/${input.name}`;
            const actualPath = toActualPath(await getWorkspaceRoot(), targetVirtualPath);

            if (input.kind === 'directory') {
                await mkdir(actualPath, { recursive: true });
            } else {
                await mkdir(dirname(actualPath), { recursive: true });
                await writeFile(actualPath, '', 'utf8');
            }

            const entryStat = await stat(actualPath);
            return {
                path: targetVirtualPath,
                name: input.name,
                kind: input.kind,
                parentPath,
                updatedAt: entryStat.mtimeMs,
                hasChildren: input.kind === 'directory'
            };
        },
        async deleteNode(targetPath: string) {
            const normalizedPath = normalizeVirtualPath(targetPath);
            if (!normalizedPath) {
                throw new Error('Deleting the workspace root is not allowed.');
            }

            const actualPath = toActualPath(await getWorkspaceRoot(), normalizedPath);
            await rm(actualPath, { recursive: true, force: false });
        },
        async renameNode(input: { path: string; name: string }) {
            const normalizedPath = normalizeVirtualPath(input.path);
            if (!normalizedPath) {
                throw new Error('Renaming the workspace root is not allowed.');
            }

            assertValidNodeName(input.name);
            const parentPath = path.posix.dirname(normalizedPath) === '/' ? undefined : path.posix.dirname(normalizedPath);
            const targetVirtualPath = parentPath ? `${parentPath}/${input.name}` : `/${input.name}`;
            const sourceActualPath = toActualPath(await getWorkspaceRoot(), normalizedPath);
            const targetActualPath = toActualPath(await getWorkspaceRoot(), targetVirtualPath);
            await mkdir(dirname(targetActualPath), { recursive: true });
            await import('node:fs/promises').then(({ rename }) => rename(sourceActualPath, targetActualPath));
            const entryStat = await stat(targetActualPath);
            return {
                path: targetVirtualPath,
                name: input.name,
                kind: entryStat.isDirectory() ? 'directory' : 'file',
                parentPath,
                updatedAt: entryStat.mtimeMs,
                hasChildren: entryStat.isDirectory()
            };
        },
        async searchInScope(request: ContextSearchRequest) {
            const workspaceRoot = await getWorkspaceRoot();
            const scopePath = normalizeVirtualPath(request.scopePath);
            const walk = async (
                directoryPath: string,
                currentVirtualPath?: string
            ): Promise<Array<{ path: string; readContent: () => Promise<string> }>> => {
                const files: Array<{ path: string; readContent: () => Promise<string> }> = [];
                const entries = await readdir(directoryPath, { withFileTypes: true });
                for (const entry of entries) {
                    const entryVirtualPath = currentVirtualPath ? `${currentVirtualPath}/${entry.name}` : `/${entry.name}`;
                    const entryRealPath = join(directoryPath, entry.name);
                    if (entry.isDirectory()) {
                        files.push(...await walk(entryRealPath, entryVirtualPath));
                        continue;
                    }

                    files.push({
                        path: entryVirtualPath,
                        readContent: async () => {
                            const mimeType = inferDocumentMimeType(entryVirtualPath);
                            if (!isTextDocumentMimeType(mimeType)) {
                                return '';
                            }

                            return readFile(entryRealPath, 'utf8');
                        }
                    });
                }
                return files;
            };

            const files = await walk(
                toActualPath(workspaceRoot, scopePath),
                normalizeScopePath(scopePath ?? '/')
            );
            return searchInScopedFiles({
                query: request.query,
                scopePath,
                maxResults: request.maxResults,
                files
            });
        },
        async resolveScopedAgentConfig(targetPath: string): Promise<ResolvedAgentConfig> {
            return resolveScopedAgentConfig(provider, targetPath, DEFAULT_SCOPED_AGENT_CONFIG);
        }
    };

    ipc.handle(DESKTOP_CONTEXT_INITIALIZE_CHANNEL, async () => {
        await provider.initializeAccess();
    });
    ipc.handle(DESKTOP_CONTEXT_LIST_TREE_CHANNEL, async (_event, parentPath?: string) => {
        return provider.listTree(parentPath);
    });
    ipc.handle(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL, async (_event, targetPath: string) => {
        return provider.readDocument(targetPath);
    });
    ipc.handle(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL, async (_event, input: { path: string; mimeType: string; dataBase64: string; expectedVersion?: string }) => {
        await provider.writeDocument(input);
    });
    ipc.handle(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL, async (_event, input: { parentPath?: string; name: string; kind: ContextNodeKind }) => {
        return provider.createNode(input);
    });
    ipc.handle(DESKTOP_CONTEXT_DELETE_NODE_CHANNEL, async (_event, targetPath: string) => {
        await provider.deleteNode(targetPath);
    });
    ipc.handle(DESKTOP_CONTEXT_RENAME_NODE_CHANNEL, async (_event, input: { path: string; name: string }) => {
        return provider.renameNode(input);
    });
    ipc.handle(DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL, async (_event, request: ContextSearchRequest) => {
        return provider.searchInScope(request);
    });
    ipc.handle(DESKTOP_CONTEXT_RESOLVE_AGENT_CHANNEL, async (_event, targetPath: string) => {
        return provider.resolveScopedAgentConfig(targetPath);
    });

    return () => {
        ipc.removeHandler(DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_LIST_TREE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_RESOLVE_AGENT_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_DELETE_NODE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_RENAME_NODE_CHANNEL);
    };
}
