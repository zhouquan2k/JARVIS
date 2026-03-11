<template>
  <div class="markdown-wrapper">
    <div class="markdown-content" v-html="renderedHtml" />
    <MessageAnnotationLayer :annotations="nonCiteAnnotations" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MessageAnnotation } from '@packages/core/src';
import MessageAnnotationLayer from './MessageAnnotationLayer.vue';

const props = defineProps<{
  source: string;
  annotations?: MessageAnnotation[];
}>();

const CODE_TOKEN_PREFIX = '__MD_CODE_BLOCK_';
const CITE_TOKEN_PREFIX = '__MD_CITE_';

const citeAnnotations = computed(() => (
  props.annotations || []
).filter((annotation): annotation is Extract<MessageAnnotation, { kind: 'cite' }> => annotation.kind === 'cite'));

const nonCiteAnnotations = computed(() => (
  props.annotations || []
).filter((annotation) => annotation.kind !== 'cite'));

const renderedHtml = computed(() => renderMarkdown(props.source, citeAnnotations.value));

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(raw: string): string {
  let text = escapeHtml(raw);
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return text;
}

function buildCiteHtml(label: string, annotation: Extract<MessageAnnotation, { kind: 'cite' }>): string {
  const safeLabel = escapeHtml(label || annotation.payload.label);
  const safeTitle = escapeHtml(annotation.payload.title || annotation.payload.refId);
  const safeSnippet = annotation.payload.snippet ? escapeHtml(annotation.payload.snippet) : '';
  const safeUrl = annotation.payload.url ? escapeHtml(annotation.payload.url) : '';
  const popover = [
    '<span class="inline-cite-popover">',
    `<strong>${safeTitle}</strong>`,
    safeSnippet ? `<span>${safeSnippet}</span>` : '',
    safeUrl ? `<span>${safeUrl}</span>` : '',
    '</span>'
  ].join('');

  if (!annotation.payload.url) {
    return `<span class="inline-cite inline-cite-static">${safeLabel}${popover}</span>`;
  }

  return [
    `<a class="inline-cite" href="${safeUrl}" target="_blank" rel="noreferrer noopener">`,
    safeLabel,
    popover,
    '</a>'
  ].join('');
}

function injectCitationTokens(
  input: string,
  annotations: Array<Extract<MessageAnnotation, { kind: 'cite' }>>
): { text: string; cites: string[] } {
  if (annotations.length === 0) {
    return { text: input, cites: [] };
  }

  const sorted = [...annotations]
    .filter((annotation) => annotation.range.start >= 0 && annotation.range.end >= annotation.range.start)
    .sort((a, b) => a.range.start - b.range.start);

  const cites: string[] = [];
  let cursor = 0;
  let text = '';

  for (const annotation of sorted) {
    const start = Math.min(annotation.range.start, input.length);
    const end = Math.min(annotation.range.end, input.length);
    if (start < cursor || start >= end) {
      continue;
    }

    text += input.slice(cursor, start);
    const token = `${CITE_TOKEN_PREFIX}${cites.length}__`;
    const label = input.slice(start, end) || annotation.payload.label;
    cites.push(buildCiteHtml(label, annotation));
    text += token;
    cursor = end;
  }

  text += input.slice(cursor);
  return { text, cites };
}

function restoreCitations(html: string, cites: string[]): string {
  return html.replace(new RegExp(`${CITE_TOKEN_PREFIX}(\\d+)__`, 'g'), (_match, index) => cites[Number(index)] ?? '');
}

function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) {
    return null;
  }

  let normalized = trimmed;
  if (normalized.startsWith('|')) {
    normalized = normalized.slice(1);
  }
  if (normalized.endsWith('|')) {
    normalized = normalized.slice(0, -1);
  }

  const cells = normalized.split('|').map((cell) => cell.trim());
  if (cells.length < 2) {
    return null;
  }
  return cells;
}

