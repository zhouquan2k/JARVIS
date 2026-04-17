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
