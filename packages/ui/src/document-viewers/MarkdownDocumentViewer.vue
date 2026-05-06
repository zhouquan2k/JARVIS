<template>
  <section class="markdown-viewer" data-testid="markdown-viewer">
    <div class="editor-scroll-shell" data-testid="document-editor-scroll-shell">
      <div
        v-if="!isMarkdownEditMode"
        ref="editorRoot"
        class="editor-input"
        :class="{
          'editor-input--markdown-viewer': isMarkdownDocument && markdownViewerMode === 'viewer',
          'editor-input--markdown-edit': isMarkdownDocument && markdownViewerMode === 'edit'
        }"
        data-testid="document-editor-surface"
        :style="zoomStyle"
      />
      <textarea
        v-else
        class="editor-input editor-input--markdown-source"
        data-testid="document-editor-input"
        :value="modelValue"
        wrap="soft"
        :style="zoomStyle"
        spellcheck="false"
        @input="onMarkdownSourceInput"
      />
    </div>

    <section
      v-if="activePath && latestFileChange"
      class="file-change-panel"
      data-testid="document-file-change"
    >
      <div class="file-change-header">
        <div class="file-change-meta">
          <strong>{{ t('shared.lastAgentRewrite') }}</strong>
          <span>{{ latestFileChange.path }}</span>
        </div>
        <div class="file-change-actions">
          <button
            type="button"
            class="change-action-button"
            data-testid="document-file-change-undo"
            :disabled="!canUndo"
            @click="emit('undo-change')"
          >
            {{ t('shared.undo') }}
          </button>
          <button
            type="button"
            class="change-action-button"
            data-testid="document-file-change-redo"
            :disabled="!canRedo"
            @click="emit('redo-change')"
          >
            {{ t('shared.redo') }}
          </button>
        </div>
      </div>
      <div class="file-change-diff" data-testid="document-file-diff">
        <div
          v-for="(entry, index) in diffEntries"
          :key="`${index}-${entry.kind}-${entry.oldLineNumber ?? 'n'}-${entry.newLineNumber ?? 'n'}`"
          class="diff-row"
          :class="`diff-row--${entry.kind}`"
          data-testid="document-file-diff-row"
        >
          <span class="diff-line">{{ entry.oldLineNumber ?? '' }}</span>
          <span class="diff-line">{{ entry.newLineNumber ?? '' }}</span>
          <code class="diff-text">{{ entry.text || ' ' }}</code>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import '@milkdown/crepe/theme/common/prosemirror.css';
import '@milkdown/crepe/theme/common/table.css';
import '@milkdown/crepe/theme/nord-dark.css';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { ContextDocument } from '@packages/core/src';
import { useWorkspaceI18n } from '../i18n';
import {
  createMarkdownEditor,
  getMarkdownEditorSearchMatchCount,
  destroyMarkdownEditor,
  normalizeMarkdownViewerContent,
  readMarkdownDocument,
  replaceMarkdownDocument,
  scrollToMarkdownEditorSearchMatch,
  setMarkdownEditorActiveSearchMatchIndex,
  setMarkdownEditorSearchQuery,
  type MarkdownEditor,
  type MarkdownViewerMode
} from '../utils/markdownDocument';
import type { FileChangeRecord, LineDiffEntry } from '../services/FileChangeService';

export interface MarkdownDocumentViewerProps {
  activePath: string | null;
  activeDocument: ContextDocument | null;
  modelValue: string;
  markdownViewerMode: MarkdownViewerMode;
  latestFileChange: FileChangeRecord | null;
  diffEntries: LineDiffEntry[];
  canUndo: boolean;
  canRedo: boolean;
  middlePaneZoom?: number;
}

const props = withDefaults(defineProps<MarkdownDocumentViewerProps>(), {
  middlePaneZoom: 1
});
const { t } = useWorkspaceI18n();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'undo-change'): void;
  (event: 'redo-change'): void;
  (event: 'open-document-link', path: string): void;
}>();