function isTableSeparatorRow(line: string, columnCount: number): boolean {
  const cells = parseTableRow(line);
  if (!cells || cells.length !== columnCount) {
    return false;
  }

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function renderMarkdown(
  input: string,
  annotations: Array<Extract<MessageAnnotation, { kind: 'cite' }>> = []
): string {
  if (!input) return '';

  const codeBlocks: string[] = [];
  const normalized = input.replace(/\r\n/g, '\n');
  const withCitationTokens = injectCitationTokens(normalized, annotations);
  const withCodeTokens = withCitationTokens.text.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_match, language, code) => {
    const token = `${CODE_TOKEN_PREFIX}${codeBlocks.length}__`;
    const langClass = language ? ` class="language-${escapeHtml(String(language))}"` : '';
    codeBlocks.push(`<pre><code${langClass}>${escapeHtml(String(code).replace(/\n$/, ''))}</code></pre>`);
    return `\n${token}\n`;
  });

  const lines = withCodeTokens.split('\n');
  const htmlParts: string[] = [];
  let inUnorderedList = false;
  let inOrderedList = false;

  const closeLists = () => {
    if (inUnorderedList) {
      htmlParts.push('</ul>');
      inUnorderedList = false;
    }
    if (inOrderedList) {
      htmlParts.push('</ol>');
      inOrderedList = false;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      closeLists();
      continue;
    }

    const codeTokenMatch = trimmed.match(new RegExp(`^${CODE_TOKEN_PREFIX}(\\d+)__$`));
    if (codeTokenMatch) {
      closeLists();
      const tokenIndex = Number(codeTokenMatch[1]);
      htmlParts.push(codeBlocks[tokenIndex] ?? '');
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      htmlParts.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^([-*_]\s*){3,}$/.test(trimmed)) {
      closeLists();
      htmlParts.push('<hr />');
      continue;
    }

    const headerCells = parseTableRow(trimmed);
    const separatorLine = lines[index + 1]?.trim() || '';
    if (headerCells && isTableSeparatorRow(separatorLine, headerCells.length)) {
      closeLists();
      const bodyRows: string[][] = [];
      index += 2;

      while (index < lines.length) {
        const rowLine = lines[index].trim();
        if (!rowLine) {
          index -= 1;
          break;
        }
        const rowCells = parseTableRow(rowLine);
        if (!rowCells || rowCells.length !== headerCells.length) {
          index -= 1;
          break;
        }
        bodyRows.push(rowCells);
        index += 1;
      }

      const thead = `<thead><tr>${headerCells.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`;
      const tbody = bodyRows.length > 0
        ? `<tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`
        : '';
      htmlParts.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.+)$/);
    if (quoteMatch) {
      closeLists();
      htmlParts.push(`<blockquote>${renderInline(quoteMatch[1])}</blockquote>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      if (inOrderedList) {
        htmlParts.push('</ol>');
        inOrderedList = false;
      }
      if (!inUnorderedList) {
        htmlParts.push('<ul>');
        inUnorderedList = true;
      }
      htmlParts.push(`<li>${renderInline(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      if (inUnorderedList) {
        htmlParts.push('</ul>');
        inUnorderedList = false;
      }
      if (!inOrderedList) {
        htmlParts.push('<ol>');
        inOrderedList = true;
      }
      htmlParts.push(`<li>${renderInline(orderedMatch[1])}</li>`);
      continue;
    }

    closeLists();
    htmlParts.push(`<p>${renderInline(trimmed)}</p>`);
  }

  closeLists();
  return restoreCitations(htmlParts.join('\n'), withCitationTokens.cites);
}
</script>

<style scoped>
.markdown-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.markdown-content {
  color: var(--cp-text-primary);
  line-height: 1.55;
}

.markdown-content :deep(p),
.markdown-content :deep(ul),
.markdown-content :deep(ol),
.markdown-content :deep(blockquote),
.markdown-content :deep(pre),
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6),
.markdown-content :deep(table),
.markdown-content :deep(hr) {
  margin: 0 0 8px;
}

.markdown-content :deep(p:last-child),
.markdown-content :deep(ul:last-child),
.markdown-content :deep(ol:last-child),
.markdown-content :deep(blockquote:last-child),
.markdown-content :deep(pre:last-child),
.markdown-content :deep(table:last-child),
.markdown-content :deep(hr:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 20px;
}

.markdown-content :deep(code) {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 0.92em;
}

.markdown-content :deep(pre) {
  background: rgba(255, 255, 255, 0.05);
  color: var(--cp-text-primary);
  border-radius: 8px;
  padding: 10px;
  overflow: auto;
}

.markdown-content :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}

.markdown-content :deep(a) {
  color: #93c5fd;
  text-decoration: underline;
}

.markdown-content :deep(.inline-cite) {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 2px;
  padding: 0 1px;
  border-radius: 8px;
  color: #bfdbfe;
  text-decoration: none;
}

.markdown-content :deep(.inline-cite:hover),
.markdown-content :deep(.inline-cite:focus-visible) {
  background: rgba(96, 165, 250, 0.12);
  color: #dbeafe;
}

.markdown-content :deep(.inline-cite-static) {
  cursor: default;
}

.markdown-content :deep(.inline-cite-popover) {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 3;
  width: 260px;
  display: none;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(7, 10, 18, 0.96);
  color: var(--cp-text-primary);
  text-align: left;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.35);
}

.markdown-content :deep(.inline-cite-popover strong),
.markdown-content :deep(.inline-cite-popover span) {
  display: block;
}

.markdown-content :deep(.inline-cite:hover .inline-cite-popover),
.markdown-content :deep(.inline-cite:focus-visible .inline-cite-popover),
.markdown-content :deep(.inline-cite-static:hover .inline-cite-popover) {
  display: block;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid rgba(147, 197, 253, 0.6);
  padding-left: 10px;
  color: var(--cp-text-muted);
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--cp-border);
  border-radius: 10px;
  overflow: hidden;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border-bottom: 1px solid var(--cp-border-subtle);
  border-right: 1px solid var(--cp-border-subtle);
  padding: 7px 10px;
  text-align: left;
  vertical-align: top;
}

.markdown-content :deep(th:last-child),
.markdown-content :deep(td:last-child) {
  border-right: none;
}

.markdown-content :deep(thead th) {
  color: #dbeafe;
  background: rgba(96, 165, 250, 0.08);
  font-weight: 600;
}

.markdown-content :deep(tbody tr:last-child td) {
  border-bottom: none;
}

.markdown-content :deep(hr) {
  border: none;
  height: 1px;
  background: var(--cp-border);
}
</style>
