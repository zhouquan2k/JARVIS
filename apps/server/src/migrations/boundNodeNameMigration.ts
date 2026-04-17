import type { SyncConversation } from '../types/sync.js';

export type BoundNodeNameSource = 'existing' | 'documentPaths' | 'active-document';

function extractNodeNameFromPath(path: string): string | undefined {
    const normalizedPath = path.trim().replace(/\\/g, '/');
    if (!normalizedPath) {
        return undefined;
    }

    if (normalizedPath === '/') {
        return 'Root';
    }

    const segments = normalizedPath.split('/').filter(Boolean);
    return segments.at(-1) || undefined;
}

function readActiveDocumentPathFromConversation(
    conversation: Pick<SyncConversation, 'messages'>
): string | undefined {
    const firstUserMessage = conversation.messages.find((message) => message.role === 'user');
    const activeDocumentAttachment = firstUserMessage?.attachments?.find((attachment) => {
        return typeof attachment.id === 'string' && attachment.id.startsWith('active-document:');
    });
    const activeDocumentPath = activeDocumentAttachment?.id?.slice('active-document:'.length)?.trim();
    return activeDocumentPath || undefined;
}

export function resolveBoundNodeNameFromConversation(
    conversation: Pick<SyncConversation, 'boundNodeName' | 'documentPaths' | 'messages'>
): { boundNodeName?: string; source?: BoundNodeNameSource } {
    const existingBoundNodeName = conversation.boundNodeName?.trim();
    if (existingBoundNodeName) {
        return {
            boundNodeName: existingBoundNodeName,
            source: 'existing'
        };
    }

    const firstDocumentPath = conversation.documentPaths?.find((path) => typeof path === 'string' && path.trim().length > 0)?.trim();
    if (firstDocumentPath) {
        return {
            boundNodeName: extractNodeNameFromPath(firstDocumentPath),
            source: 'documentPaths'
        };
    }

    const activeDocumentPath = readActiveDocumentPathFromConversation(conversation);
    if (activeDocumentPath) {
        return {
            boundNodeName: extractNodeNameFromPath(activeDocumentPath),
            source: 'active-document'
        };
    }

    return {};
}

export function applyBoundNodeNameMigration(conversation: SyncConversation): {
    changed: boolean;
    conversation: SyncConversation;
    source?: BoundNodeNameSource;
} {
    const nextBoundNodeNameResult = resolveBoundNodeNameFromConversation(conversation);
    const nextBoundNodeName = nextBoundNodeNameResult.boundNodeName;
    const currentBoundNodeName = conversation.boundNodeName?.trim();
    const changed = currentBoundNodeName !== nextBoundNodeName;

    return {
        source: nextBoundNodeNameResult.source,
        changed,
        conversation: changed
            ? {
                ...conversation,
                boundNodeName: nextBoundNodeName
            }
            : {
                ...conversation,
                boundNodeName: currentBoundNodeName || undefined
            }
    };
}
