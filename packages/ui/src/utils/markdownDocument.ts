import { Crepe, CrepeFeature, type CrepeConfig } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';
import { resolveContextBaseUrl } from '@packages/core/src';
import { translateWorkspaceMessage } from '../i18n';
import { renderMermaidPreview } from './mermaidPreview';

export type MarkdownEditor = Crepe;
export type MarkdownViewerMode = 'viewer' | 'edit';

export interface CreateMarkdownEditorOptions {
    root: HTMLElement;
    content: string;
    mode: MarkdownViewerMode;
    documentPath: string | null;
    onChange: (markdown: string) => void;
}

const viewerControllers = new WeakMap<MarkdownEditor, AbortController>();

export async function createMarkdownEditor(options: CreateMarkdownEditorOptions): Promise<MarkdownEditor> {
    const enabledFeatures: NonNullable<CrepeConfig['features']> = {
        [CrepeFeature.BlockEdit]: false,
        [CrepeFeature.CodeMirror]: true,
        [CrepeFeature.Cursor]: true,
        [CrepeFeature.ImageBlock]: true,
        [CrepeFeature.Latex]: false,
        [CrepeFeature.LinkTooltip]: false,
        [CrepeFeature.ListItem]: false,
        [CrepeFeature.Placeholder]: true,
        [CrepeFeature.Table]: true,
        [CrepeFeature.Toolbar]: false
    };

    const editor = new Crepe({
        root: options.root,
        defaultValue: options.content,
        features: enabledFeatures,
        featureConfigs: {
            [CrepeFeature.CodeMirror]: {
                previewOnlyByDefault: options.mode === 'viewer',
                renderPreview(language, content, applyPreview) {
                    if (options.mode !== 'viewer') {
                        return null;
                    }
                    if (language.trim().toLowerCase() !== 'mermaid') {
                        return null;
                    }
                    return renderMermaidPreview(language, content, applyPreview);
                }
            },
            [CrepeFeature.ImageBlock]: {
                proxyDomURL: (url) => {
                    return options.mode === 'viewer'
                        ? resolveMarkdownImageUrl(url, options.documentPath)
                        : url;
                },
                onUpload: async () => ''
            },
            [CrepeFeature.Placeholder]: {
                mode: 'doc',
                text: translateWorkspaceMessage('shared.startMarkdownDraft')
            }
        }
    });
    editor.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
            options.onChange(markdown);
        });
    });

    await editor.create();
    attachEditorTestIds(options.root);
    queueMicrotask(() => {
        attachEditorTestIds(options.root);
    });
    window.setTimeout(() => {
        attachEditorTestIds(options.root);
    }, 100);
    attachMarkdownImageResolution(editor, options.root, options.documentPath, options.mode);
    return editor;
}

export function replaceMarkdownDocument(editor: MarkdownEditor, content: string) {
    editor.editor.action(replaceAll(content, true));
}

export function readMarkdownDocument(editor: MarkdownEditor): string {
    return editor.getMarkdown();
}

export async function destroyMarkdownEditor(editor: MarkdownEditor | null | undefined) {
    if (!editor) {
        return;
    }

    const viewerController = viewerControllers.get(editor);
    viewerController?.abort();
    viewerControllers.delete(editor);

    await editor.destroy();
}

export function attachEditorTestIds(root: HTMLElement) {
    const editable = root.querySelector<HTMLElement>('[contenteditable="true"]');
    if (editable) {
        editable.dataset.testid = 'document-editor-input';
    }
}

export function resolveMarkdownImageUrl(src: string, documentPath: string | null): string {
    return resolveMarkdownAssetUrl(src, documentPath);
}

function resolveMarkdownAssetUrl(src: string, documentPath: string | null): string {
    const normalizedSrc = src.trim();
    if (!normalizedSrc) {
        return src;
    }

    if (/^https?:\/\//i.test(normalizedSrc) || /^data:image\//i.test(normalizedSrc)) {
        return src;
    }

    if (!documentPath || normalizedSrc.startsWith('/') || normalizedSrc.startsWith('#')) {
        return src;
    }

    const documentDirectory = documentPath.slice(0, documentPath.lastIndexOf('/') + 1) || '/';
    const resolvedPath = new URL(normalizedSrc, `http://workspace.local${documentDirectory}`).pathname;
    const contextBaseUrl = resolveContextBaseUrl({
        env: readRuntimeEnv()
    });
    return `${contextBaseUrl}/document-asset?path=${encodeURIComponent(safeDecodePath(resolvedPath))}`;
}

