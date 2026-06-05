import type { IModelProvider, MessageAttachment } from '@plugins/ai-agent/src/internal';
import { decodeBase64, isTextDocumentMimeType } from '@plugins/ai-agent/src/internal';

type ActiveDocumentContext = {
    path: string;
    mimeType: string;
    dataBase64: string;
};

type MentionedFilePromptPart = {
    path: string;
    name: string;
    content: string;
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

function buildMentionedFilePromptSection(file: MentionedFilePromptPart): string {
    return [
        `[引用文件: ${file.name}]`,
        file.content
    ].join('\n');
}

export function augmentPromptWithMentionedFiles(
    prompt: string,
    files: MentionedFilePromptPart[]
): string {
    if (files.length === 0) {
        return prompt;
    }

    return [
        prompt,
        '',
        files.map(buildMentionedFilePromptSection).join('\n\n')
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