const isMarkdownDocument = computed(() => props.activeDocument?.mimeType === 'text/markdown');
const isMarkdownEditMode = computed(() => isMarkdownDocument.value && props.markdownViewerMode === 'edit');
const zoomStyle = computed(() => ({
  transform: `scale(${props.middlePaneZoom})`
}));
const editorRoot = ref<HTMLElement | null>(null);
const searchQuery = ref('');
const activeSearchMatchIndex = ref(0);

let editor: MarkdownEditor | null = null;
let creationToken = 0;
let isApplyingExternalSync = false;
let lastKnownMarkdown = '';
let activeEditorMode: MarkdownViewerMode | null = null;

watch(() => [
  props.activePath,
  props.activeDocument?.path ?? null,
  props.activeDocument?.mimeType,
  props.modelValue,
  props.markdownViewerMode
] as const, async ([activePath, documentPath, mimeType, modelValue], previousValue) => {
  const previousPath = previousValue?.[0] ?? null;
  const previousDocumentPath = previousValue?.[1] ?? null;
  const previousMimeType = previousValue?.[2] ?? null;
  if (!activePath) {
    await teardownEditor();
    return;
  }

  const desiredMode: MarkdownViewerMode = mimeType === 'text/markdown'
    ? props.markdownViewerMode
    : 'edit';

  await nextTick();
  if (activeEditorMode && activeEditorMode !== desiredMode) {
    const currentMarkdown = activeEditorMode === 'viewer'
      ? props.modelValue
      : editor ? readMarkdownDocument(editor) : lastKnownMarkdown || modelValue;
    lastKnownMarkdown = currentMarkdown;
    if (activeEditorMode === 'viewer' && currentMarkdown !== props.modelValue) {
      emit('update:modelValue', currentMarkdown);
    }
    await teardownEditor();
    activeEditorMode = desiredMode;
    if (desiredMode === 'edit') {
      lastKnownMarkdown = currentMarkdown;
      return;
    }
    await nextTick();
    await ensureEditor(currentMarkdown);
    return;
  }

  if (isMarkdownEditMode.value) {
    await teardownEditor();
    activeEditorMode = 'edit';
    lastKnownMarkdown = modelValue;
    return;
  }

  if (editor && documentPath !== previousDocumentPath && requiresMarkdownDocumentPathRebind(modelValue)) {
    await teardownEditor();
  }

  await ensureEditor(modelValue);

  if (!editor) {
    return;
  }

  if (activePath !== previousPath || mimeType !== previousMimeType || modelValue !== lastKnownMarkdown) {
    syncEditorContent(modelValue);
  }
}, { immediate: true, flush: 'post' });

onBeforeUnmount(async () => {
  await teardownEditor();
});

async function ensureEditor(content: string) {
  if (editor || !editorRoot.value) {
    return;
  }

  const token = ++creationToken;
  const renderedContent = isMarkdownDocument.value && props.markdownViewerMode === 'viewer'
    ? normalizeMarkdownViewerContent(content)
    : content;
  const instance = await createMarkdownEditor({
    root: editorRoot.value,
    content: renderedContent,
    mode: isMarkdownDocument.value ? props.markdownViewerMode : 'edit',
    documentPath: props.activeDocument?.path ?? props.activePath,
    onOpenDocumentLink(path) {
      emit('open-document-link', path);
    },
    onChange(markdown) {
      lastKnownMarkdown = markdown;
      if (isApplyingExternalSync || !props.activePath) {
        return;
      }

      if (isMarkdownDocument.value && props.markdownViewerMode === 'viewer'
          && markdown === normalizeMarkdownViewerContent(props.modelValue)) {
        return;
      }

      emit('update:modelValue', markdown);
    }
  });

  if (token !== creationToken || !props.activePath) {
    await destroyMarkdownEditor(instance);
    return;
  }

  editor = instance;
  activeEditorMode = isMarkdownDocument.value ? props.markdownViewerMode : 'edit';
  lastKnownMarkdown = content;
  applyReadonlyCodeBlockLabels(renderedContent);
  applySearchHighlights();
}

