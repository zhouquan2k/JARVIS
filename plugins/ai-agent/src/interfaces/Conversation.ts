import type { AnalysisResult } from './AnalysisResult';
import type { ConversationOrigin } from './IExternalConversationProvider';
import type { ReasoningEffort } from './IModelProvider';

export type ConversationRole = 'user' | 'assistant';
export type MessageAttachmentType = 'image' | 'file';
export type MessageFunctionalPartKind = 'tool_call' | 'tool_result' | 'tool_exchange' | 'function_call' | 'search' | 'trace';

export interface MessageAttachment {
    id: string;
    type: MessageAttachmentType;
    name: string;
    mimeType: string;
    size: number;
    base64Data?: string;
    previewBase64?: string;
}

export interface MessageRequestSnapshot {
    prompt: string;
    attachments?: MessageAttachment[];
    activeDocumentMode?: 'none' | 'primary-context' | 'attachment' | 'omitted';
}

export interface MessageFunctionalPart {
    id: string;
    kind: MessageFunctionalPartKind;
    title: string;
    content: string;
    requestContent?: string;
    responseContent?: string;
    collapsed?: boolean;
    afterCharIndex?: number;
}

export interface AnnotationRange {
    start: number;
    end: number;
}

export interface CiteAnnotation {
    kind: 'cite';
    range: AnnotationRange;
    payload: {
        refId: string;
        label: string;
        title?: string;
        url?: string;
        snippet?: string;
    };
}

export interface ImageGroupAnnotation {
    kind: 'image_group';
    range: AnnotationRange | null;
    payload: {
        groupId: string;
        images: Array<{
            id: string;
            mimeType: string;
            alt?: string;
            previewBase64?: string;
            remoteUrl?: string;
            width?: number;
            height?: number;
        }>;
    };
}

export type MessageAnnotation = CiteAnnotation | ImageGroupAnnotation;

export interface ConversationMessage {
    id: string;
    role: ConversationRole;
    content: string;
    createdAt?: number;
    questionId?: string;
    starred?: boolean;
    deleted?: boolean;
    attachments?: MessageAttachment[];
    requestSnapshot?: MessageRequestSnapshot;
    annotations?: MessageAnnotation[];
    functionalParts?: MessageFunctionalPart[];
}

export interface ConversationSyncState {
    dirty?: boolean;
    deleted?: boolean;
    syncedAt?: number | null;
}

export interface ConversationModelSelection {
    providerId: string;
    modelId: string;
    modelOptions: Record<string, boolean>;
    reasoningEffort?: ReasoningEffort;
}

export interface ConversationArchiveMetadata {
    documentPath: string;
    documentId?: string;
    archivedAt: number;
    sourceMessageCount: number;
}

export type ConversationArchiveStatus = {
    state: 'idle' | 'archived' | 'stale';
    archivedAt?: number;
    documentPath?: string;
    documentId?: string;
    sourceMessageCount?: number;
};

export interface Conversation {
    id: string; // Our internal UUID
    backendId?: string; // Real remote provider conversation ID
    title: string;
    boundNodeName?: string;
    origin?: ConversationOrigin;
    externalId?: string;
    agentKey?: string;
    starred?: boolean;
    /** @deprecated Use documentIds instead */
    documentPaths?: string[];
    documentIds?: string[];
    archive?: ConversationArchiveMetadata;
    messages: ConversationMessage[];
    updatedAt: number;
    sync?: ConversationSyncState;
    modelSelection?: ConversationModelSelection;
    compare?: {
        prompt: string;
        modelAProviderId: string;
        modelAModelId: string;
        modelBProviderId: string;
        modelBModelId: string;
        outputA: string;
        outputB: string;
        analysisResult: AnalysisResult;
        analysisRaw?: string;
    };
}

function cloneAttachment(attachment: MessageAttachment): MessageAttachment {
    return { ...attachment };
}

function cloneRequestSnapshot(snapshot: MessageRequestSnapshot): MessageRequestSnapshot {
    return {
        ...snapshot,
        attachments: snapshot.attachments?.map(cloneAttachment)
    };
}

