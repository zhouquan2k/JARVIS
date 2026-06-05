import { Crepe, CrepeFeature, type CrepeConfig } from '@milkdown/crepe';
import { editorViewCtx, parserCtx, remarkCtx } from '@milkdown/kit/core';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import { Decoration, DecorationSet, type EditorView as ProseMirrorEditorView } from '@milkdown/kit/prose/view';
import { replaceAll } from '@milkdown/kit/utils';
import { resolveContextBaseUrl } from '@plugins/ai-agent/api';
import { translateWorkspaceMessage } from '../i18n';
import { findMarkdownSearchMatches } from './markdownSearch';
import { renderMermaidPreview } from './mermaidPreview';

export type MarkdownEditor = Crepe;
export type MarkdownViewerMode = 'viewer' | 'edit';

// Stores the stripped YAML frontmatter for each editor instance so Milkdown
// never sees it (preventing corruption on auto-save) while callers continue to
// receive the full document including frontmatter.
const editorFrontmatter = new WeakMap<Crepe, string>();

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
    if (!content.startsWith('---')) {
        return { frontmatter: '', body: content };
    }
    const end = content.indexOf('\n---', 3);
    if (end < 0) {
        return { frontmatter: '', body: content };
    }
    const frontmatter = content.slice(0, end + 4); // "---\n...\n---"
    const rest = content.slice(end + 4);
    return { frontmatter, body: rest.startsWith('\n') ? rest.slice(1) : rest };
}

function joinFrontmatter(frontmatter: string, body: string): string {
    return frontmatter ? `${frontmatter}\n${body}` : body;
}
export interface RenderSelectionSnapshot {
    blockText: string;
    start: number;
    end: number;
    selectedText: string;
    blockIndex?: number;
}

export interface MarkdownConversationLinkTarget {
    conversationId: string;
}

export interface CreateMarkdownEditorOptions {
    root: HTMLElement;
    content: string;
    mode: MarkdownViewerMode;
    documentPath: string | null;
    onChange: (markdown: string) => void;
    onOpenDocumentLink?: (path: string) => void;
    onOpenConversationLink?: (target: MarkdownConversationLinkTarget) => void;
    onResizeMarkdownImage?: (payload: { src: string; ratio: number }) => void;
    /**
     * Source of truth for the current markdown text. Hydration reads it to
     * recover each image's ratio (Crepe-compatible alt-as-ratio convention)
     * because the rendered DOM does not preserve that information.
     */
    getMarkdownSource?: () => string;
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

export type ResizableMarkdownImageMatchKind = 'markdown-image' | 'html-image' | 'wiki-image';

export interface ResizableMarkdownImageMatch {
    start: number;
    end: number;
    kind: ResizableMarkdownImageMatchKind;
    raw: string;
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

    const { frontmatter: initialFrontmatter, body: initialBody } = splitFrontmatter(options.content);

    const editor = new Crepe({
        root: options.root,
        defaultValue: initialBody,
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
        const handleMarkdownUpdated = (_ctx: unknown, markdown: string) => {
            const fm = editorFrontmatter.get(editor) ?? '';
            options.onChange(joinFrontmatter(fm, markdown));
        };

        listener.markdownUpdated(handleMarkdownUpdated);
        listener.destroy(() => {
            const listeners = listener.listeners.markdownUpdated;
            const index = listeners.indexOf(handleMarkdownUpdated);
            if (index >= 0) {
                listeners.splice(index, 1);
            }
        });
    });