function syncEditorContent(content: string) {
  if (!editor || content === lastKnownMarkdown) {
    return;
  }

  isApplyingExternalSync = true;
  const renderedContent = isMarkdownDocument.value && props.markdownViewerMode === 'viewer'
    ? normalizeMarkdownViewerContent(content)
    : content;
  replaceMarkdownDocument(editor, renderedContent);
  lastKnownMarkdown = content;
  applyReadonlyCodeBlockLabels(renderedContent);
  applySearchHighlights();
  queueMicrotask(() => {
    isApplyingExternalSync = false;
  });
}

function onMarkdownSourceInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) {
    return;
  }

  lastKnownMarkdown = target.value;
  emit('update:modelValue', target.value);
}

function applyReadonlyCodeBlockLabels(content: string) {
  if (!editorRoot.value) {
    return;
  }

  const sync = () => {
    if (!editorRoot.value) {
      return;
    }

    const codeBlocks = editorRoot.value.querySelectorAll<HTMLElement>('.milkdown .milkdown-code-block');
    if (!isMarkdownDocument.value || props.markdownViewerMode !== 'edit') {
      codeBlocks.forEach((codeBlock) => {
        delete codeBlock.dataset.readonlyLanguage;
      });
      return;
    }

    const labels = extractMarkdownCodeBlockLabels(content);
    codeBlocks.forEach((codeBlock, index) => {
      codeBlock.dataset.readonlyLanguage = labels[index] ?? 'text';
    });
  };

  queueMicrotask(sync);
  window.setTimeout(sync, 50);
}

function applySearchHighlights() {
  if (!editor) {
    return;
  }

  setMarkdownEditorSearchQuery(editor, searchQuery.value);
  if (searchQuery.value) {
    setMarkdownEditorActiveSearchMatchIndex(editor, activeSearchMatchIndex.value);
  }
}

function setSearchQuery(query: string) {
  searchQuery.value = query;
  activeSearchMatchIndex.value = 0;
  nextTick(applySearchHighlights);
}

function setActiveSearchMatchIndex(index: number) {
  activeSearchMatchIndex.value = index;
  if (editor) {
    setMarkdownEditorActiveSearchMatchIndex(editor, index);
  }
}

function getSearchMatchCount(): number {
  if (!editor) {
    return 0;
  }

  return getMarkdownEditorSearchMatchCount(editor);
}

function scrollToSearchMatch(index: number) {
  if (!editor) {
    return;
  }

  scrollToMarkdownEditorSearchMatch(editor, index);
}

defineExpose({
  setSearchQuery,
  setActiveSearchMatchIndex,
  getSearchMatchCount,
  scrollToSearchMatch
});

async function teardownEditor() {
  creationToken += 1;
  const currentEditor = editor;
  editor = null;
  activeEditorMode = null;
  lastKnownMarkdown = '';

  await destroyMarkdownEditor(currentEditor);
  if (editorRoot.value) {
    editorRoot.value.innerHTML = '';
  }
}

function extractMarkdownCodeBlockLabels(content: string): string[] {
  const labels: string[] = [];
  const fencePattern = /(^|\n)(`{3,}|~{3,})([^\n`]*)\r?\n([\s\S]*?)\r?\n\2(?=\n|$)/g;

  content.replace(fencePattern, (_match, _prefix: string, _fence: string, info: string) => {
    const normalized = info.trim().split(/\s+/)[0]?.trim().toLowerCase() ?? '';
    labels.push(normalized || 'text');
    return _match;
  });

  return labels;
}

