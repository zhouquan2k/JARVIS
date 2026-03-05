<template>
  <div class="markdown-content" v-html="renderedHtml" />
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  source: string;
}>();

const CODE_TOKEN_PREFIX = '__MD_CODE_BLOCK_';

const renderedHtml = computed(() => renderMarkdown(props.source));

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

function renderMarkdown(input: string): string {
  if (!input) return '';

  const codeBlocks: string[] = [];
  const normalized = input.replace(/\r\n/g, '\n');
  const withCodeTokens = normalized.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_match, language, code) => {
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

  for (const line of lines) {
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
  return htmlParts.join('\n');
}
</script>

<style scoped>
.markdown-content {
  color: #0f172a;
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
.markdown-content :deep(h6) {
  margin: 0 0 8px;
}

.markdown-content :deep(p:last-child),
.markdown-content :deep(ul:last-child),
.markdown-content :deep(ol:last-child),
.markdown-content :deep(blockquote:last-child),
.markdown-content :deep(pre:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 20px;
}

.markdown-content :deep(code) {
  background: #f1f5f9;
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 0.92em;
}

.markdown-content :deep(pre) {
  background: #0f172a;
  color: #e2e8f0;
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
  color: #2563eb;
  text-decoration: underline;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid #bfdbfe;
  padding-left: 10px;
  color: #475569;
}
</style>