function cloneAnnotation(annotation: MessageAnnotation): MessageAnnotation {
    if (annotation.kind === 'image_group') {
        return {
            ...annotation,
            range: annotation.range ? { ...annotation.range } : null,
            payload: {
                ...annotation.payload,
                images: annotation.payload.images.map((image) => ({ ...image }))
            }
        };
    }

    return {
        ...annotation,
        range: { ...annotation.range },
        payload: { ...annotation.payload }
    };
}

function cloneFunctionalPart(part: MessageFunctionalPart): MessageFunctionalPart {
    return { ...part };
}

export function cloneConversationMessage(message: ConversationMessage): ConversationMessage {
    return {
        ...message,
        attachments: message.attachments?.map(cloneAttachment),
        requestSnapshot: message.requestSnapshot ? cloneRequestSnapshot(message.requestSnapshot) : undefined,
        annotations: message.annotations?.map(cloneAnnotation),
        functionalParts: message.functionalParts?.map(cloneFunctionalPart)
    };
}

function normalizeAttachment(value: unknown, fallbackId: string): MessageAttachment | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const attachment = value as Partial<MessageAttachment>;
    const type = attachment.type === 'image' ? 'image' : attachment.type === 'file' ? 'file' : null;
    const name = typeof attachment.name === 'string' ? attachment.name : '';
    const mimeType = typeof attachment.mimeType === 'string' ? attachment.mimeType : '';
    const size = typeof attachment.size === 'number' && Number.isFinite(attachment.size) ? attachment.size : 0;

    if (!type || !name || !mimeType) {
        return null;
    }

    return {
        id: typeof attachment.id === 'string' && attachment.id ? attachment.id : fallbackId,
        type,
        name,
        mimeType,
        size,
        base64Data: typeof attachment.base64Data === 'string' ? attachment.base64Data : undefined,
        previewBase64: typeof attachment.previewBase64 === 'string' ? attachment.previewBase64 : undefined
    };
}

function normalizeAnnotation(value: unknown): MessageAnnotation | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const annotation = value as Partial<MessageAnnotation>;
    if (annotation.kind === 'cite') {
        const payload = annotation.payload;
        const range = annotation.range;
        if (
            !payload || typeof payload !== 'object' || Array.isArray(payload)
            || !range || typeof range !== 'object' || Array.isArray(range)
        ) {
            return null;
        }

        const citePayload = payload as CiteAnnotation['payload'];
        const citeRange = range as AnnotationRange;
        if (
            typeof citePayload.refId !== 'string'
            || typeof citePayload.label !== 'string'
            || typeof citeRange.start !== 'number'
            || typeof citeRange.end !== 'number'
        ) {
            return null;
        }

        return {
            kind: 'cite',
            range: {
                start: citeRange.start,
                end: citeRange.end
            },
            payload: {
                refId: citePayload.refId,
                label: citePayload.label,
                title: typeof citePayload.title === 'string' ? citePayload.title : undefined,
                url: typeof citePayload.url === 'string' ? citePayload.url : undefined,
                snippet: typeof citePayload.snippet === 'string' ? citePayload.snippet : undefined
            }
        };
    }

    if (annotation.kind === 'image_group') {
        const payload = annotation.payload;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return null;
        }

        const imageGroupPayload = payload as ImageGroupAnnotation['payload'];
        if (typeof imageGroupPayload.groupId !== 'string' || !Array.isArray(imageGroupPayload.images)) {
            return null;
        }

        const range = annotation.range;
        const normalizedRange = range && typeof range === 'object' && !Array.isArray(range)
            && typeof (range as AnnotationRange).start === 'number'
            && typeof (range as AnnotationRange).end === 'number'
            ? {
                start: (range as AnnotationRange).start,
                end: (range as AnnotationRange).end
            }
            : null;

        return {
            kind: 'image_group',
            range: normalizedRange,
            payload: {
                groupId: imageGroupPayload.groupId,
                images: imageGroupPayload.images
                    .filter((image): image is ImageGroupAnnotation['payload']['images'][number] => {
                        return !!image
                            && typeof image === 'object'
                            && !Array.isArray(image)
                            && typeof image.id === 'string'
                            && typeof image.mimeType === 'string';
                    })
                    .map((image) => ({
                        id: image.id,
                        mimeType: image.mimeType,
                        alt: typeof image.alt === 'string' ? image.alt : undefined,
                        previewBase64: typeof image.previewBase64 === 'string' ? image.previewBase64 : undefined,
                        remoteUrl: typeof image.remoteUrl === 'string' ? image.remoteUrl : undefined,
                        width: typeof image.width === 'number' ? image.width : undefined,
                        height: typeof image.height === 'number' ? image.height : undefined
                    }))
            }
        };
    }

    return null;
}