function requiresMarkdownDocumentPathRebind(content: string): boolean {
  if (!content.trim()) {
    return false;
  }

  return /!\[\[[^\]]+\]\]/.test(content)
    || /\]\(((?![a-z][a-z0-9+.-]*:|\/|#)[^)]+)\)/i.test(content);
}
</script>

<style scoped>
.markdown-viewer {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.editor-scroll-shell {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.editor-input {
  flex: 0 0 auto;
  width: 100%;
  min-width: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 22px 24px 30px;
  transform-origin: top left;
}

.editor-input--markdown-source {
  border: 0;
  outline: none;
  resize: none;
  color: #e2e8f0;
  background: transparent;
  font: 15px/1.7 'SFMono-Regular', 'SF Mono', 'Menlo', monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  overflow-x: hidden;
  tab-size: 2;
}

.editor-input--markdown-source:focus {
  outline: none;
}

.editor-input :deep(.milkdown .milkdown-code-block .tools) {
  display: none !important;
}

.editor-input :deep(.milkdown .milkdown-code-block button[aria-label*='copy' i]),
.editor-input :deep(.milkdown .milkdown-code-block button[title*='copy' i]),
.editor-input :deep(.milkdown .milkdown-code-block select),
.editor-input :deep(.milkdown .milkdown-code-block [role='combobox']) {
  display: none !important;
}

.editor-input--markdown-edit :deep(.milkdown .milkdown-code-block) {
  position: relative;
}

.editor-input--markdown-edit :deep(.milkdown .milkdown-code-block)::before {
  content: attr(data-readonly-language);
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  color: rgba(226, 232, 240, 0.92);
  background: rgba(15, 23, 42, 0.74);
  border: 1px solid rgba(148, 163, 184, 0.22);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  pointer-events: none;
}

.editor-input :deep(.milkdown) {
  min-height: 100%;
  color: #e2e8f0;
}

.editor-input :deep(.milkdown .ProseMirror) {
  min-height: 100%;
  border: 0;
  outline: none;
  box-sizing: border-box;
  color: #e2e8f0;
  font: 16px/1.75 'SF Pro Display', 'Segoe UI', sans-serif;
  caret-color: #7dd3fc;
}

.editor-input :deep(.milkdown .ProseMirror ul),
.editor-input :deep(.milkdown .ProseMirror ol) {
  margin: 0.45em 0;
  padding-left: 1.35em;
}

.editor-input :deep(.milkdown .ProseMirror li) {
  margin: 0.12em 0;
  padding-left: 0.18em;
}

.editor-input :deep(.milkdown .ProseMirror li > p) {
  margin: 0;
}

.editor-input :deep(.milkdown .ProseMirror li > ul),
.editor-input :deep(.milkdown .ProseMirror li > ol) {
  margin-top: 0.2em;
}

.editor-input :deep(.milkdown .ProseMirror ul li::marker),
.editor-input :deep(.milkdown .ProseMirror ol li::marker) {
  color: rgba(226, 232, 240, 0.72);
}

.editor-input :deep(.milkdown .ProseMirror h1),
.editor-input :deep(.milkdown .ProseMirror h2),
.editor-input :deep(.milkdown .ProseMirror h3),
.editor-input :deep(.milkdown .ProseMirror h4) {
  color: #f8fafc;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.editor-input :deep(.milkdown .ProseMirror h1) {
  font-size: 2rem;
}

.editor-input :deep(.milkdown .ProseMirror h2) {
  font-size: 1.55rem;
}

.editor-input :deep(.milkdown .ProseMirror p),
.editor-input :deep(.milkdown .ProseMirror li),
.editor-input :deep(.milkdown .ProseMirror blockquote) {
  font-size: 1rem;
}

.editor-input :deep(.milkdown .ProseMirror p),
.editor-input :deep(.milkdown .ProseMirror li > p),
.editor-input :deep(.milkdown .ProseMirror blockquote p) {
  white-space: pre-wrap;
}

.editor-input :deep(.milkdown .ProseMirror table p),
.editor-input :deep(.milkdown .ProseMirror table li),
.editor-input :deep(.milkdown .ProseMirror table blockquote),
.editor-input :deep(.milkdown .ProseMirror table li > p),
.editor-input :deep(.milkdown .ProseMirror table blockquote p) {
  white-space: normal;
}

.editor-input :deep(.milkdown .ProseMirror span[data-type='hardbreak'][data-is-inline='true']) {
  display: block;
  width: 100%;
  height: 0;
  line-height: 0;
  overflow: hidden;
}

.editor-input :deep(.milkdown .ProseMirror span[data-type='hardbreak'][data-is-inline='true']::after) {
  content: '';
  display: block;
  height: 1.75em;
}

.editor-input :deep(.milkdown .ProseMirror blockquote) {
  border-left: 3px solid rgba(125, 211, 252, 0.45);
  padding-left: 12px;
  color: #cbd5e1;
}

.editor-input :deep(.milkdown .ProseMirror pre) {
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.9);
}

.editor-input :deep(.milkdown .ProseMirror code) {
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.72);
}

.editor-input :deep(.milkdown .ProseMirror a) {
  color: #7dd3fc;
  text-decoration: underline;
  text-decoration-color: rgba(125, 211, 252, 0.7);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 0.12em;
}

.editor-input :deep(.milkdown .ProseMirror a:hover),
.editor-input :deep(.milkdown .ProseMirror a:focus-visible) {
  color: #22d3ee;
  text-decoration-color: currentColor;
  cursor: pointer;
}

.editor-input :deep(.milkdown .milkdown-code-block .hidden) {
  display: none !important;
}

.editor-input :deep(.milkdown .milkdown-code-block .preview-panel .preview) {
  max-width: 100%;
  overflow-x: auto;
  text-align: center;
}

.editor-input :deep(.milkdown .milkdown-code-block:has(.markdown-mermaid-preview) .tools) {
  display: none;
}

.editor-input :deep(.milkdown .ProseMirror img),
.editor-input :deep(.milkdown-image-inline img),
.editor-input :deep(.milkdown-image-block img) {
  max-width: 100%;
  height: auto;
}

.editor-input :deep(.markdown-mermaid-preview) {
  max-width: 100%;
  overflow-x: auto;
  padding: 12px;
  border-radius: 8px;
  background: #080d14;
}

.editor-input :deep(.markdown-mermaid-preview svg) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.editor-input :deep(.markdown-mermaid-error) {
  max-width: 100%;
  overflow-x: auto;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 8px;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.26);
  white-space: pre-wrap;
}

.editor-input :deep(.markdown-pdf-embed) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin: 16px 0;
}