const WIKI_IMAGE_EMBED_PATTERN = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const RENDERABLE_IMAGE_EXTENSIONS = new Set([
    'apng',
    'avif',
    'bmp',
    'gif',
    'heic',
    'heif',
    'ico',
    'jpeg',
    'jpg',
    'png',
    'svg',
    'tif',
    'tiff',
    'webp'
]);

export function normalizeMarkdownViewerContent(content: string): string {
    const normalizeViewerEmbed = (
        target: string,
        label: string,
        keepImageSyntax: boolean
    ): string => {
        const normalizedTarget = normalizeMarkdownImageTarget(target);
        if (!normalizedTarget) {
            return keepImageSyntax ? `![](${target})` : `[${label}](${target})`;
        }

        if (isRenderableMarkdownImageTarget(normalizedTarget)) {
            const encodedTarget = encodeMarkdownTargetPath(normalizedTarget);
            return keepImageSyntax
                ? `![](${encodedTarget})`
                : `![${label}](${encodedTarget})`;
        }

        return `[${label}](${encodeMarkdownTargetPath(normalizedTarget)})`;
    };

    const normalizedWikiEmbeds = content.replace(WIKI_IMAGE_EMBED_PATTERN, (match, target: string, alias: string | undefined) => {
        const label = alias?.trim() || markdownImageLabelFromTarget(target);
        return normalizeViewerEmbed(target, label, false);
    });

    return normalizedWikiEmbeds.replace(MARKDOWN_IMAGE_PATTERN, (match, alt: string, target: string) => {
        const trimmedTarget = target.trim();
        if (!trimmedTarget) {
            return match;
        }

        // Remote URLs and data URIs pass through unchanged — Milkdown handles them directly.
        if (/^https?:\/\//i.test(trimmedTarget) || /^data:/i.test(trimmedTarget)) {
            return match;
        }

        // For standard Markdown image syntax we never add a references/ prefix — that only
        // applies to wiki-style embeds converted in the first pass above.  We only perform
        // the renderable-vs-link classification and idempotent encoding.
        const encodedTarget = encodeMarkdownTargetPath(trimmedTarget);
        if (isRenderableMarkdownImageTarget(trimmedTarget)) {
            return `![${alt}](${encodedTarget})`;
        }

        const label = alt.trim() || markdownImageLabelFromTarget(trimmedTarget);
        return `[${label}](${encodedTarget})`;
    });
}

function normalizeMarkdownImageTarget(target: string): string {
    const normalized = target.trim().replace(/^\/+/, '');
    if (!normalized) {
        return '';
    }

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) || normalized.startsWith('data:')) {
        return normalized;
    }

    if (normalized.startsWith('references/')) {
        return normalized;
    }

    return `references/${normalized}`;
}

function isRenderableMarkdownImageTarget(target: string): boolean {
    const normalized = target.trim();
    if (!normalized) {
        return false;
    }

    if (/^data:image\//i.test(normalized)) {
        return true;
    }

    if (/^https?:\/\//i.test(normalized)) {
        const assetPath = safeDocumentAssetPath(normalized);
        if (assetPath) {
            return hasRenderableImageExtension(assetPath);
        }

        const pathname = safeUrlPathname(normalized);
        return pathname ? hasRenderableImageExtension(pathname) : false;
    }

    return hasRenderableImageExtension(normalized);
}

