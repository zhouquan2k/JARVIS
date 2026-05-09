export function extractNodeNameFromPath(path: string | null | undefined): string | null {
    const normalizedPath = path?.trim();
    if (!normalizedPath) {
        return null;
    }

    if (normalizedPath === '/') {
        return 'Root';
    }

    const segments = normalizedPath.split('/').filter(Boolean);
    return segments[segments.length - 1] || null;
}

export function formatConversationTitle(
    title: string | null | undefined,
    boundNodeName: string | null | undefined,
    fallbackTitle: string
): string {
    const resolvedTitle = title?.trim() || fallbackTitle;
    const resolvedNodeName = boundNodeName?.trim() || '';

    return resolvedNodeName ? `${resolvedNodeName} - ${resolvedTitle}` : resolvedTitle;
}

export function sanitizeConversationTitle(raw: string | null | undefined, maxLength = 30): string {
    const normalized = raw?.trim()
        .replace(/\s+/g, ' ')
        .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, '')
        .replace(/[。．.!?！？]+$/u, '')
        || '';

    if (!normalized) {
        return 'New Chat';
    }

    return normalized.length <= maxLength
        ? normalized
        : `${normalized.slice(0, maxLength)}...`;
}

export function buildFallbackConversationTitle(prompt: string | null | undefined, maxLength = 30): string {
    const normalizedPrompt = prompt?.trim().replace(/\s+/g, ' ') || '';
    if (!normalizedPrompt) {
        return 'New Chat';
    }

    const clause = normalizedPrompt
        .split(/[\n。！？!?；;:：]/u)
        .map((item) => item.trim())
        .find((item) => item.length > 0) || normalizedPrompt;

    return sanitizeConversationTitle(clause, maxLength);
}