    await editor.create();
    editorFrontmatter.set(editor, initialFrontmatter);
    attachEditorTestIds(options.root);
    queueMicrotask(() => {
        attachEditorTestIds(options.root);
    });
    window.setTimeout(() => {
        attachEditorTestIds(options.root);
    }, 100);
    attachMarkdownImageEnhancements(
        editor,
        options.root,
        options.documentPath,
        options.mode,
        options.onOpenDocumentLink,
        options.onOpenConversationLink,
        options.onResizeMarkdownImage,
        options.getMarkdownSource
    );
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
            [CrepeFeature.ListItem]: true,
            [CrepeFeature.Placeholder]: mode !== 'viewer',
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
    const { frontmatter, body } = splitFrontmatter(content);
    editorFrontmatter.set(editor, frontmatter);
    editor.editor.action(replaceAll(body, true));
}

export function readMarkdownDocument(editor: MarkdownEditor): string {
    const body = editor.getMarkdown();
    const frontmatter = editorFrontmatter.get(editor) ?? '';
    return joinFrontmatter(frontmatter, body);
}

export function insertMarkdownAtViewerSelection(
    editor: MarkdownEditor,
    snippet: string
): boolean {
    let inserted = false;
    try {
        editor.editor.action((ctx) => {
            if (!ctx.isInjected(editorViewCtx) || !ctx.isInjected(parserCtx)) {
                console.warn('[markdown-viewer] insertMarkdownAtViewerSelection: missing editorViewCtx or parserCtx');
                return;
            }
            const view = ctx.get(editorViewCtx);
            const parser = ctx.get(parserCtx);
            const parsed = parser(snippet);
            if (!parsed) {
                console.warn('[markdown-viewer] insertMarkdownAtViewerSelection: parser returned no doc');
                return;
            }
            const { from, to } = view.state.selection;
            const slice = parsed.slice(0);
            const tr = view.state.tr.replace(from, to, slice);
            view.dispatch(tr);
            inserted = true;
        });
    } catch (error) {
        console.warn('[markdown-viewer] insertMarkdownAtViewerSelection threw', error);
        return false;
    }
    return inserted;
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

const MARKDOWN_CONVERSATION_LINK_PROTOCOL = 'chatprism://conversation/';

export function buildMarkdownConversationLinkHref(conversationId: string): string {
    return `${MARKDOWN_CONVERSATION_LINK_PROTOCOL}${encodeURIComponent(conversationId.trim())}`;
}

export function resolveMarkdownConversationLinkTarget(href: string): MarkdownConversationLinkTarget | null {
    const normalizedHref = href.trim();
    if (!normalizedHref.startsWith(MARKDOWN_CONVERSATION_LINK_PROTOCOL)) {
        return null;
    }

    const conversationId = decodeURIComponent(normalizedHref.slice(MARKDOWN_CONVERSATION_LINK_PROTOCOL.length)).trim();
    if (!conversationId) {
        return null;
    }

    return { conversationId };
}

/**
 * Rewrite all relative markdown links in `markdown` so they remain valid after
 * the document is moved from `fromDir` to `toDir` (both are virtual directory
 * paths, e.g. "/agent/docs").  Absolute URLs, data URIs, and #-anchors are
 * left unchanged.
 */
export function rewriteOutgoingLinks(markdown: string, fromDir: string, toDir: string): string {
    const normalizedFrom = fromDir.endsWith('/') ? fromDir : `${fromDir}/`;
    const normalizedTo = toDir.endsWith('/') ? toDir : `${toDir}/`;
    if (normalizedFrom === normalizedTo) {
        return markdown;
    }

    const LINK_PATTERN = /(!?\[[^\]]*\])\(([^)]+)\)/g;
    return markdown.replace(LINK_PATTERN, (match, prefix: string, rawTarget: string) => {
        const target = rawTarget.trim();
        if (!target || target.startsWith('#')) {
            return match;
        }
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
            return match;
        }
        const hashIndex = target.indexOf('#');
        const pathPart = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
        const anchorPart = hashIndex >= 0 ? target.slice(hashIndex) : '';
        const resolvedPath = resolveVirtualPath(normalizedFrom, pathPart);
        const newRelative = computeRelativePath(normalizedTo, resolvedPath);
        return `${prefix}(${encodeMarkdownTargetPath(newRelative)}${anchorPart})`;
    });
}

function resolveVirtualPath(baseDir: string, relativePath: string): string {
    const segments = baseDir.split('/').filter(Boolean);
    for (const part of relativePath.split('/')) {
        if (part === '..') {
            segments.pop();
        } else if (part !== '.') {
            segments.push(part);
        }
    }
    return `/${segments.join('/')}`;
}

function computeRelativePath(fromDir: string, toAbsolute: string): string {
    const fromSegments = fromDir.split('/').filter(Boolean);
    const toSegments = toAbsolute.split('/').filter(Boolean);
    let sharedLength = 0;
    while (
        sharedLength < fromSegments.length
        && sharedLength < toSegments.length
        && fromSegments[sharedLength] === toSegments[sharedLength]
    ) {
        sharedLength += 1;
    }
    const upCount = fromSegments.length - sharedLength;
    const ups = Array.from({ length: upCount }, () => '..');
    const downs = toSegments.slice(sharedLength);
    const parts = [...ups, ...downs];
    return parts.length > 0 ? parts.join('/') : './';
}

export function buildRelativeMarkdownLinkPath(fromDocumentPath: string, toDocumentPath: string): string {
    const fromDirectorySegments = fromDocumentPath.split('/').filter(Boolean).slice(0, -1);
    const toSegments = toDocumentPath.split('/').filter(Boolean);
    let sharedLength = 0;

    while (
        sharedLength < fromDirectorySegments.length
        && sharedLength < toSegments.length
        && fromDirectorySegments[sharedLength] === toSegments[sharedLength]
    ) {
        sharedLength += 1;
    }

    const upwardSegments = fromDirectorySegments.slice(sharedLength).map(() => '..');
    const downwardSegments = toSegments.slice(sharedLength);
    const relativeSegments = [...upwardSegments, ...downwardSegments];

    return relativeSegments.join('/') || './';
}

export function captureRenderableMarkdownSelection(root: HTMLElement): RenderSelectionSnapshot | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }

    const range = selection.getRangeAt(0);
    const startBlock = findSupportedRenderBlock(range.startContainer, root);
    const endBlock = findSupportedRenderBlock(range.endContainer, root);
    if (!startBlock || startBlock !== endBlock) {
        return null;
    }

    const blockText = startBlock.textContent ?? '';
    if (!blockText) {
        const blockIndex = findTopLevelBlockIndex(startBlock, root);
        if (blockIndex === null) {
            return null;
        }
        return {
            blockText: '',
            start: 0,
            end: 0,
            selectedText: '',
            blockIndex
        };
    }

    const start = getTextOffsetWithinBlock(startBlock, range.startContainer, range.startOffset);
    const end = getTextOffsetWithinBlock(startBlock, range.endContainer, range.endOffset);
    if (start === null || end === null) {
        return null;
    }

    return {
        blockText,
        start: Math.min(start, end),
        end: Math.max(start, end),
        selectedText: range.toString()
    };
}

