import type {
  ContextDocument,
  ContextNode,
  CreateContextNodeInput,
  IContextProvider
} from '@packages/core/src';

export const DEFAULT_CONTEXT_BASE_URL = 'http://127.0.0.1:8787/api/context';

export interface HttpContextProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
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

export class HttpContextProvider implements IContextProvider {
  readonly id = 'web-http-context';
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
