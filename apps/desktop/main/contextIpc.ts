import { ipcMain } from 'electron';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import path from 'node:path';
import {
    DESKTOP_CONTEXT_CREATE_NODE_CHANNEL,
    DESKTOP_CONTEXT_INITIALIZE_CHANNEL,
    DESKTOP_CONTEXT_LIST_TREE_CHANNEL,
    DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL,
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

    ipc.handle(DESKTOP_CONTEXT_INITIALIZE_CHANNEL, async () => {
        await getWorkspaceRoot();
    });
    ipc.handle(DESKTOP_CONTEXT_LIST_TREE_CHANNEL, async (_event, parentPath?: string) => {
        return listTree(await getWorkspaceRoot(), parentPath);
    });
    ipc.handle(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL, async (_event, targetPath: string) => {
        const actualPath = toActualPath(await getWorkspaceRoot(), targetPath);
        const content = await readFile(actualPath, 'utf8');
        const entryStat = await stat(actualPath);
        return {
            path: normalizeVirtualPath(targetPath),
            content,
            updatedAt: entryStat.mtimeMs
        };
    });
    ipc.handle(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL, async (_event, targetPath: string, content: string) => {
        const actualPath = toActualPath(await getWorkspaceRoot(), targetPath);
        await mkdir(dirname(actualPath), { recursive: true });
        await writeFile(actualPath, content, 'utf8');
    });
    ipc.handle(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL, async (_event, input: { parentPath?: string; name: string; kind: ContextNodeKind }) => {
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
    });

    return () => {
        ipc.removeHandler(DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_LIST_TREE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL);
    };
}