export function resolveEmptyBlockMarkdownOffset(
    editor: MarkdownEditor,
    markdown: string,
    blockIndex: number
): { start: number; end: number } | null {
    let offset: number | null = null;
    let diagnostic: Record<string, unknown> = { reason: 'never-entered' };
    try {
        editor.editor.action((ctx) => {
            if (!ctx.isInjected(remarkCtx)) {
                diagnostic = { reason: 'remarkCtx-not-injected' };
                return;
            }
            const remark = ctx.get(remarkCtx);
            const tree = remark.runSync(remark.parse(markdown), markdown) as { children?: Array<{ type?: string; position?: { start?: { offset?: number } } }> };
            const childrenCount = tree.children?.length ?? 0;
            const child = tree.children?.[blockIndex];
            const childOffset = child?.position?.start?.offset;
            diagnostic = {
                reason: typeof childOffset === 'number' ? 'ok' : 'no-offset',
                blockIndex,
                childrenCount,
                childType: child?.type,
                childPositionStart: child?.position?.start,
                firstFewChildren: tree.children?.slice(0, Math.min(5, childrenCount)).map((c) => ({
                    type: c?.type,
                    startOffset: c?.position?.start?.offset
                }))
            };
            if (typeof childOffset === 'number') {
                offset = childOffset;
            }
        });
    } catch (error) {
        console.warn('[insert-debug] mdast resolve threw', error);
        return null;
    }
    console.log('[insert-debug] mdast diagnostic=', diagnostic);
    if (offset === null) {
        return null;
    }
    return { start: offset, end: offset };
}

export function resolveEmptyBlockAnchorFallback(
    root: HTMLElement,
    snapshot: RenderSelectionSnapshot,
    markdown: string
): { start: number; end: number } | null {
    if (typeof snapshot.blockIndex !== 'number') {
        return null;
    }
    const proseMirror = root.querySelector('.ProseMirror');
    if (!proseMirror) {
        return null;
    }
    const children = Array.from(proseMirror.children) as HTMLElement[];
    const targetBlock = children[snapshot.blockIndex];
    if (!targetBlock) {
        return null;
    }

    let anchorTextBefore: string | null = null;
    let gapAfterAnchor = 0;
    for (let index = snapshot.blockIndex - 1; index >= 0; index -= 1) {
        const candidate = children[index];
        const text = candidate?.textContent ?? '';
        if (text) {
            anchorTextBefore = text;
            gapAfterAnchor = snapshot.blockIndex - index;
            break;
        }
    }
    if (anchorTextBefore !== null) {
        const blocks = buildSimpleMarkdownRenderBlocks(markdown);
        for (const block of blocks) {
            if (block.visibleText !== anchorTextBefore) {
                continue;
            }
            const offset = skipForwardSourceBlocks(markdown, block.sourceEnd, gapAfterAnchor);
            if (offset !== null) {
                return { start: offset, end: offset };
            }
        }
    }

    let anchorTextAfter: string | null = null;
    let gapBeforeAnchor = 0;
    for (let index = snapshot.blockIndex + 1; index < children.length; index += 1) {
        const candidate = children[index];
        const text = candidate?.textContent ?? '';
        if (text) {
            anchorTextAfter = text;
            gapBeforeAnchor = index - snapshot.blockIndex;
            break;
        }
    }
    if (anchorTextAfter !== null) {
        const blocks = buildSimpleMarkdownRenderBlocks(markdown);
        for (const block of blocks) {
            if (block.visibleText !== anchorTextAfter) {
                continue;
            }
            const offset = skipBackwardSourceBlocks(markdown, block.sourceStart, gapBeforeAnchor);
            if (offset !== null) {
                return { start: offset, end: offset };
            }
        }
    }

    return null;
}

function skipForwardSourceBlocks(markdown: string, startOffset: number, blockCount: number): number | null {
    if (blockCount <= 0) {
        return startOffset;
    }
    let offset = startOffset;
    let blocksSkipped = 0;
    while (blocksSkipped < blockCount && offset < markdown.length) {
        const nextNewline = markdown.indexOf('\n', offset);
        if (nextNewline === -1) {
            return null;
        }
        offset = nextNewline + 1;
        blocksSkipped += 1;
    }
    return offset;
}

function skipBackwardSourceBlocks(markdown: string, endOffset: number, blockCount: number): number | null {
    if (blockCount <= 0) {
        return endOffset;
    }
    let offset = endOffset;
    let blocksSkipped = 0;
    while (blocksSkipped < blockCount && offset > 0) {
        const previousNewline = markdown.lastIndexOf('\n', offset - 1);
        if (previousNewline === -1) {
            return null;
        }
        offset = previousNewline;
        blocksSkipped += 1;
    }
    return Math.max(0, offset);
}

function findTopLevelBlockIndex(startBlock: HTMLElement, root: HTMLElement): number | null {
    const proseMirror = root.querySelector('.ProseMirror');
    if (!proseMirror) {
        return null;
    }
    let topLevel: HTMLElement | null = startBlock;
    while (topLevel && topLevel.parentElement && topLevel.parentElement !== proseMirror) {
        topLevel = topLevel.parentElement;
    }
    if (!topLevel || topLevel.parentElement !== proseMirror) {
        return null;
    }
    const index = Array.from(proseMirror.children).indexOf(topLevel);
    return index >= 0 ? index : null;
}

