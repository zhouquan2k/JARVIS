type GeminiMessageRole = 'user' | 'assistant';
type DomNodeLike = {
    nodeType: number;
    textContent?: string | null;
    childNodes?: DomNodeLike[];
    parentElement?: DomElementLike | null;
};
type DomElementLike = DomNodeLike & {
    tagName: string;
    getAttribute(name: string): string | null;
    hasAttribute(name: string): boolean;
    children?: DomElementLike[];
    querySelector(selector: string): DomElementLike | null;
    querySelectorAll(selector: string): DomElementLike[];
    classList?: Iterable<string>;
};

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const BLOCK_TAGS = new Set([
    'P',
    'DIV',
    'SECTION',
    'ARTICLE',
    'HEADER',
    'MAIN',
    'FOOTER',
    'UL',
    'OL',
    'LI',
    'PRE',
    'BLOCKQUOTE',
    'TABLE',
    'TR',
    'THEAD',
    'TBODY',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6'
]);

const SKIP_TAGS = new Set([
    'BUTTON',
    'SVG',
    'PATH',
    'STYLE',
    'SCRIPT',
    'NOSCRIPT',
    'MAT-ICON'
]);

const USER_PREFIX_PATTERN = /^(你说|你說|你问|你問|you said|you asked)\s*[:：]?\s*/i;
const ASSISTANT_PREFIX_PATTERN = /^(gemini said|gemini(?:\s*(说|說|答|回复|回覆|回答|回應))?)\s*[:：-]?\s*/i;

