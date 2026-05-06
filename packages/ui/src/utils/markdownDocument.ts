import { Crepe, CrepeFeature, type CrepeConfig } from '@milkdown/crepe';
import { editorViewCtx } from '@milkdown/kit/core';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import { Decoration, DecorationSet, type EditorView as ProseMirrorEditorView } from '@milkdown/kit/prose/view';
import { replaceAll } from '@milkdown/kit/utils';
import { resolveContextBaseUrl } from '@packages/core/src';
import { translateWorkspaceMessage } from '../i18n';
import { findMarkdownSearchMatches } from './markdownSearch';
import { renderMermaidPreview } from './mermaidPreview';

export type MarkdownEditor = Crepe;
export type MarkdownViewerMode = 'viewer' | 'edit';

export interface CreateMarkdownEditorOptions {
    root: HTMLElement;
    content: string;
    mode: MarkdownViewerMode;
    documentPath: string | null;
    onChange: (markdown: string) => void;
    onOpenDocumentLink?: (path: string) => void;
}

const viewerControllers = new WeakMap<MarkdownEditor, AbortController>();
const searchStates = new WeakMap<MarkdownEditor, MarkdownEditorSearchState>();

interface MarkdownEditorSearchRange {
    index: number;
    from: number;
    to: number;
}

interface MarkdownEditorSearchState {
    query: string;
    activeMatchIndex: number;
    matchCount: number;
    ranges: MarkdownEditorSearchRange[];
    decoratedDoc: ProseMirrorNode | null;
    decorations: DecorationSet | null;
}

type MarkdownBlockType = 'default-code' | 'mermaid' | 'pdf-embed' | 'table';

export interface MarkdownBlockRenderer {
    readonly name: string;
    renderPreview?: (language: string, content: string, applyPreview: (preview: string | HTMLElement | null) => void) => HTMLElement | string | null;
}

interface MarkdownBlockConfig {
    viewRenderer: MarkdownBlockRenderer;
    editRenderer: MarkdownBlockRenderer;
}

interface MarkdownBlockRenderConfig {
    codeBlocks: Record<MarkdownBlockType, MarkdownBlockConfig>;
    enabledFeatures: NonNullable<CrepeConfig['features']>;
}

const sourceRenderer: MarkdownBlockRenderer = {
    name: 'source'
};

const mermaidPreviewRenderer: MarkdownBlockRenderer = {
    name: 'mermaid-preview',
    renderPreview(language, content, applyPreview) {
        return renderMermaidPreview(language, content, applyPreview);
    }
};

const markdownTablePreviewRenderer: MarkdownBlockRenderer = {
    name: 'markdown-table-preview'
};

const MARKDOWN_BLOCK_CONFIGS: Record<MarkdownBlockType, MarkdownBlockConfig> = {
    mermaid: {
        viewRenderer: mermaidPreviewRenderer,
        editRenderer: sourceRenderer
    },
    'pdf-embed': {
        viewRenderer: sourceRenderer,
        editRenderer: sourceRenderer
    },
    table: {
        viewRenderer: markdownTablePreviewRenderer,
        editRenderer: sourceRenderer
    },
    'default-code': {
        viewRenderer: sourceRenderer,
        editRenderer: sourceRenderer
    }
};