export function resolveMarkdownSourceSelection(
    markdown: string,
    snapshot: RenderSelectionSnapshot
): { start: number; end: number } | null {
    const blocks = buildSimpleMarkdownRenderBlocks(markdown);
    for (const block of blocks) {
        if (block.visibleText !== snapshot.blockText) {
            continue;
        }

        const sourceStart = block.sourceStart + snapshot.start;
        const sourceEnd = block.sourceStart + snapshot.end;
        if (sourceStart < block.sourceStart || sourceEnd > block.sourceEnd) {
            continue;
        }

        return {
            start: sourceStart,
            end: sourceEnd
        };
    }

    return null;
}

function findSupportedRenderBlock(node: Node, root: HTMLElement): HTMLElement | null {
    let current: Node | null = node;
    while (current && current !== root) {
        if (current instanceof HTMLElement) {
            if (current.closest('[data-type="code-block"], table, pre, blockquote code')) {
                return null;
            }

            if (/^(P|LI|H1|H2|H3|H4|H5|H6)$/u.test(current.tagName)) {
                return current;
            }
        }
        current = current.parentNode;
    }

    return null;
}

function getTextOffsetWithinBlock(block: HTMLElement, container: Node, offset: number): number | null {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;

    while (walker.nextNode()) {
        const node = walker.currentNode;
        const textLength = node.textContent?.length ?? 0;
        if (node === container) {
            return currentOffset + offset;
        }
        if (node.contains(container)) {
            return currentOffset + offset;
        }
        currentOffset += textLength;
    }

    return container === block ? offset : null;
}

