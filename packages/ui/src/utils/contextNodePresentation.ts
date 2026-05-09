import type { ContextNode } from '@packages/core/src';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];

function findFileExtension(name: string): string {
    const trimmed = name.trim();
    const lastDot = trimmed.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === trimmed.length - 1) {
        return '';
    }

    return trimmed.slice(lastDot).toLowerCase();
}

export function isMarkdownDisplayName(name: string): boolean {
    const extension = findFileExtension(name);
    return MARKDOWN_EXTENSIONS.includes(extension);
}

export function getContextNodeDisplayName(name: string): string {
    if (!isMarkdownDisplayName(name)) {
        return name;
    }

    return name.replace(/\.(?:md|markdown)$/iu, '');
}

export function getContextNodeIconKind(node: ContextNode): string | null {
    if (node.kind !== 'file' || isMarkdownDisplayName(node.name)) {
        return null;
    }

    const extension = findFileExtension(node.name);
    if (!extension) {
        return 'file';
    }

    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'].includes(extension)) {
        return 'image';
    }

    if (extension === '.pdf') {
        return 'pdf';
    }

    if (['.json', '.jsonl'].includes(extension)) {
        return 'json';
    }

    if (['.txt', '.log', '.csv'].includes(extension)) {
        return 'text';
    }

    return 'file';
}

export function normalizeCreatedFileName(name: string, kind: 'file' | 'directory'): string {
    const trimmed = name.trim();
    if (kind !== 'file' || !trimmed || /\.[^/\\.]+$/u.test(trimmed)) {
        return trimmed;
    }

    return `${trimmed}.md`;
}

export function normalizeRenamedFileName(name: string, kind: 'file' | 'directory'): string {
    return normalizeCreatedFileName(name, kind);
}