function normalizeFunctionalPart(value: unknown, fallbackId: string): MessageFunctionalPart | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const part = value as Partial<MessageFunctionalPart>;
    const kind = part.kind === 'tool_call'
        || part.kind === 'tool_result'
        || part.kind === 'tool_exchange'
        || part.kind === 'function_call'
        || part.kind === 'search'
        || part.kind === 'trace'
        ? part.kind
        : null;
    const title = typeof part.title === 'string' ? part.title.trim() : '';
    const content = typeof part.content === 'string' ? part.content : '';

    if (!kind || !title || !content) {
        return null;
    }

    return {
        id: typeof part.id === 'string' && part.id ? part.id : fallbackId,
        kind,
        title,
        content,
        requestContent: typeof part.requestContent === 'string' ? part.requestContent : undefined,
        responseContent: typeof part.responseContent === 'string' ? part.responseContent : undefined,
        collapsed: typeof part.collapsed === 'boolean' ? part.collapsed : undefined,
        afterCharIndex: typeof part.afterCharIndex === 'number' && Number.isFinite(part.afterCharIndex)
            ? part.afterCharIndex
            : undefined
    };
}

export function normalizeConversationMessage(value: unknown, index = 0): ConversationMessage {
    const message = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Partial<ConversationMessage>
        : {};

    const createdAt = typeof message.createdAt === 'number' && Number.isFinite(message.createdAt)
        ? message.createdAt
        : undefined;
    const requestSnapshot = message.requestSnapshot
        && typeof message.requestSnapshot === 'object'
        && !Array.isArray(message.requestSnapshot)
        ? message.requestSnapshot as Partial<MessageRequestSnapshot>
        : undefined;

    return {
        id: typeof message.id === 'string' && message.id ? message.id : `message-${index}`,
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: typeof message.content === 'string' ? message.content : '',
        createdAt,
        questionId: typeof message.questionId === 'string' && message.questionId ? message.questionId : undefined,
        starred: typeof message.starred === 'boolean' ? message.starred : undefined,
        deleted: typeof message.deleted === 'boolean' ? message.deleted : undefined,
        attachments: Array.isArray(message.attachments)
            ? message.attachments
                .map((attachment, attachmentIndex) => normalizeAttachment(attachment, `attachment-${index}-${attachmentIndex}`))
                .filter((attachment): attachment is MessageAttachment => !!attachment)
            : undefined,
        requestSnapshot: typeof requestSnapshot?.prompt === 'string'
            ? {
                prompt: requestSnapshot.prompt,
                attachments: Array.isArray(requestSnapshot.attachments)
                    ? requestSnapshot.attachments
                        .map((attachment, attachmentIndex) => normalizeAttachment(
                            attachment,
                            `request-snapshot-attachment-${index}-${attachmentIndex}`
                        ))
                        .filter((attachment): attachment is MessageAttachment => !!attachment)
                    : undefined,
                activeDocumentMode: requestSnapshot.activeDocumentMode === 'none'
                    || requestSnapshot.activeDocumentMode === 'primary-context'
                    || requestSnapshot.activeDocumentMode === 'attachment'
                    || requestSnapshot.activeDocumentMode === 'omitted'
                    ? requestSnapshot.activeDocumentMode
                    : undefined
            }
            : undefined,
        annotations: Array.isArray(message.annotations)
            ? message.annotations
                .map((annotation) => normalizeAnnotation(annotation))
                .filter((annotation): annotation is MessageAnnotation => !!annotation)
            : undefined,
        functionalParts: Array.isArray(message.functionalParts)
            ? message.functionalParts
                .map((part, partIndex) => normalizeFunctionalPart(part, `functional-part-${index}-${partIndex}`))
                .filter((part): part is MessageFunctionalPart => !!part)
            : undefined
    };
}