function buildSimpleMarkdownRenderBlocks(markdown: string): Array<{
    visibleText: string;
    sourceStart: number;
    sourceEnd: number;
}> {
    const lines = markdown.split('\n');
    const blocks: Array<{ visibleText: string; sourceStart: number; sourceEnd: number }> = [];
    let cursor = 0;
    let inFence = false;

    for (const line of lines) {
        const lineStart = cursor;
        const lineEnd = cursor + line.length;
        cursor = lineEnd + 1;

        if (/^\s*```/u.test(line) || /^\s*~~~/u.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence || !line.trim()) {
            continue;
        }
        if (/^\s*\|/u.test(line) || /^\s*!\[\[/u.test(line) || /^\s*!\[[^\]]*\]\(/u.test(line)) {
            continue;
        }

        const markerMatch = line.match(/^(\s*(?:#{1,6}\s+|(?:>+\s*)+|(?:[-*+]\s+|\d+\.\s+))(?:\[[ xX]\]\s+)*)/u);
        const markerLength = markerMatch?.[1]?.length ?? 0;
        const visibleText = line.slice(markerLength);
        if (!visibleText) {
            continue;
        }

        blocks.push({
            visibleText,
            sourceStart: lineStart + markerLength,
            sourceEnd: lineEnd
        });
    }

    return blocks;
}

const WIKI_IMAGE_EMBED_PATTERN = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const HTML_IMAGE_PATTERN = /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;
const PDF_EMBED_BLOCK_LANGUAGE = 'cp-pdf-embed';
const PDF_EMBED_HEIGHT = 500;
const MIN_MARKDOWN_IMAGE_WIDTH_PX = 48;
const MAX_MARKDOWN_IMAGE_WIDTH_PX = 1600;
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

    const normalizedMarkdownImages = normalizedWikiEmbeds.replace(MARKDOWN_IMAGE_PATTERN, (match, alt: string, target: string) => {
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

    return normalizedMarkdownImages.replace(HTML_IMAGE_PATTERN, (match, _quote: string, _target: string) => {
        const parsed = parseHtmlImageTag(match);
        if (!parsed?.src) {
            return match;
        }

        const trimmedTarget = parsed.src.trim();
        if (!trimmedTarget) {
            return match;
        }

        if (/^https?:\/\//i.test(trimmedTarget) || /^data:/i.test(trimmedTarget)) {
            return match;
        }

        if (isRenderableMarkdownImageTarget(trimmedTarget)) {
            // Strip width and rewrite to markdown image syntax. Crepe ImageBlock
            // owns the alt field as a numeric ratio, so we never encode anything
            // else there. Legacy `<img width=N>` content loses the explicit pixel
            // width on its first re-save (acceptable trade-off — see plan).
            const encodedTarget = encodeMarkdownTargetPath(trimmedTarget);
            const altText = parsed.alt.trim();
            // Preserve the alt only when it parses as a valid Crepe ratio; any
            // non-numeric prior alt would otherwise be reinterpreted as ratio=1
            // anyway, so let it normalize to an empty alt.
            const ratioCandidate = altText ? Number(altText) : NaN;
            const ratioAlt = Number.isFinite(ratioCandidate) && ratioCandidate > 0
                ? ratioCandidate.toFixed(2)
                : '';
            return `![${ratioAlt}](${encodedTarget})`;
        }

        if (isPdfTarget(trimmedTarget)) {
            const label = parsed.alt || markdownImageLabelFromTarget(trimmedTarget);
            return createPdfEmbedCodeBlock([trimmedTarget], label);
        }

        const label = parsed.alt || markdownImageLabelFromTarget(trimmedTarget);
        return `[${label}](${encodeMarkdownTargetPath(trimmedTarget)})`;
    });
}

export function findResizableMarkdownImageSource(
    markdown: string,
    renderedSrc: string,
    documentPath: string | null
): ResizableMarkdownImageMatch | null {
    const normalizedRenderedSrc = renderedSrc.trim();
    if (!normalizedRenderedSrc) {
        return null;
    }

    const assetPath = safeDocumentAssetPath(normalizedRenderedSrc);
    const isRemoteUrl = /^https?:\/\//i.test(normalizedRenderedSrc) && !assetPath;
    if (isRemoteUrl || /^data:/i.test(normalizedRenderedSrc)) {
        return null;
    }

    const matches: ResizableMarkdownImageMatch[] = [];

    markdown.replace(MARKDOWN_IMAGE_PATTERN, (raw, alt: string, target: string, offset: number) => {
        const trimmedTarget = target.trim();
        if (trimmedTarget && doesRenderedMarkdownSourceMatch(trimmedTarget, normalizedRenderedSrc, documentPath)) {
            matches.push({
                start: offset,
                end: offset + raw.length,
                kind: 'markdown-image',
                raw
            });
        }
        return raw;
    });

    markdown.replace(HTML_IMAGE_PATTERN, (raw, _quote: string, target: string, offset: number) => {
        const trimmedTarget = target.trim();
        if (trimmedTarget && doesRenderedMarkdownSourceMatch(trimmedTarget, normalizedRenderedSrc, documentPath)) {
            matches.push({
                start: offset,
                end: offset + raw.length,
                kind: 'html-image',
                raw
            });
        }
        return raw;
    });

    markdown.replace(WIKI_IMAGE_EMBED_PATTERN, (raw, target: string, _alias: string | undefined, offset: number) => {
        const normalizedTarget = normalizeMarkdownImageTarget(target);
        if (normalizedTarget && doesRenderedMarkdownSourceMatch(normalizedTarget, normalizedRenderedSrc, documentPath)) {
            matches.push({
                start: offset,
                end: offset + raw.length,
                kind: 'wiki-image',
                raw
            });
        }
        return raw;
    });

    const resolvedMatch = matches.length === 1 ? matches[0] : null;
    return resolvedMatch;
}

/**
 * Persist a Crepe-compatible ratio onto the source markdown for the matched
 * image. We always emit the markdown image syntax `![${ratio}](src)` because
 * that is what Crepe ImageBlock's toMarkdown produces; HTML and wiki forms are
 * normalized to the same shape so downstream parsing is uniform.
 */
export function rewriteMarkdownImageRatio(
    markdown: string,
    match: ResizableMarkdownImageMatch,
    ratio: number
): string {
    const clampedRatio = clampMarkdownImageRatio(ratio);
    const replacement = rewriteMarkdownImageMatchRatio(match, clampedRatio);
    if (!replacement || replacement === match.raw) {
        return markdown;
    }
    return `${markdown.slice(0, match.start)}${replacement}${markdown.slice(match.end)}`;
}

/**
 * Look up the ratio currently stored in the source markdown for a rendered
 * image. Returns 1 when the image cannot be located unambiguously or the alt
 * does not parse as a positive number — matching Crepe's parseMarkdown.runner
 * fallback logic so hydrate stays in sync with what ImageBlock will compute.
 */
export function findMarkdownImageRatioBySrc(
    markdown: string,
    renderedSrc: string,
    documentPath: string | null
): number {
    const match = findResizableMarkdownImageSource(markdown, renderedSrc, documentPath);
    if (!match) {
        return 1;
    }
    const altText = extractAltFromMatch(match);
    const ratio = altText ? Number(altText) : NaN;
    if (!Number.isFinite(ratio) || ratio <= 0) {
        return 1;
    }
    return ratio;
}

function extractAltFromMatch(match: ResizableMarkdownImageMatch): string {
    if (match.kind === 'markdown-image') {
        const parsed = match.raw.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        return parsed?.[1]?.trim() ?? '';
    }
    if (match.kind === 'html-image') {
        const altMatch = match.raw.match(/\balt\s*=\s*(["'])(.*?)\1/i);
        return altMatch?.[2]?.trim() ?? '';
    }
    const wikiMatch = match.raw.match(/^!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
    return wikiMatch?.[2]?.trim() ?? '';
}

export function buildPastedMarkdownImagePath(
    documentPath: string,
    mimeType: string,
    takenPaths?: Set<string>
): string {
    const documentDirectory = documentPath.slice(0, documentPath.lastIndexOf('/')) || '/';
    const referencesDirectory = documentDirectory === '/' ? '/references' : `${documentDirectory}/references`;
    const extension = inferPastedImageExtension(mimeType);
    const timestamp = buildPastedImageTimestamp(new Date());
    let attempt = 0;

    while (true) {
        const suffix = attempt === 0 ? '' : ` ${attempt + 1}`;
        const fileName = `Pasted image ${timestamp}${suffix}.${extension}`;
        const candidate = `${referencesDirectory}/${fileName}`;
        if (!takenPaths?.has(candidate)) {
            return candidate;
        }
        attempt += 1;
    }
}

export function buildRelativeMarkdownImageReference(
    fromDocumentPath: string,
    targetImagePath: string,
    alt = ''
): string {
    const href = buildRelativeMarkdownLinkPath(fromDocumentPath, targetImagePath);
    return `![${alt}](${encodeMarkdownTargetPath(href)})`;
}

export function buildMarkdownResourceInsertion(
    fromDocumentPath: string,
    targetResourcePath: string
): { markdown: string; preferBlock: boolean } {
    const href = buildRelativeMarkdownLinkPath(fromDocumentPath, targetResourcePath);
    const encodedHref = encodeMarkdownTargetPath(href);
    const label = markdownImageLabelFromTarget(targetResourcePath);

    if (isRenderableMarkdownImageTarget(targetResourcePath)) {
        return {
            markdown: `![](${encodedHref})`,
            preferBlock: false
        };
    }

    if (isPdfTarget(targetResourcePath)) {
        const codeBlock = createPdfEmbedCodeBlock([href], label);
        return {
            markdown: `\n\n${codeBlock}\n\n`,
            preferBlock: true
        };
    }

    return {
        markdown: `[${label}](${encodedHref})`,
        preferBlock: false
    };
}

export function insertPastedMarkdownImage(
    markdown: string,
    selection: { start: number; end: number },
    imageMarkdown: string
): string {
    const start = Math.max(0, Math.min(selection.start, markdown.length));
    const end = Math.max(start, Math.min(selection.end, markdown.length));
    return `${markdown.slice(0, start)}${imageMarkdown}${markdown.slice(end)}`;
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

function doesRenderedMarkdownSourceMatch(
    sourceTarget: string,
    renderedSrc: string,
    documentPath: string | null
): boolean {
    const normalizedSource = sourceTarget.trim();
    if (!normalizedSource) {
        return false;
    }

    if (normalizedSource === renderedSrc) {
        return true;
    }

    const resolvedSource = resolveMarkdownAssetUrl(normalizedSource, documentPath);
    if (resolvedSource === renderedSrc) {
        return true;
    }

    const renderedAssetPath = safeDocumentAssetPath(renderedSrc);
    if (renderedAssetPath) {
        const sourceAssetPath = safeDocumentAssetPath(resolvedSource);
        if (sourceAssetPath && safeDecodePath(sourceAssetPath) === safeDecodePath(renderedAssetPath)) {
            return true;
        }
    }

    return false;
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

function parseHtmlImageTag(tag: string): { src: string; alt: string; width: number | null } | null {
    const srcMatch = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
    if (!srcMatch) {
        return null;
    }

    const altMatch = tag.match(/\balt\s*=\s*(["'])(.*?)\1/i);
    const widthMatch = tag.match(/\bwidth\s*=\s*(["']?)(\d+)\1/i);
    return {
        src: srcMatch[2]?.trim() ?? '',
        alt: altMatch?.[2]?.trim() ?? '',
        width: widthMatch ? Number(widthMatch[2]) : null
    };
}


function clampMarkdownImageWidth(widthPx: number): number {
    if (!Number.isFinite(widthPx)) {
        return MIN_MARKDOWN_IMAGE_WIDTH_PX;
    }

    return Math.round(Math.min(MAX_MARKDOWN_IMAGE_WIDTH_PX, Math.max(MIN_MARKDOWN_IMAGE_WIDTH_PX, widthPx)));
}

function resolveRenderedMarkdownImageBox(image: HTMLImageElement): { width: number; height: number } {
    const rect = image.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(image);
    const rectWidth = rect.width;
    const rectHeight = rect.height;
    const computedWidth = Number.parseFloat(computedStyle.width);
    const computedHeight = Number.parseFloat(computedStyle.height);
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;

    const width = rectWidth
        || image.clientWidth
        || computedWidth
        || naturalWidth
        || MIN_MARKDOWN_IMAGE_WIDTH_PX;
    const heightFromRendered = rectHeight || image.clientHeight || computedHeight;
    const heightFromAspect = naturalWidth > 0 && naturalHeight > 0
        ? width * (naturalHeight / naturalWidth)
        : 0;
    const height = heightFromRendered || heightFromAspect || width;

    return {
        width,
        height
    };
}

function resolveMarkdownImageResizeWidth(
    startWidth: number,
    startHeight: number,
    startPointerX: number,
    startPointerY: number,
    pointerX: number,
    pointerY: number
): number {
    const dx = pointerX - startPointerX;
    const dy = pointerY - startPointerY;
    const targetWidth = Math.max(MIN_MARKDOWN_IMAGE_WIDTH_PX, startWidth + dx);
    const targetHeight = Math.max(MIN_MARKDOWN_IMAGE_WIDTH_PX, startHeight + dy);
    const horizontalScale = targetWidth / startWidth;
    const verticalScale = startHeight > 0 ? (targetHeight / startHeight) : horizontalScale;
    const nextScale = Math.max(horizontalScale, verticalScale);
    return clampMarkdownImageWidth(startWidth * nextScale);
}

/**
 * Convert any of the supported source forms into the Crepe-canonical markdown
 * image with the ratio stored in the alt slot. We always emit
 * `![${ratio.toFixed(2)}](src)` so subsequent reads (parseMarkdown / hydrate)
 * see the same convention regardless of the original source shape.
 */
function rewriteMarkdownImageMatchRatio(
    match: ResizableMarkdownImageMatch,
    ratio: number
): string | null {
    const ratioAlt = ratio.toFixed(2);

    if (match.kind === 'markdown-image') {
        const parsed = match.raw.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (!parsed) {
            return null;
        }
        const [, , src] = parsed;
        return `![${ratioAlt}](${src.trim()})`;
    }

    if (match.kind === 'html-image') {
        const srcMatch = match.raw.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
        const src = srcMatch?.[2]?.trim();
        if (!src) {
            return null;
        }
        return `![${ratioAlt}](${src})`;
    }

    const parsed = match.raw.match(/^!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
    if (!parsed) {
        return null;
    }
    const [, target] = parsed;
    const normalizedTarget = normalizeMarkdownImageTarget(target);
    return `![${ratioAlt}](${encodeMarkdownTargetPath(normalizedTarget)})`;
}

const MIN_MARKDOWN_IMAGE_RATIO = 0.1;
const MAX_MARKDOWN_IMAGE_RATIO = 10;

function clampMarkdownImageRatio(ratio: number): number {
    if (!Number.isFinite(ratio) || ratio <= 0) {
        return 1;
    }
    const clamped = Math.min(MAX_MARKDOWN_IMAGE_RATIO, Math.max(MIN_MARKDOWN_IMAGE_RATIO, ratio));
    return Number(clamped.toFixed(2));
}

function inferPastedImageExtension(mimeType: string): string {
    const normalized = mimeType.trim().toLowerCase();
    if (normalized === 'image/jpeg') {
        return 'jpg';
    }
    if (normalized === 'image/svg+xml') {
        return 'svg';
    }
    if (normalized.startsWith('image/')) {
        return normalized.slice('image/'.length).replace(/[^a-z0-9]+/g, '') || 'png';
    }
    return 'png';
}

function buildPastedImageTimestamp(date: Date): string {
    const yyyy = String(date.getFullYear()).padStart(4, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const sec = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}${hh}${min}${sec}`;
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
        if (!ctx.isInjected(editorViewCtx)) {
            return;
        }

        callback(ctx.get(editorViewCtx));
    });
}

