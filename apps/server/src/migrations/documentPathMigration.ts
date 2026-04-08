import type { SyncConversation, ConversationMessage, MessageAttachment } from '../types/sync.js';

const ACTIVE_DOCUMENT_ATTACHMENT_PREFIX = 'active-document:';

function readAttachmentDocumentPath(attachment: MessageAttachment): string | null {
    if (typeof attachment.id !== 'string' || !attachment.id.startsWith(ACTIVE_DOCUMENT_ATTACHMENT_PREFIX)) {
        return null;
    }

    const documentPath = attachment.id.slice(ACTIVE_DOCUMENT_ATTACHMENT_PREFIX.length).trim();
    return documentPath || null;
}

function inferDocumentPathsFromMessage(message: ConversationMessage | undefined): string[] {
    if (!message || message.role !== 'user' || !Array.isArray(message.attachments)) {
        return [];
    }

    return Array.from(new Set(
        message.attachments
            .map(readAttachmentDocumentPath)
            .filter((path): path is string => !!path)
    ));
}

export function inferDocumentPathsFromConversation(conversation: Pick<SyncConversation, 'documentPaths' | 'messages'>): string[] {
    if (Array.isArray(conversation.documentPaths) && conversation.documentPaths.length > 0) {
        return Array.from(new Set(
            conversation.documentPaths
                .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
                .map((path) => path.trim())
        ));
    }

    const firstUserMessage = conversation.messages.find((message) => message.role === 'user');
    return inferDocumentPathsFromMessage(firstUserMessage);
}

export function applyDocumentPathMigration(conversation: SyncConversation): {
    changed: boolean;
    conversation: SyncConversation;
} {
    const inferredDocumentPaths = inferDocumentPathsFromConversation(conversation);
    const currentDocumentPaths = Array.isArray(conversation.documentPaths)
        ? Array.from(new Set(
            conversation.documentPaths
                .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
                .map((path) => path.trim())
        ))
        : [];

    const changed = currentDocumentPaths.length === 0 && inferredDocumentPaths.length > 0;
    return {
        changed,
        conversation: changed
            ? {
                ...conversation,
                documentPaths: inferredDocumentPaths
            }
            : {
                ...conversation,
                documentPaths: currentDocumentPaths.length > 0 ? currentDocumentPaths : undefined
            }
    };
}
