import {
  HttpApiClient,
  type ContextDocument,
  type ContextNode,
  type ContextSearchMatch,
  type ContextSearchRequest,
  type CreateContextNodeInput,
  type FolderMetadata,
  type IContextProvider,
  type MoveContextNodeInput,
  type ProjectDocumentEntry,
  type RenameContextNodeInput,
  type WorkspaceContext,
  type WriteContextDocumentInput,
  type WriteContextDocumentResult
} from '@packages/core';
import { HttpContextProvider, type HttpContextProviderOptions } from '@packages/ui';

const WORKSPACE_CONTEXT_CACHE_KEY = 'jarvis:web2:workspace-context';

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function getStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return null;
  }

  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readCachedWorkspaceContext(): WorkspaceContext | null {
  const raw = getStorage()?.getItem(WORKSPACE_CONTEXT_CACHE_KEY)?.trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as WorkspaceContext;
  } catch {
    return null;
  }
}

function writeCachedWorkspaceContext(context: WorkspaceContext): void {
  getStorage()?.setItem(WORKSPACE_CONTEXT_CACHE_KEY, JSON.stringify(context));
}

export class Web2ContextProvider implements IContextProvider {
  readonly id = 'web2-context';

  private readonly readClient: HttpApiClient;
  private readonly delegate: HttpContextProvider;

  constructor(options: HttpContextProviderOptions = {}) {
    this.delegate = new HttpContextProvider(options);
    this.readClient = new HttpApiClient({
      baseUrl: options.baseUrl,
      fetchImpl: options.fetchImpl,
      source: 'context'
    });
  }

  async initializeAccess(): Promise<void> {
    if (isOffline() && readCachedWorkspaceContext()) {
      return;
    }

    await this.delegate.initializeAccess();
  }

  async getContext(): Promise<WorkspaceContext> {
    try {
      const context = await this.delegate.getContext();
      writeCachedWorkspaceContext(context);
      return context;
    } catch (error) {
      const cachedContext = readCachedWorkspaceContext();
      if (cachedContext) {
        return cachedContext;
      }

      throw error;
    }
  }

  async getFolderMetadata(path: string): Promise<FolderMetadata | null> {
    if (isOffline()) {
      return readCachedWorkspaceContext()?.folderMetadata[path] ?? null;
    }

    return this.delegate.getFolderMetadata(path);
  }

  async getProjectDocuments(curNode: string): Promise<ProjectDocumentEntry[]> {
    return this.delegate.getProjectDocuments(curNode);
  }

  async readDocument(path: string): Promise<ContextDocument> {
    const response = await this.readClient.getJson<{ document: ContextDocument }>(
      `/read-document?path=${encodeURIComponent(path)}`
    );

    return isOffline()
      ? {
          ...response.document,
          canWrite: false
        }
      : response.document;
  }

  async writeDocument(input: WriteContextDocumentInput): Promise<WriteContextDocumentResult> {
    if (isOffline()) {
      throw new Error('This document is read-only offline. Reconnect before editing.');
    }

    return this.delegate.writeDocument(input);
  }

  async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
    return this.delegate.createNode(input);
  }

  async deleteNode(path: string): Promise<void> {
    await this.delegate.deleteNode(path);
  }

  async renameNode(input: RenameContextNodeInput): Promise<ContextNode> {
    return this.delegate.renameNode(input);
  }

  async moveNode(input: MoveContextNodeInput): Promise<ContextNode> {
    return this.delegate.moveNode(input);
  }

  async searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
    return this.delegate.searchInScope(request);
  }

  async resolveDocumentIds(ids: string[]): Promise<Map<string, ContextNode | null>> {
    return this.delegate.resolveDocumentIds(ids);
  }

  async getDocumentId(path: string): Promise<string> {
    return this.delegate.getDocumentId(path);
  }
}