function attachMarkdownImageEnhancements(
    editor: MarkdownEditor,
    root: HTMLElement,
    documentPath: string | null,
    mode: MarkdownViewerMode,
    onOpenDocumentLink?: (path: string) => void,
    onOpenConversationLink?: (target: MarkdownConversationLinkTarget) => void,
    onResizeMarkdownImage?: (payload: { src: string; ratio: number }) => void,
    getMarkdownSource?: () => string
) {
    if (mode !== 'viewer') {
        return;
    }

    const controller = new AbortController();
    let pdfEmbedTimer: number | null = null;
    let imageEnhancementTimer: number | null = null;

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

    const scheduleImageEnhancements = () => {
        if (controller.signal.aborted) {
            return;
        }

        if (imageEnhancementTimer !== null) {
            window.clearTimeout(imageEnhancementTimer);
        }

        imageEnhancementTimer = window.setTimeout(() => {
            imageEnhancementTimer = null;
            hydrateResizableMarkdownImages(root, documentPath, onResizeMarkdownImage, getMarkdownSource);
        }, 0);
    };

    queueMicrotask(() => {
        schedulePdfEmbedHydration();
        scheduleImageEnhancements();
    });

    const observer = new MutationObserver(() => {
        schedulePdfEmbedHydration();
        scheduleImageEnhancements();
    });
    // Watch alt because Crepe ImageBlock encodes the resize ratio there;
    // we re-run hydrate so the rendered <img> width tracks the latest ratio.
    observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['alt', 'src']
    });

    controller.signal.addEventListener('abort', () => {
        observer.disconnect();
        if (pdfEmbedTimer !== null) {
            window.clearTimeout(pdfEmbedTimer);
            pdfEmbedTimer = null;
        }
        if (imageEnhancementTimer !== null) {
            window.clearTimeout(imageEnhancementTimer);
            imageEnhancementTimer = null;
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

        const conversationTarget = resolveMarkdownConversationLinkTarget(href);
        if (conversationTarget && onOpenConversationLink) {
            event.preventDefault();
            event.stopPropagation();
            onOpenConversationLink(conversationTarget);
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

/**
 * Resolve the natural pixel width to use as the ratio=1 baseline.
 *
 * Heuristic (Option C): macOS Retina screenshots are saved in device pixels,
 * so naturalWidth can be 2× the CSS pixel size the user actually sees.
 * If naturalWidth > hostWidth but naturalWidth/dpr ≤ hostWidth, the image is
 * almost certainly a high-DPR screenshot — use the DPR-corrected value.
 * Otherwise constrain to min(naturalWidth, hostWidth) so large images never
 * start bigger than the column.  Falls back to the rendered rect width while
 * the image is still loading.
 */
function resolveImageBaseWidth(image: HTMLImageElement): number {
    const naturalWidth = image.naturalWidth;
    if (naturalWidth > 0) {
        const hostEl =
            image.closest<HTMLElement>('.milkdown-image-block') ??
            image.closest<HTMLElement>('.milkdown');
        const hostWidth = hostEl ? hostEl.getBoundingClientRect().width : 0;
        if (hostWidth > 0) {
            const dpr = window.devicePixelRatio || 1;
            if (naturalWidth > hostWidth && naturalWidth / dpr <= hostWidth) {
                // High-DPR screenshot: correct for device pixel ratio
                return Math.round(naturalWidth / dpr);
            }
            return Math.round(Math.min(naturalWidth, hostWidth));
        }
        return naturalWidth;
    }
    const rect = image.getBoundingClientRect();
    if (rect.width > 0) {
        return rect.width;
    }
    return MIN_MARKDOWN_IMAGE_WIDTH_PX;
}

/**
 * Apply a Crepe-compatible ratio to the image. We override Crepe's
 * style.height (which it sets on every load/update) with `auto` and drive the
 * size through width so that the aspect ratio is preserved.
 */
function applyImageRatio(image: HTMLImageElement, ratio: number): void {
    const baseWidth = resolveImageBaseWidth(image);
    const widthPx = clampMarkdownImageWidth(baseWidth * ratio);
    const nextStyleWidth = `${widthPx}px`;
    if (image.style.width !== nextStyleWidth) {
        image.style.width = nextStyleWidth;
    }
    if (image.style.height !== 'auto') {
        image.style.height = 'auto';
    }
    if (image.style.maxWidth !== 'none') {
        image.style.maxWidth = 'none';
    }
}

/**
 * Read the markdown source (single source of truth) and apply the ratio it
 * encodes for the image identified by `src` (Crepe stores ratio as the alt
 * field of the markdown image; legacy HTML <img alt="N"> is also accepted).
 * If we cannot find the image or the ratio is invalid, default to 1.
 */
function applyRatioFromSource(
    image: HTMLImageElement,
    src: string,
    documentPath: string | null,
    getMarkdownSource: (() => string) | undefined
): void {
    const markdown = getMarkdownSource?.() ?? '';
    const ratio = markdown
        ? findMarkdownImageRatioBySrc(markdown, src, documentPath)
        : 1;
    applyImageRatio(image, ratio);
}

function hydrateResizableMarkdownImages(
    root: HTMLElement,
    documentPath: string | null,
    onResizeMarkdownImage?: (payload: { src: string; ratio: number }) => void,
    getMarkdownSource?: () => string
): void {
    const images = root.querySelectorAll<HTMLImageElement>('.milkdown img');
    images.forEach((image) => {
        const src = image.getAttribute('src')?.trim() ?? '';
        if (!src || /^data:/i.test(src)) {
            return;
        }

        const assetPath = safeDocumentAssetPath(src);
        const isRemoteOnly = /^https?:\/\//i.test(src) && !assetPath;
        if (isRemoteOnly) {
            return;
        }

        // Already wrapped: only refresh the ratio. Crepe re-applies
        // style.height on every NodeView update, so we have to re-assert
        // our width-based sizing each time hydrate runs.
        if (image.closest('.markdown-image-resize-frame')) {
            const refresh = () => applyRatioFromSource(image, src, documentPath, getMarkdownSource);
            if (image.complete && image.naturalWidth > 0) {
                refresh();
            } else {
                image.addEventListener('load', refresh, { once: true });
                refresh();
            }
            return;
        }

        const parent = image.parentElement;
        if (!parent) {
            return;
        }

        const applyOnce = () => applyRatioFromSource(image, src, documentPath, getMarkdownSource);
        if (image.complete && image.naturalWidth > 0) {
            applyOnce();
        } else {
            image.addEventListener('load', applyOnce, { once: true });
        }

        const frame = document.createElement('span');
        frame.className = 'markdown-image-resize-frame';
        frame.dataset.testid = 'markdown-image-resize-frame';
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'markdown-image-resize-handle';
        handle.dataset.testid = 'markdown-image-resize-handle';
        handle.setAttribute('aria-label', 'Resize image');

        parent.insertBefore(frame, image);
        frame.append(image);
        frame.append(handle);

        handle.addEventListener('pointerdown', (event) => {
            if (!(event.currentTarget instanceof HTMLElement)) {
                return;
            }

            event.preventDefault();
            const pointerId = event.pointerId;
            handle.setPointerCapture(pointerId);
            const { width: startWidth, height: startHeight } = resolveRenderedMarkdownImageBox(image);
            const baseWidth = resolveImageBaseWidth(image);
            const startPointerX = event.clientX;
            const startPointerY = event.clientY;
            let latestWidth = clampMarkdownImageWidth(startWidth);

            frame.classList.add('markdown-image-resize-frame--active');

            const onMove = (moveEvent: PointerEvent) => {
                const nextWidth = resolveMarkdownImageResizeWidth(
                    startWidth,
                    startHeight,
                    startPointerX,
                    startPointerY,
                    moveEvent.clientX,
                    moveEvent.clientY
                );
                latestWidth = nextWidth;
                image.style.width = `${nextWidth}px`;
                image.style.height = 'auto';
                image.style.maxWidth = 'none';
            };

            const stop = () => {
                handle.releasePointerCapture(pointerId);
                frame.classList.remove('markdown-image-resize-frame--active');
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', stop);
                handle.removeEventListener('pointercancel', stop);
                const ratio = baseWidth > 0
                    ? Number((latestWidth / baseWidth).toFixed(2))
                    : 1;
                onResizeMarkdownImage?.({
                    src,
                    ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : 1
                });
            };

            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', stop);
            handle.addEventListener('pointercancel', stop);
        });

        if (documentPath) {
            frame.dataset.documentPath = documentPath;
        }
    });
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
