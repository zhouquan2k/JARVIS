type ActiveDocumentContext = {
    path: string;
    content: string;
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
        '[[Active File Context]]',
        `Path: ${activeDocument.path}`,
        'Content:',
        activeDocument.content,
        '',
        '[[User Prompt]]',
        prompt
    ].join('\n');
}
