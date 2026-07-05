/// <reference types="vite/client" />

import type {
    ContextDocument,
    ContextNode,
    ProjectDocumentEntry,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    FolderMetadata,
    MoveContextNodeInput,
    WorkspaceContext,
    WriteContextDocumentInput,
    WriteContextDocumentResult
} from '@packages/core/src';
import type { ControlledPageDomEvent, EvaluateInControlledPageRequest, OpenControlledPageRequest } from '../shared/controlledPageBridge';
import type {
    BrowserAutomationCookieRequest,
    BrowserAutomationFetchRequest,
    BrowserAutomationFetchResponse
} from '../shared/browserAutomationBridge';
import type { DesktopFetchResponse } from '../shared/fetchBridge';

declare module '*.vue' {
    import type { DefineComponent } from 'vue';

    const component: DefineComponent<Record<string, never>, Record<string, never>, any>;
    export default component;
}

declare global {
    interface Window {
        jarvisContext?: {
            initializeAccess(): Promise<void>;
            getContext(): Promise<WorkspaceContext>;
            getFolderMetadata(path: string): Promise<FolderMetadata | null>;
            getProjectDocuments(curNode: string): Promise<ProjectDocumentEntry[]>;
            readDocument(path: string): Promise<ContextDocument>;
            writeDocument(input: WriteContextDocumentInput): Promise<WriteContextDocumentResult>;
            createNode(input: CreateContextNodeInput): Promise<ContextNode>;
            deleteNode(path: string): Promise<void>;
            renameNode(input: { path: string; name: string }): Promise<ContextNode>;
            moveNode(input: MoveContextNodeInput): Promise<ContextNode>;
            searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]>;
            getDocumentId(path: string): Promise<string>;
            resolveDocumentIds(ids: string[]): Promise<Record<string, ContextNode | null>>;
        };
        jarvisFetchBridge?: (input: RequestInfo | URL, init?: RequestInit) => Promise<DesktopFetchResponse>;
        jarvisFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
        chatprismDesktop?: {
            runtimeEnv?: {
                contextBaseUrl?: string;
                syncBaseUrl?: string;
                syncKey?: string;
                codexBaseUrl?: string;
                providerConfigBaseUrl?: string;
                domChatGptUrl?: string;
                domGeminiUrl?: string;
                geminiApiKey?: string;
            };
            initializeContextAccess(): Promise<void>;
            getContext(): Promise<WorkspaceContext>;
            getFolderMetadata(path: string): Promise<FolderMetadata | null>;
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
            fetch(input: RequestInfo | URL, init?: RequestInit): Promise<DesktopFetchResponse>;
            onProviderLoginWindowOpened(listener: (providerId: string) => void): () => void;
            onProviderLoginCompleted(listener: (providerId: string) => void): () => void;
            onProviderLoginWindowClosed(listener: (providerId: string) => void): () => void;
            subscribeControlledPageEvent(listener: (event: ControlledPageDomEvent) => void): () => void;
        };
    }
}

export {};