.editor-input :deep(.markdown-pdf-embed__link) {
  align-self: flex-start;
  font-size: 0.95rem;
}

.editor-input :deep(.markdown-pdf-embed__frame) {
  width: 100%;
  height: 500px;
  border: 0;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.55);
}

.editor-input :deep(.markdown-pdf-embed__fallback) {
  color: #7dd3fc;
}

.file-change-panel {
  display: flex;
  max-height: 38%;
  flex-direction: column;
  border-top: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(8, 13, 20, 0.92);
}

.file-change-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.file-change-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.file-change-meta strong {
  color: #f8fafc;
  font-size: 13px;
}

.file-change-meta span {
  color: rgba(226, 232, 240, 0.72);
  font-size: 12px;
  word-break: break-all;
}

.file-change-actions {
  display: inline-flex;
  gap: 8px;
}

.change-action-button {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  padding: 6px 10px;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.7);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.change-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.file-change-diff {
  overflow: auto;
  padding: 10px 14px 14px;
}

.diff-row {
  display: grid;
  grid-template-columns: 42px 42px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 3px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.diff-row:last-child {
  border-bottom: 0;
}

.diff-row--added {
  background: rgba(34, 197, 94, 0.06);
}

.diff-row--removed {
  background: rgba(239, 68, 68, 0.06);
}

.diff-row--modified {
  background: rgba(14, 165, 233, 0.05);
}

.diff-line {
  color: rgba(148, 163, 184, 0.84);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  text-align: right;
}

.diff-text {
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
  background: transparent;
}

.editor-input :deep(.markdown-search-highlight) {
  border-radius: 3px;
  background: rgba(250, 204, 21, 0.42);
  color: inherit;
}

.editor-input :deep(.markdown-search-highlight--active) {
  background: rgba(251, 146, 60, 0.72);
  outline: 1px solid rgba(251, 191, 36, 0.88);
}
</style>