function normalizeLineEndings(value: string): string {
    return value
        .replace(/\r\n/g, '\n')
        .replace(/\u00a0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
}

function collapseInlineWhitespace(value: string): string {
    return value.replace(/[^\S\n]+/g, ' ');
}

function normalizeMarkdownishText(value: string): string {
    return normalizeLineEndings(value)
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeSpeakerPrefixCandidate(value: string): string {
    return value
        .trim()
        .replace(/^[>#*\-+`_\s\d.)]+/, '')
        .replace(/[*_`]+/g, '')
        .trim();
}

function shouldSkipElement(element: DomElementLike): boolean {
    if (SKIP_TAGS.has(element.tagName)) {
        return true;
    }

    if (element.getAttribute('aria-hidden') === 'true' || element.hasAttribute('hidden')) {
        return true;
    }

    return false;
}

function isElementNode(node: DomNodeLike | null | undefined): node is DomElementLike {
    return !!node && node.nodeType === ELEMENT_NODE && typeof (node as Partial<DomElementLike>).tagName === 'string';
}

function childNodesOf(node: DomNodeLike): DomNodeLike[] {
    return Array.from(node.childNodes || []);
}

function serializeChildren(node: DomNodeLike, listDepth = 0): string {
    return childNodesOf(node)
        .map((child) => serializeNode(child, listDepth))
        .join('');
}

function childElementsOf(element: DomElementLike): DomElementLike[] {
    return Array.from(element.children || []);
}

function serializeList(element: DomElementLike, ordered: boolean, listDepth: number): string {
    const items = childElementsOf(element)
        .filter((child) => child.tagName === 'LI')
        .map((child, index) => {
            const prefix = ordered ? `${index + 1}. ` : `${'  '.repeat(listDepth)}- `;
            const content = normalizeMarkdownishText(serializeChildren(child, listDepth + 1));
            if (!content) {
                return '';
            }

            const [firstLine, ...restLines] = content.split('\n');
            const indentedRest = restLines.map((line) => `${'  '.repeat(listDepth + 1)}${line}`).join('\n');
            return `${prefix}${firstLine}${indentedRest ? `\n${indentedRest}` : ''}`;
        })
        .filter(Boolean);

    return items.length > 0 ? `${items.join('\n')}\n\n` : '';
}

function serializeTable(element: DomElementLike): string {
    const rows = Array.from(element.querySelectorAll('tr'))
        .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => normalizeMarkdownishText(serializeChildren(cell))))
        .filter((cells) => cells.length > 0);

    if (rows.length === 0) {
        return '';
    }

    const [header, ...body] = rows;
    const separator = header.map(() => '---');
    const lines = [
        `| ${header.join(' | ')} |`,
        `| ${separator.join(' | ')} |`,
        ...body.map((cells) => `| ${cells.join(' | ')} |`)
    ];

    return `${lines.join('\n')}\n\n`;
}

function serializeNode(node: DomNodeLike, listDepth = 0): string {
    if (node.nodeType === TEXT_NODE) {
        return collapseInlineWhitespace(node.textContent || '');
    }

    if (!isElementNode(node)) {
        return '';
    }

    if (shouldSkipElement(node)) {
        return '';
    }

    const tagName = node.tagName;

    if (tagName === 'BR') {
        return '\n';
    }

    if (tagName === 'PRE') {
        const codeElement = node.querySelector('code');
        const languageClass = Array.from(codeElement?.classList || []).find((value) => value.startsWith('language-'));
        const language = languageClass ? languageClass.replace(/^language-/, '') : '';
        const code = normalizeLineEndings(codeElement?.textContent || node.textContent || '').trimEnd();
        return code ? `\n\`\`\`${language}\n${code}\n\`\`\`\n\n` : '';
    }

    if (tagName === 'CODE') {
        return node.parentElement?.tagName === 'PRE'
            ? ''
            : `\`${normalizeMarkdownishText(node.textContent || '')}\``;
    }

    if (tagName === 'STRONG' || tagName === 'B') {
        const inner = serializeChildren(node, listDepth);
        return inner.trim() ? `**${inner}**` : inner;
    }

    if (tagName === 'EM' || tagName === 'I') {
        const inner = serializeChildren(node, listDepth);
        return inner.trim() ? `*${inner}*` : inner;
    }

    if (tagName === 'A') {
        const inner = serializeChildren(node, listDepth);
        const href = node.getAttribute('href');
        return href && inner.trim() ? `[${inner}](${href})` : inner;
    }

    if (tagName === 'UL') {
        return serializeList(node, false, listDepth);
    }

    if (tagName === 'OL') {
        return serializeList(node, true, listDepth);
    }

    if (tagName === 'BLOCKQUOTE') {
        const content = normalizeMarkdownishText(serializeChildren(node, listDepth));
        if (!content) {
            return '';
        }

        return `${content.split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
    }

    if (tagName === 'TABLE') {
        return serializeTable(node);
    }

    if (/^H[1-6]$/.test(tagName)) {
        const level = Number(tagName.slice(1));
        const content = normalizeMarkdownishText(serializeChildren(node, listDepth));
        return content ? `${'#'.repeat(level)} ${content}\n\n` : '';
    }

    const content = serializeChildren(node, listDepth);
    if (!BLOCK_TAGS.has(tagName)) {
        return content;
    }

    const normalized = normalizeMarkdownishText(content);
    return normalized ? `${normalized}\n\n` : '';
}

export function cleanupGeminiUserText(value: string): string {
    let text = normalizeMarkdownishText(value);
    const lines = text.split('\n');

    while (lines.length > 0 && USER_PREFIX_PATTERN.test(lines[0])) {
        const firstLine = lines.shift() || '';
        const stripped = firstLine.replace(USER_PREFIX_PATTERN, '').trim();
        if (stripped) {
            lines.unshift(stripped);
            break;
        }
    }

    text = lines.join('\n').trim();
    return text.replace(USER_PREFIX_PATTERN, '').trim();
}

export function cleanupGeminiAssistantText(value: string): string {
    let text = normalizeMarkdownishText(value);
    const lines = text.split('\n');
    let scanIndex = 0;

    while (scanIndex < Math.min(lines.length, 5)) {
        const currentLine = lines[scanIndex]?.trim() || '';
        if (!currentLine) {
            scanIndex += 1;
            continue;
        }

        const normalizedCandidate = normalizeSpeakerPrefixCandidate(currentLine);
        if (!normalizedCandidate || !ASSISTANT_PREFIX_PATTERN.test(normalizedCandidate)) {
            break;
        }

        const stripped = normalizedCandidate.replace(ASSISTANT_PREFIX_PATTERN, '').trim();
        lines.splice(scanIndex, 1);
        if (stripped) {
            lines.splice(scanIndex, 0, stripped);
            break;
        }
    }

    text = normalizeMarkdownishText(lines.join('\n'));
    return text;
}

/**
 * 通用 HTML→Markdown 序列化：把一个渲染后的 DOM 子树还原为 markdown 文本。
 * 与 `extractGeminiMessageText` 共用同一套 `serializeNode` 规则（标题/列表/代码块/
 * 表格/引用 + 行内 strong/em/a/code），但不含 Gemini 专有的发言人前缀清理，
 * 供 ChatGPT / Claude 等其它 DOM provider 复用，避免再退回到丢格式的 innerText。
 */
export function serializeDomToMarkdown(element: Element): string {
    return normalizeMarkdownishText(serializeNode(element as unknown as DomNodeLike));
}

export function extractGeminiMessageText(element: Element, role: GeminiMessageRole): string {
    const serialized = serializeDomToMarkdown(element);
    return role === 'user' ? cleanupGeminiUserText(serialized) : cleanupGeminiAssistantText(serialized);
}
