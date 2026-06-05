/// <reference types="vite/client" />

import type { ContextDocument, ContextNode, ProjectDocumentEntry, ContextSearchMatch, ContextSearchRequest, CreateContextNodeInput, MoveContextNodeInput, WorkspaceContext, WriteContextDocumentInput, WriteContextDocumentResult } from '@packages/core/src';
import type { EvaluateInControlledPageRequest, OpenControlledPageRequest } from '../shared/controlledPageBridge';
import type {
    BrowserAutomationCookieRequest,
    BrowserAutomationFetchRequest,
    BrowserAutomationFetchResponse
} from '../shared/browserAutomationBridge';

declare module '*.vue' {
    import type { DefineComponent } from 'vue';

    const component: DefineComponent<Record<string, never>, Record<string, never>, any>;
    export default component;
}

declare global {
    interface Window {
        chatprismDesktop?: {
            runtimeEnv?: {
                contextBaseUrl?: string;
            };
            initializeContextAccess(): Promise<void>;
            getContext(): Promise<WorkspaceContext>;
            getProjectDocuments(curNode: string): Promise<ProjectDocumentEntry[]>;
            readContextDocument(path: string): Promise<ContextDocument>;
            writeContextDocument(input: WriteContextDocumentInput): Promise<WriteContextDocumentResult>;
            createContextNode(input: CreateContextNodeInput): Promise<ContextNode>;
            deleteContextNode(path: string): Promise<void>;
            renameContextNode(input: { path: string; name: string }): Promise<ContextNode>;
            moveContextNode(input: MoveContextNodeInput): Promise<ContextNode>;
            searchContextInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]>;
            getDocumentId(path: string): Promise<string>;
            resolveDocumentIds(ids: string[]): Promise<Record<string, ContextNode | null>>;
            openProviderLoginWindow(providerId: string): Promise<void>;
            openControlledPage(request: OpenControlledPageRequest): Promise<void>;
            evaluateInControlledPage<T>(request: EvaluateInControlledPageRequest): Promise<T>;
            browserAutomationFetch(request: BrowserAutomationFetchRequest): Promise<BrowserAutomationFetchResponse>;
            browserAutomationGetCookie(request: BrowserAutomationCookieRequest): Promise<{ value?: string } | null>;
            onProviderLoginWindowOpened(listener: (providerId: string) => void): () => void;
            onProviderLoginCompleted(listener: (providerId: string) => void): () => void;
            onProviderLoginWindowClosed(listener: (providerId: string) => void): () => void;
        };
    }
}

export {};