export function cloneConversation(conversation: Conversation): Conversation {
    return {
        ...conversation,
        agentKey: conversation.agentKey,
        starred: conversation.starred === true ? true : undefined,
        documentPaths: conversation.documentPaths ? [...conversation.documentPaths] : undefined,
        documentIds: conversation.documentIds ? [...conversation.documentIds] : undefined,
        archive: conversation.archive
            ? {
                documentPath: conversation.archive.documentPath,
                documentId: conversation.archive.documentId,
                archivedAt: conversation.archive.archivedAt,
                sourceMessageCount: conversation.archive.sourceMessageCount
            }
            : undefined,
        sync: conversation.sync ? { ...conversation.sync } : undefined,
        modelSelection: conversation.modelSelection
            ? {
                providerId: conversation.modelSelection.providerId,
                modelId: conversation.modelSelection.modelId,
                modelOptions: { ...conversation.modelSelection.modelOptions },
                reasoningEffort: conversation.modelSelection.reasoningEffort
            }
            : undefined,
        compare: conversation.compare
            ? {
                ...conversation.compare,
                analysisResult: { ...conversation.compare.analysisResult }
            }
            : undefined,
        messages: conversation.messages.map(cloneConversationMessage)
    };
}

export function normalizeConversation(conversation: Conversation): Conversation {
    const modelSelection = conversation.modelSelection && typeof conversation.modelSelection === 'object'
        ? conversation.modelSelection
        : undefined;
    const archive = conversation.archive && typeof conversation.archive === 'object'
        ? conversation.archive
        : undefined;
    const documentPaths = Array.isArray(conversation.documentPaths)
        ? Array.from(new Set(
            conversation.documentPaths.filter((path): path is string => {
                return typeof path === 'string' && path.trim().length > 0;
            }).map((path) => path.trim())
        ))
        : undefined;

    const documentIds = Array.isArray(conversation.documentIds)
        ? Array.from(new Set(
            conversation.documentIds.filter((id): id is string => {
                return typeof id === 'string' && id.trim().length > 0;
            }).map((id) => id.trim())
        ))
        : undefined;

    return {
        ...conversation,
        boundNodeName: typeof conversation.boundNodeName === 'string' && conversation.boundNodeName.trim()
            ? conversation.boundNodeName.trim()
            : undefined,
        origin: conversation.origin ?? 'local',
        agentKey: typeof conversation.agentKey === 'string' && conversation.agentKey.trim()
            ? conversation.agentKey
            : undefined,
        starred: conversation.starred === true ? true : undefined,
        documentPaths: documentPaths?.length ? documentPaths : undefined,
        documentIds: documentIds?.length ? documentIds : undefined,
        archive: archive
            && typeof archive.documentPath === 'string'
            && archive.documentPath.trim()
            && typeof archive.archivedAt === 'number'
            && Number.isFinite(archive.archivedAt)
            && typeof archive.sourceMessageCount === 'number'
            && Number.isFinite(archive.sourceMessageCount)
            && archive.sourceMessageCount >= 0
            ? {
                documentPath: archive.documentPath.trim(),
                documentId: typeof archive.documentId === 'string' && archive.documentId.trim()
                    ? archive.documentId.trim()
                    : undefined,
                archivedAt: archive.archivedAt,
                sourceMessageCount: archive.sourceMessageCount
            }
            : undefined,
        sync: conversation.sync ? { ...conversation.sync } : undefined,
        modelSelection: modelSelection
            && typeof modelSelection.providerId === 'string'
            && typeof modelSelection.modelId === 'string'
            ? {
                providerId: modelSelection.providerId,
                modelId: modelSelection.modelId,
                modelOptions: modelSelection.modelOptions && typeof modelSelection.modelOptions === 'object'
                    ? Object.fromEntries(
                        Object.entries(modelSelection.modelOptions).filter((entry): entry is [string, boolean] => {
                            return typeof entry[0] === 'string' && typeof entry[1] === 'boolean';
                        })
                    )
                    : {},
                reasoningEffort: modelSelection.reasoningEffort === 'low'
                    || modelSelection.reasoningEffort === 'medium'
                    || modelSelection.reasoningEffort === 'high'
                    ? modelSelection.reasoningEffort
                    : undefined
            }
            : undefined,
        compare: conversation.compare
            ? {
                ...conversation.compare,
                analysisResult: { ...conversation.compare.analysisResult }
            }
            : undefined,
        messages: Array.isArray(conversation.messages)
            ? conversation.messages.map((message, index) => normalizeConversationMessage(message, index))
            : []
    };
}