export async function createMarkdownEditor(options: CreateMarkdownEditorOptions): Promise<MarkdownEditor> {
    const blockRenderConfig = createMarkdownBlockRenderConfig(options.mode);
    const pdfEmbedPreviewRenderer = createPdfEmbedPreviewRenderer(options.documentPath);

    const editor = new Crepe({
        root: options.root,
        defaultValue: options.content,
        features: blockRenderConfig.enabledFeatures,
        featureConfigs: {
            [CrepeFeature.CodeMirror]: {
                previewOnlyByDefault: options.mode === 'viewer',
                renderPreview(language, content, applyPreview) {
                    const blockType = detectMarkdownBlockType(language, content);
                    const renderer = blockType === 'pdf-embed'
                        ? pdfEmbedPreviewRenderer
                        : resolveMarkdownBlockRenderer(options.mode, blockType);
                    if (!renderer.renderPreview) {
                        return null;
                    }
                    return renderer.renderPreview(language, content, applyPreview);
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
    attachMarkdownImageResolution(editor, options.root, options.documentPath, options.mode, options.onOpenDocumentLink);
    installMarkdownSearchDecorations(editor);
    return editor;
}

export function createMarkdownBlockRenderConfig(mode: MarkdownViewerMode): MarkdownBlockRenderConfig {
    return {
        codeBlocks: MARKDOWN_BLOCK_CONFIGS,
        enabledFeatures: {
            [CrepeFeature.BlockEdit]: false,
            [CrepeFeature.CodeMirror]: true,
            [CrepeFeature.Cursor]: true,
            [CrepeFeature.ImageBlock]: true,
            [CrepeFeature.Latex]: false,
            [CrepeFeature.LinkTooltip]: false,
            [CrepeFeature.ListItem]: false,
            [CrepeFeature.Placeholder]: true,
            [CrepeFeature.Table]: resolveMarkdownBlockRenderer(mode, 'table') === markdownTablePreviewRenderer,
            [CrepeFeature.Toolbar]: false
        }
    };
}

export function resolveMarkdownBlockRenderer(mode: MarkdownViewerMode, blockType: MarkdownBlockType): MarkdownBlockRenderer {
    const blockConfig = MARKDOWN_BLOCK_CONFIGS[blockType] ?? MARKDOWN_BLOCK_CONFIGS['default-code'];
    return mode === 'viewer'
        ? blockConfig.viewRenderer
        : blockConfig.editRenderer;
}

export function detectMarkdownBlockType(language: string, _content: string): MarkdownBlockType {
    const normalizedLanguage = language.trim().toLowerCase();
    if (normalizedLanguage === 'mermaid') {
        return 'mermaid';
    }
    if (normalizedLanguage === PDF_EMBED_BLOCK_LANGUAGE) {
        return 'pdf-embed';
    }
    return 'default-code';
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
    searchStates.delete(editor);

    await editor.destroy();
}

export function setMarkdownEditorSearchQuery(editor: MarkdownEditor, query: string) {
    const state = getOrCreateSearchState(editor);
    state.query = query;
    state.activeMatchIndex = 0;
    refreshMarkdownEditorSearch(editor);
}

export function setMarkdownEditorActiveSearchMatchIndex(editor: MarkdownEditor, index: number) {
    const state = getOrCreateSearchState(editor);
    state.activeMatchIndex = index;
    refreshMarkdownEditorSearch(editor);
}

export function getMarkdownEditorSearchMatchCount(editor: MarkdownEditor): number {
    return getOrCreateSearchState(editor).matchCount;
}

export function scrollToMarkdownEditorSearchMatch(editor: MarkdownEditor, index: number) {
    withMarkdownEditorView(editor, (view) => {
        const target = view.dom.querySelector<HTMLElement>(`.markdown-search-highlight[data-match-index="${index}"]`);
        target?.scrollIntoView({ block: 'center' });
    });
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

export function resolveMarkdownDocumentLinkPath(href: string, documentPath: string | null): string | null {
    const normalizedHref = href.trim();
    if (!normalizedHref || normalizedHref.startsWith('#') || !documentPath) {
        return null;
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedHref) && !normalizedHref.startsWith('file:')) {
        return null;
    }

    const documentDirectory = documentPath.slice(0, documentPath.lastIndexOf('/') + 1) || '/';
    const resolvedPath = new URL(normalizedHref, `http://workspace.local${documentDirectory}`).pathname;
    const normalizedPath = safeDecodePath(resolvedPath);
    return isWorkspaceDocumentHref(normalizedPath) ? normalizedPath : null;
}

const WIKI_IMAGE_EMBED_PATTERN = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const PDF_EMBED_BLOCK_LANGUAGE = 'cp-pdf-embed';
const PDF_EMBED_HEIGHT = 500;
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

        if (isPdfTarget(normalizedTarget)) {
            return createPdfEmbedCodeBlock(buildPdfEmbedCandidates(target), label);
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

        if (isPdfTarget(trimmedTarget)) {
            const label = alt.trim() || markdownImageLabelFromTarget(trimmedTarget);
            return createPdfEmbedCodeBlock([trimmedTarget], label);
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

function isExplicitMarkdownAssetTarget(target: string): boolean {
    const normalized = target.trim();
    if (!normalized) {
        return false;
    }

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) || normalized.startsWith('data:')) {
        return true;
    }

    return normalized.includes('/') || normalized.startsWith('.');
}

function buildPdfEmbedCandidates(target: string): string[] {
    const normalized = target.trim().replace(/^\/+/, '');
    if (!normalized) {
        return [];
    }

    if (isExplicitMarkdownAssetTarget(normalized)) {
        return [normalized];
    }

    return [
        normalized,
        `references/${normalized}`
    ];
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

function isMarkdownDocumentHref(href: string): boolean {
    const pathname = href.split(/[?#]/, 1)[0].trim().toLowerCase();
    return pathname.endsWith('.md') || pathname.endsWith('.markdown');
}

function isWorkspaceDocumentHref(href: string): boolean {
    return isMarkdownDocumentHref(href) || isPdfHref(href);
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

function installMarkdownSearchDecorations(editor: MarkdownEditor) {
    withMarkdownEditorView(editor, (view) => {
        view.setProps({
            decorations: (state) => {
                return getMarkdownEditorDecorations(editor, state.doc);
            }
        });
    });
}

function getOrCreateSearchState(editor: MarkdownEditor): MarkdownEditorSearchState {
    const existing = searchStates.get(editor);
    if (existing) {
        return existing;
    }

    const created: MarkdownEditorSearchState = {
        query: '',
        activeMatchIndex: 0,
        matchCount: 0,
        ranges: [],
        decoratedDoc: null,
        decorations: null
    };
    searchStates.set(editor, created);
    return created;
}

function refreshMarkdownEditorSearch(editor: MarkdownEditor) {
    withMarkdownEditorView(editor, (view) => {
        const state = getOrCreateSearchState(editor);
        const nextSearch = buildMarkdownEditorSearchState(view.state.doc, state.query, state.activeMatchIndex);
        searchStates.set(editor, nextSearch);
        view.updateState(view.state);
    });
}

function getMarkdownEditorDecorations(editor: MarkdownEditor, doc: ProseMirrorNode): DecorationSet | null {
    const state = getOrCreateSearchState(editor);
    if (!state.query || state.matchCount === 0) {
        return null;
    }

    if (state.decoratedDoc === doc && state.decorations) {
        return state.decorations;
    }

    const decorations = DecorationSet.create(
        doc,
        state.ranges.map((range) => Decoration.inline(range.from, range.to, {
            class: range.index === state.activeMatchIndex
                ? 'markdown-search-highlight markdown-search-highlight--active'
                : 'markdown-search-highlight',
            'data-match-index': String(range.index)
        }))
    );
    state.decoratedDoc = doc;
    state.decorations = decorations;
    return decorations;
}

function buildMarkdownEditorSearchState(
    doc: ProseMirrorNode,
    query: string,
    activeMatchIndex: number
): MarkdownEditorSearchState {
    if (!query.trim()) {
        return {
            query,
            activeMatchIndex: 0,
            matchCount: 0,
            ranges: [],
            decoratedDoc: null,
            decorations: null
        };
    }

    const textNodes: Array<{ from: number; start: number; end: number }> = [];
    let content = '';

    doc.descendants((node, pos) => {
        if (!node.isText || !node.text) {
            return true;
        }

        const start = content.length;
        content += node.text;
        textNodes.push({
            from: pos,
            start,
            end: content.length
        });
        return true;
    });

    const matches = findMarkdownSearchMatches(content, query);
    const ranges: MarkdownEditorSearchRange[] = [];

    for (const match of matches) {
        for (const textNode of textNodes) {
            if (match.end <= textNode.start || match.start >= textNode.end) {
                continue;
            }

            const from = textNode.from + Math.max(match.start, textNode.start) - textNode.start;
            const to = textNode.from + Math.min(match.end, textNode.end) - textNode.start;
            if (from < to) {
                ranges.push({
                    index: match.index,
                    from,
                    to
                });
            }
        }
    }

    return {
        query,
        activeMatchIndex: matches.length === 0 ? 0 : Math.min(activeMatchIndex, matches.length - 1),
        matchCount: matches.length,
        ranges,
        decoratedDoc: null,
        decorations: null
    };
}

function withMarkdownEditorView(editor: MarkdownEditor, callback: (view: ProseMirrorEditorView) => void) {
    editor.editor.action((ctx) => {
        callback(ctx.get(editorViewCtx));
    });
}

function attachMarkdownImageResolution(
    editor: MarkdownEditor,
    root: HTMLElement,
    documentPath: string | null,
    mode: MarkdownViewerMode,
    onOpenDocumentLink?: (path: string) => void
) {
    if (mode !== 'viewer') {
        return;
    }

    const controller = new AbortController();
    let pdfEmbedTimer: number | null = null;

    const schedulePdfEmbedHydration = () => {
        if (controller.signal.aborted) {
            return;
        }

        if (pdfEmbedTimer !== null) {
            window.clearTimeout(pdfEmbedTimer);
        }

        pdfEmbedTimer = window.setTimeout(() => {
            pdfEmbedTimer = null;
            hydratePdfEmbedBlocks(root, documentPath);
        }, 0);
    };

    queueMicrotask(() => {
        schedulePdfEmbedHydration();
    });

    const observer = new MutationObserver(() => {
        schedulePdfEmbedHydration();
    });
    observer.observe(root, {
        childList: true,
        subtree: true
    });

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

        const markdownDocumentPath = resolveMarkdownDocumentLinkPath(href, documentPath);
        if (markdownDocumentPath && onOpenDocumentLink) {
            event.preventDefault();
            event.stopPropagation();
            onOpenDocumentLink(markdownDocumentPath);
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

function hydratePdfEmbedBlocks(root: HTMLElement, documentPath: string | null): void {
    const placeholders = root.querySelectorAll<HTMLElement>('.markdown-pdf-embed[data-pdf-candidates]');
    placeholders.forEach((placeholder) => {
        if (placeholder.querySelector('.markdown-pdf-embed__frame')) {
            return;
        }

        const serializedCandidates = placeholder.dataset.pdfCandidates;
        if (!serializedCandidates) {
            return;
        }

        let candidates: string[] = [];
        try {
            const parsed = JSON.parse(serializedCandidates);
            if (Array.isArray(parsed)) {
                candidates = parsed.filter((candidate): candidate is string => typeof candidate === 'string' && isPdfHref(candidate));
            }
        } catch {
            return;
        }

        const [primaryCandidate] = candidates;
        if (!primaryCandidate) {
            return;
        }

        const label = placeholder.dataset.pdfLabel?.trim() || markdownImageLabelFromTarget(primaryCandidate);
        const object = document.createElement('object');
        object.className = 'markdown-pdf-embed__frame';
        object.type = 'application/pdf';
        object.setAttribute('aria-label', label);
        object.data = resolveMarkdownAssetUrl(primaryCandidate, documentPath);

        const fallbackLink = document.createElement('a');
        fallbackLink.className = 'markdown-pdf-embed__fallback';
        fallbackLink.textContent = label;
        fallbackLink.href = primaryCandidate;

        object.append(fallbackLink);
        placeholder.append(object);

        void resolvePdfEmbedUrl(candidates, documentPath).then((resolvedUrl) => {
            if (!placeholder.isConnected || !object.isConnected) {
                return;
            }

            object.data = resolvedUrl;
            const resolvedPath = safeDocumentAssetPath(resolvedUrl);
            if (resolvedPath) {
                fallbackLink.href = resolvedPath;
            }
        });
    });
}

function isPdfHref(href: string): boolean {
    const assetPath = safeDocumentAssetPath(href);
    const candidate = assetPath ?? safeUrlPathname(href) ?? href;
    const path = candidate.split(/[?#]/, 1)[0];
    return /\.pdf$/i.test(path);
}

function isPdfTarget(target: string): boolean {
    return isPdfHref(target);
}

const pdfEmbedResolutionCache = new Map<string, Promise<string>>();

function createPdfEmbedCodeBlock(targets: string[], label: string): string {
    const payload = JSON.stringify({
        label,
        candidates: targets,
        showLink: false
    });
    return `\`\`\`${PDF_EMBED_BLOCK_LANGUAGE}\n${payload}\n\`\`\``;
}

function parsePdfEmbedBlockContent(content: string): { label: string; candidates: string[]; showLink: boolean } | null {
    try {
        const parsed = JSON.parse(content) as { label?: unknown; candidates?: unknown; showLink?: unknown };
        const candidates = Array.isArray(parsed.candidates)
            ? parsed.candidates.filter((candidate): candidate is string => typeof candidate === 'string' && isPdfHref(candidate))
            : [];
        if (candidates.length === 0) {
            return null;
        }

        return {
            label: typeof parsed.label === 'string' && parsed.label.trim()
                ? parsed.label.trim()
                : markdownImageLabelFromTarget(candidates[0]),
            candidates,
            showLink: parsed.showLink === true
        };
    } catch {
        return null;
    }
}

async function resolvePdfEmbedUrl(candidates: string[], documentPath: string | null): Promise<string> {
    const urls = candidates.map((candidate) => resolveMarkdownAssetUrl(candidate, documentPath));
    const cacheKey = JSON.stringify(urls);
    const cached = pdfEmbedResolutionCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const resolution = (async () => {
        if (typeof fetch !== 'function') {
            return urls[0] ?? '';
        }

        for (const url of urls) {
            try {
                const response = await fetch(url, {
                    method: 'GET'
                });
                response.body?.cancel?.();
                if (response.ok) {
                    return url;
                }
            } catch {
                continue;
            }
        }

        return urls[0] ?? '';
    })();

    pdfEmbedResolutionCache.set(cacheKey, resolution);
    return resolution;
}

function createPdfEmbedPreviewRenderer(documentPath: string | null): MarkdownBlockRenderer {
    return {
        name: 'pdf-embed-preview',
        renderPreview(_language, content) {
            const parsed = parsePdfEmbedBlockContent(content);
            if (!parsed) {
                return null;
            }

            const [primaryCandidate] = parsed.candidates;
            if (!primaryCandidate) {
                return null;
            }

            const wrapper = document.createElement('figure');
            wrapper.className = 'markdown-pdf-embed';
            wrapper.contentEditable = 'false';
            wrapper.dataset.pdfCandidates = JSON.stringify(parsed.candidates);
            wrapper.dataset.pdfLabel = parsed.label;
            if (parsed.showLink) {
                const link = document.createElement('a');
                link.className = 'markdown-pdf-embed__link';
                link.textContent = parsed.label;
                link.href = primaryCandidate;
                wrapper.append(link);
            }

            return wrapper;
        }
    };
}
