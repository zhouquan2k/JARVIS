import { DEFAULT_SYNC_BASE_URL, resolveSyncBaseUrl } from '../../config';
import type { ResolvedAgentConfig } from '../interfaces/IAgentConfig';
import type {
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    IContextProvider
} from '../interfaces/IContextProvider';

export const DEFAULT_CONTEXT_BASE_URL = 'http://127.0.0.1:8787/api/context';

export interface HttpContextProviderOptions {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
}

export interface ResolveContextBaseUrlOptions {
    env?: Record<string, string | undefined>;
}

function normalizeBaseUrl(value?: string): string {
    const normalized = value?.trim();
    return (normalized ? normalized : DEFAULT_CONTEXT_BASE_URL).replace(/\/+$/, '');
}

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

export function resolveContextBaseUrl(
    options: ResolveContextBaseUrlOptions | Record<string, string | undefined> = {}
): string {
    const env = 'env' in options ? options.env : options;
    const explicit = env?.CHATPRISM_CONTEXT_BASE_URL?.trim()
        || env?.VITE_CONTEXT_BASE_URL?.trim()
        || env?.WXT_CONTEXT_BASE_URL?.trim();
    if (explicit) {
        return explicit.replace(/\/+$/, '');
    }

    const syncBaseUrl = resolveSyncBaseUrl({ env });
    if (syncBaseUrl !== DEFAULT_SYNC_BASE_URL && syncBaseUrl.endsWith('/api/sync')) {
        return `${syncBaseUrl.slice(0, -'/api/sync'.length)}/api/context`;
    }

    return DEFAULT_CONTEXT_BASE_URL;
}

export class HttpContextProvider implements IContextProvider {
    readonly id = 'http-context';
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;

    constructor(options: HttpContextProviderOptions = {}) {
        if (!options.fetchImpl && typeof fetch === 'undefined') {
            throw new Error('当前环境不支持 fetch。');
        }

        this.baseUrl = normalizeBaseUrl(options.baseUrl);
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    }

    async initializeAccess(): Promise<void> {
        await this.post('/initialize-access', {});
    }

    async listTree(parentPath?: string): Promise<ContextNode[]> {
        const response = await this.post('/list-tree', parentPath ? { parentPath } : {});
        return (response as { nodes: ContextNode[] }).nodes;
    }

    async readDocument(path: string): Promise<ContextDocument> {
        const response = await this.post('/read-document', { path });
        return (response as { document: ContextDocument }).document;
    }

    async writeDocument(path: string, content: string): Promise<void> {
        await this.post('/write-document', { path, content });
    }

    async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
        const response = await this.post('/create-node', input);
        return (response as { node: ContextNode }).node;
    }

    async searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
        const response = await this.post('/search-in-scope', request);
        return (response as { matches: ContextSearchMatch[] }).matches;
    }

    async resolveScopedAgentConfig(targetPath: string): Promise<ResolvedAgentConfig> {
        const response = await this.post('/resolve-scoped-agent-config', { path: targetPath });
        return (response as { agent: ResolvedAgentConfig }).agent;
    }

    private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const payload = await readJson(response);
        if (!response.ok) {
            const message = payload && typeof payload === 'object' && 'error' in payload
                ? String((payload as { error: unknown }).error)
                : `HTTP ${response.status}`;
            throw new Error(message);
        }

        return payload;
    }
}
