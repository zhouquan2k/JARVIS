export const DESKTOP_CONTEXT_CHANNELS = {
    initializeAccess: 'chatprism:context:initialize',
    getContext: 'chatprism:context:get-context',
    getFolderMetadata: 'chatprism:context:get-folder-metadata',
    getProjectDocuments: 'chatprism:context:get-project-documents',
    readDocument: 'chatprism:context:read-document',
    writeDocument: 'chatprism:context:write-document',
    createNode: 'chatprism:context:create-node',
    deleteNode: 'chatprism:context:delete-node',
    renameNode: 'chatprism:context:rename-node',
    moveNode: 'chatprism:context:move-node',
    searchInScope: 'chatprism:context:search-in-scope',
    getDocumentId: 'chatprism:context:get-document-id',
    resolveDocumentIds: 'chatprism:context:resolve-document-ids'
} as const;

export type DesktopContextBridgeMethod = keyof typeof DESKTOP_CONTEXT_CHANNELS;

export const DESKTOP_CONTEXT_BRIDGE_METHODS = Object.keys(
    DESKTOP_CONTEXT_CHANNELS
) as DesktopContextBridgeMethod[];

export const DESKTOP_CONTEXT_INITIALIZE_CHANNEL = DESKTOP_CONTEXT_CHANNELS.initializeAccess;
export const DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL = DESKTOP_CONTEXT_CHANNELS.getContext;
export const DESKTOP_CONTEXT_GET_FOLDER_METADATA_CHANNEL = DESKTOP_CONTEXT_CHANNELS.getFolderMetadata;
export const DESKTOP_CONTEXT_GET_PROJECT_DOCUMENTS_CHANNEL = DESKTOP_CONTEXT_CHANNELS.getProjectDocuments;
export const DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL = DESKTOP_CONTEXT_CHANNELS.readDocument;
export const DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL = DESKTOP_CONTEXT_CHANNELS.writeDocument;
export const DESKTOP_CONTEXT_CREATE_NODE_CHANNEL = DESKTOP_CONTEXT_CHANNELS.createNode;
export const DESKTOP_CONTEXT_DELETE_NODE_CHANNEL = DESKTOP_CONTEXT_CHANNELS.deleteNode;
export const DESKTOP_CONTEXT_RENAME_NODE_CHANNEL = DESKTOP_CONTEXT_CHANNELS.renameNode;
export const DESKTOP_CONTEXT_MOVE_NODE_CHANNEL = DESKTOP_CONTEXT_CHANNELS.moveNode;
export const DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL = DESKTOP_CONTEXT_CHANNELS.searchInScope;
export const DESKTOP_CONTEXT_GET_DOCUMENT_ID_CHANNEL = DESKTOP_CONTEXT_CHANNELS.getDocumentId;
export const DESKTOP_CONTEXT_RESOLVE_DOCUMENT_IDS_CHANNEL = DESKTOP_CONTEXT_CHANNELS.resolveDocumentIds;