function hasRenderableImageExtension(target: string): boolean {
    const path = target.split(/[?#]/, 1)[0];
    const fileName = path.split('/').pop() ?? path;
    const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : '';
    return RENDERABLE_IMAGE_EXTENSIONS.has(extension);
}

function safeUrlPathname(url: string): string | null {
    try {
        return new URL(url).pathname;
    } catch {
        return null;
    }
}

function safeDocumentAssetPath(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (!parsed.pathname.endsWith('/document-asset')) {
            return null;
        }

        const path = parsed.searchParams.get('path');
        return path ? decodeURIComponent(path) : null;
    } catch {
        return null;
    }
}

function safeDecodePath(path: string): string {
    try {
        return decodeURIComponent(path);
    } catch {
        return path;
    }
}

function encodeMarkdownTargetPath(target: string): string {
    const hashIndex = target.indexOf('#');
    const targetBeforeHash = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
    const hash = hashIndex >= 0 ? target.slice(hashIndex) : '';
    const queryIndex = targetBeforeHash.indexOf('?');
    const path = queryIndex >= 0 ? targetBeforeHash.slice(0, queryIndex) : targetBeforeHash;
    const query = queryIndex >= 0 ? targetBeforeHash.slice(queryIndex) : '';
    let decodedPath: string;
    try {
        decodedPath = decodeURI(path);
    } catch {
        decodedPath = path;
    }
    return `${encodeURI(decodedPath)}${query}${hash}`;
}

function markdownImageLabelFromTarget(target: string): string {
    const normalized = target.split(/[?#]/, 1)[0];
    return normalized.split('/').pop() ?? normalized;
}

function readRuntimeEnv(): Record<string, string | undefined> {
    return typeof import.meta !== 'undefined' && import.meta.env
        ? import.meta.env as Record<string, string | undefined>
        : {};
}

function attachMarkdownImageResolution(
    editor: MarkdownEditor,
    root: HTMLElement,
    documentPath: string | null,
    mode: MarkdownViewerMode
) {
    if (mode !== 'viewer') {
        return;
    }

    const controller = new AbortController();
    let pdfEmbedTimer: number | null = null;

    const schedulePdfEmbedInjection = () => {
        if (controller.signal.aborted) {
            return;
        }

        if (pdfEmbedTimer !== null) {
            window.clearTimeout(pdfEmbedTimer);
        }

        pdfEmbedTimer = window.setTimeout(() => {
            pdfEmbedTimer = null;
            injectPdfEmbeds(root, documentPath);
        }, 100);
    };

    queueMicrotask(() => {
        if (!controller.signal.aborted) {
            injectPdfEmbeds(root, documentPath);
        }
    });

    const observer = new MutationObserver(() => {
        schedulePdfEmbedInjection();
    });
    observer.observe(root, {
        childList: true,
        subtree: true
    });
    schedulePdfEmbedInjection();
    controller.signal.addEventListener('abort', () => {
        observer.disconnect();
        if (pdfEmbedTimer !== null) {
            window.clearTimeout(pdfEmbedTimer);
            pdfEmbedTimer = null;
        }
    }, { once: true });

    root.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const anchor = target.closest<HTMLAnchorElement>('a[href]');
        if (!anchor) {
            return;
        }

        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#')) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        window.open(resolveMarkdownAssetUrl(href, documentPath), '_blank');
    }, {
        capture: true,
        signal: controller.signal
    });

    viewerControllers.set(editor, controller);
}

function injectPdfEmbeds(root: HTMLElement, documentPath: string | null): void {
    const anchors = root.querySelectorAll<HTMLAnchorElement>('a[href]');
    anchors.forEach((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href || !isPdfHref(href)) {
            return;
        }

        const resolvedUrl = resolveMarkdownAssetUrl(href, documentPath);
        const insertAfter = findPdfEmbedInsertionTarget(anchor);
        if (!insertAfter || root.querySelector(`.pdf-inline-embed[data-pdf-embed-src="${cssEscape(resolvedUrl)}"]`)) {
            return;
        }

        const embed = document.createElement('div');
        embed.className = 'pdf-inline-embed';
        embed.dataset.pdfEmbedSrc = resolvedUrl;
        embed.contentEditable = 'false';

        const iframe = document.createElement('iframe');
        iframe.src = resolvedUrl;
        iframe.title = anchor.textContent?.trim() || markdownImageLabelFromTarget(href);
        iframe.loading = 'lazy';

        embed.append(iframe);
        insertAfter.insertAdjacentElement('afterend', embed);
    });
}

function findPdfEmbedInsertionTarget(anchor: HTMLAnchorElement): Element | null {
    const editorHost = anchor.closest<HTMLElement>('[contenteditable="true"]');
    if (!editorHost) {
        return anchor.closest('p') ?? anchor.parentElement;
    }

    let insertAfter: Element = editorHost;
    let nextElement = insertAfter.nextElementSibling;
    while (nextElement instanceof HTMLElement && nextElement.classList.contains('pdf-inline-embed')) {
        insertAfter = nextElement;
        nextElement = nextElement.nextElementSibling;
    }
    return insertAfter;
}

function cssEscape(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(value);
    }

    return value.replace(/["\\]/g, '\\$&');
}

function isPdfHref(href: string): boolean {
    const assetPath = safeDocumentAssetPath(href);
    const candidate = assetPath ?? safeUrlPathname(href) ?? href;
    const path = candidate.split(/[?#]/, 1)[0];
    return /\.pdf$/i.test(path);
}
