import type { IModelProvider } from '../interfaces/IModelProvider';
import type { MessageAttachment } from '../interfaces/IStorageProvider';
import { decodeBase64, isTextDocumentMimeType } from '../utils/documentData';

type ActiveDocumentContext = {
    path: string;
    mimeType: string;
    dataBase64: string;
};

export type PreparedActiveDocumentRequest = {
    prompt: string;
    attachments: MessageAttachment[];
    mode: 'none' | 'primary-context' | 'attachment' | 'omitted';
};

export function augmentPromptWithAgentContext(
    prompt: string,
    options?: { activeDocument?: ActiveDocumentContext | null }
): string {
    const activeDocument = options?.activeDocument;
    if (!activeDocument) {
        return prompt;
    }

    return [
        `当前文档已作为附件提供：${activeDocument.path}`,
        '',
        prompt
    ].join('\n');
}

function extractDocumentName(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] || 'active-document';
}

export function createAttachmentFromActiveDocument(activeDocument: ActiveDocumentContext): MessageAttachment {
    return {
        id: `active-document:${activeDocument.path}`,
        type: 'file',
        name: extractDocumentName(activeDocument.path),
        mimeType: activeDocument.mimeType,
        size: decodeBase64(activeDocument.dataBase64).byteLength,
        base64Data: activeDocument.dataBase64
    };
}

export async function prepareRequestWithActiveDocument(
    provider: Pick<IModelProvider, 'getDocumentCapability'>,
    prompt: string,
    options?: {
        activeDocument?: ActiveDocumentContext | null;
        attachments?: MessageAttachment[];
    }
): Promise<PreparedActiveDocumentRequest> {
    const activeDocument = options?.activeDocument;
    const attachments = options?.attachments?.map((attachment) => ({ ...attachment })) || [];
    if (!activeDocument) {
        return {
            prompt,
            attachments,
            mode: 'none'
        };
    }

    const capability = await provider.getDocumentCapability?.();
    const acceptedMimeTypes = capability?.acceptedMimeTypes || [];
    if (!acceptedMimeTypes.includes(activeDocument.mimeType)) {
        return {
            prompt,
            attachments,
            mode: 'omitted'
        };
    }

    return {
        prompt: isTextDocumentMimeType(activeDocument.mimeType)
            ? augmentPromptWithAgentContext(prompt, { activeDocument })
            : prompt,
        attachments: [...attachments, createAttachmentFromActiveDocument(activeDocument)],
        mode: 'attachment'
    };
}
