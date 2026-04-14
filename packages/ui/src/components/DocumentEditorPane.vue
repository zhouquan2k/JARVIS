<template>
  <section class="editor-pane" data-testid="document-editor">
    <header class="editor-header">
      <div class="editor-meta">
        <span class="editor-path">{{ activePathLabel }}</span>
      </div>
      <div class="editor-actions">
        <div
          v-if="isMarkdownDocument"
          class="mode-switch"
          data-testid="markdown-mode-switch"
          :aria-label="t('shared.markdownModeSwitch')"
        >
          <button
            type="button"
            class="mode-switch-button"
            data-testid="markdown-mode-viewer"
            :class="{ active: markdownViewerMode === 'viewer' }"
            :aria-pressed="markdownViewerMode === 'viewer'"
            @click="switchMarkdownViewerMode('viewer')"
          >
            {{ t('shared.markdownViewerMode') }}
          </button>
          <button
            type="button"
            class="mode-switch-button"
            data-testid="markdown-mode-edit"
            :class="{ active: markdownViewerMode === 'edit' }"
            :aria-pressed="markdownViewerMode === 'edit'"
            @click="switchMarkdownViewerMode('edit')"
          >
            {{ t('shared.markdownEditMode') }}
          </button>
        </div>
        <button
          type="button"
          class="save-button"
          data-testid="document-save"
          :title="saveButtonLabel"
          :aria-label="saveButtonLabel"
          :disabled="!canSave || isSaving"
          @mouseenter="showTooltip($event, saveButtonLabel)"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, saveButtonLabel)"
          @blur="hideTooltip"
          @click="emit('save')"
        >
          <Save class="save-icon" :size="18" aria-hidden="true" />
        </button>
      </div>
    </header>
    <Teleport to="body">
      <div
        v-if="tooltipState.visible"
        class="floating-tooltip"
        role="tooltip"
        :style="{ left: `${tooltipState.left}px`, top: `${tooltipState.top}px` }"
      >
        {{ tooltipState.text }}
      </div>
    </Teleport>

    <div v-if="activePaneMode === 'empty'" class="empty-state" data-testid="document-editor-empty">
      {{ t('shared.selectFile') }}
    </div>
    <div
      v-else-if="activeViewerId === 'text'"
      ref="editorRoot"
      class="editor-input"
      data-testid="document-editor-surface"
    />
    <div
      v-else-if="activeViewerId === 'pdf'"
      class="pdf-viewer-shell"
      data-testid="document-pdf-viewer"
    >
      <iframe
        v-if="pdfBlobUrl"
        :src="pdfBlobUrl"
        class="pdf-frame"
        :title="t('shared.openPdf')"
      />
      <div v-else class="unsupported-state" data-testid="document-pdf-fallback">
        <p>{{ t('shared.unsupportedPdf') }}</p>
        <a
          v-if="pdfOpenHref"
          :href="pdfOpenHref"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="document-pdf-open-link"
        >
          {{ t('shared.openPdf') }}
        </a>
      </div>
    </div>
    <div
      v-else
      class="unsupported-state"
      data-testid="document-unsupported-viewer"
    >
      {{ t('shared.unsupportedViewer', { mimeType: activeDocument?.mimeType ?? 'unknown' }) }}
    </div>
    <section
      v-if="activeViewerId === 'text' && activePath && latestFileChange"
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
import '@milkdown/crepe/theme/nord-dark.css';
import { decodeBase64, type ContextDocument } from '@packages/core/src';
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Save } from 'lucide-vue-next';
import type { FileChangeRecord, LineDiffEntry } from '../services/FileChangeService';
import { useWorkspaceI18n } from '../i18n';
import {
  createMarkdownEditor,
  destroyMarkdownEditor,
  normalizeMarkdownViewerContent,
  readMarkdownDocument,
  replaceMarkdownDocument,
  type MarkdownEditor,
  type MarkdownViewerMode
} from '../utils/markdownDocument';

const props = defineProps<{
  activePath: string | null;
  activeDocument: ContextDocument | null;
  activeViewerId: string | null;
  activePaneMode: 'empty' | 'viewer' | 'unsupported';
  modelValue: string;
  isSaving: boolean;
  latestFileChange: FileChangeRecord | null;
  diffEntries: LineDiffEntry[];
  canUndo: boolean;
  canRedo: boolean;
}>();
const { t } = useWorkspaceI18n();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'save'): void;
  (event: 'undo-change'): void;
  (event: 'redo-change'): void;
}>();

const activePathLabel = computed(() => {
  if (!props.activePath) {
    return t('shared.noSelectedFile');
  }

  const segments = props.activePath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? props.activePath;
});
const canSave = computed(() => {
  return props.activeViewerId === 'text'
    && !!props.activePath
    && props.activeDocument?.canWrite !== false;
});
const saveButtonLabel = computed(() => {
  if (!canSave.value) {
    return t('shared.unsavedDocument');
  }

  return props.isSaving ? t('shared.saving') : t('shared.save');
});
const isMarkdownDocument = computed(() => {
  return props.activeViewerId === 'text' && props.activeDocument?.mimeType === 'text/markdown';
});
const editorRoot = ref<HTMLElement | null>(null);
const pdfBlobUrl = ref<string | null>(null);
const markdownViewerMode = ref<MarkdownViewerMode>('viewer');
const pdfOpenHref = computed(() => {
  const document = props.activeDocument;
  if (document?.mimeType !== 'application/pdf') {
    return null;
  }

  return pdfBlobUrl.value || `data:${document.mimeType};base64,${document.dataBase64}`;
});
const tooltipState = reactive({
  text: '',
  top: 0,
  left: 0,
  visible: false
});

let editor: MarkdownEditor | null = null;
let creationToken = 0;
let isApplyingExternalSync = false;
let lastKnownMarkdown = '';
let activeEditorMode: MarkdownViewerMode | null = null;

function getMarkdownContentForCurrentMode(content: string): string {
  return isMarkdownDocument.value && markdownViewerMode.value === 'viewer'
    ? normalizeMarkdownViewerContent(content)
    : content;
}

watch(() => [props.activePath, props.activeDocument?.mimeType] as const, async ([, mimeType]) => {
  if (mimeType === 'text/markdown') {
    markdownViewerMode.value = 'viewer';

    if (props.activePath && props.activeViewerId === 'text' && activeEditorMode !== 'viewer') {
      const currentMarkdown = lastKnownMarkdown || props.modelValue;
      await teardownEditor();
      await nextTick();
      await ensureEditor(currentMarkdown);
    }
  }
});

watch(() => [props.activePath, props.activeViewerId, props.modelValue] as const, async ([activePath, activeViewerId, modelValue], previousValue) => {
  const previousPath = previousValue?.[0] ?? null;
  const previousViewerId = previousValue?.[1] ?? null;
  if (!activePath || activeViewerId !== 'text') {
    await teardownEditor();
    return;
  }

  await nextTick();
  await ensureEditor(modelValue);

  if (!editor) {
    return;
  }

  if (activePath !== previousPath || activeViewerId !== previousViewerId || modelValue !== lastKnownMarkdown) {
    syncEditorContent(modelValue);
  }
}, { immediate: true, flush: 'post' });

watch(
  () => props.activeDocument,
  (document) => {
    if (document?.mimeType !== 'application/pdf') {
      revokePdfBlobUrl();
      return;
    }

    revokePdfBlobUrl();
    const bytes = decodeBase64(document.dataBase64);
    const blobBytes = new Uint8Array(bytes.byteLength);
    blobBytes.set(bytes);
    const blob = new Blob([blobBytes], { type: document.mimeType });
    pdfBlobUrl.value = URL.createObjectURL(blob);
  },
  { immediate: true }
);

onBeforeUnmount(async () => {
  revokePdfBlobUrl();
  await teardownEditor();
});

async function ensureEditor(content: string) {
  if (editor || !editorRoot.value) {
    return;
  }

  const token = ++creationToken;
  const renderedContent = getMarkdownContentForCurrentMode(content);
  const instance = await createMarkdownEditor({
    root: editorRoot.value,
    content: renderedContent,
    mode: isMarkdownDocument.value ? markdownViewerMode.value : 'edit',
    documentPath: props.activeDocument?.path ?? props.activePath,
    onChange(markdown) {
      lastKnownMarkdown = markdown;
      if (isApplyingExternalSync || !props.activePath) {
        return;
      }

      // In viewer mode the editor operates on normalized content (e.g. wiki embeds converted
      // to standard markdown).  If the emitted content is identical to what normalisation
      // produces from the current model value, no real user edit has occurred — suppress the
      // update so the source file is not modified by merely opening it in viewer mode.
      if (isMarkdownDocument.value && markdownViewerMode.value === 'viewer'
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
  activeEditorMode = isMarkdownDocument.value ? markdownViewerMode.value : 'edit';
  lastKnownMarkdown = content;
}

async function switchMarkdownViewerMode(nextMode: MarkdownViewerMode) {
  if (markdownViewerMode.value === nextMode || !isMarkdownDocument.value) {
    return;
  }

  // When leaving viewer mode, use the original model value (disk content) rather than
  // lastKnownMarkdown which holds normalised editor content (e.g. converted wiki embeds).
  // This preserves source syntax like ![[image.png]] when the user switches to edit mode.
  const currentMarkdown = markdownViewerMode.value === 'viewer'
    ? props.modelValue
    : editor ? readMarkdownDocument(editor) : lastKnownMarkdown || props.modelValue;
  lastKnownMarkdown = currentMarkdown;
  if (currentMarkdown !== props.modelValue) {
    emit('update:modelValue', currentMarkdown);
  }
  await teardownEditor();
  markdownViewerMode.value = nextMode;
  await nextTick();
  await ensureEditor(currentMarkdown);
}

function syncEditorContent(content: string) {
  if (!editor || content === lastKnownMarkdown) {
    return;
  }

  isApplyingExternalSync = true;
  replaceMarkdownDocument(editor, getMarkdownContentForCurrentMode(content));
  lastKnownMarkdown = content;
  queueMicrotask(() => {
    isApplyingExternalSync = false;
  });
}

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

function showTooltip(event: MouseEvent | FocusEvent, text: string) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const rect = target.getBoundingClientRect();
  tooltipState.text = text;
  tooltipState.left = rect.left + rect.width / 2;
  tooltipState.top = rect.top - 8;
  tooltipState.visible = true;
}

function hideTooltip() {
  tooltipState.visible = false;
}

function revokePdfBlobUrl() {
  if (!pdfBlobUrl.value) {
    return;
  }

  URL.revokeObjectURL(pdfBlobUrl.value);
  pdfBlobUrl.value = null;
}
</script>

<style scoped>
.editor-pane {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  border-left: 1px solid rgba(148, 163, 184, 0.14);
  border-right: 1px solid rgba(148, 163, 184, 0.14);
  background: linear-gradient(180deg, rgba(9, 15, 23, 0.96), rgba(13, 20, 30, 0.92));
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.editor-meta {
  display: flex;
  align-items: center;
  min-width: 0;
}

.editor-path {
  color: #e2e8f0;
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.62);
}

.mode-switch-button {
  border: 0;
  border-radius: 6px;
  min-width: 52px;
  height: 26px;
  padding: 0 10px;
  color: rgba(226, 232, 240, 0.78);
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.mode-switch-button:hover,
.mode-switch-button:focus-visible,
.mode-switch-button.active {
  color: #f8fafc;
  background: rgba(14, 165, 233, 0.26);
}

.save-button {
  border: 0;
  border-radius: 8px;
  width: 30px;
  height: 30px;
  padding: 0;
  color: rgba(226, 232, 240, 0.86);
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.save-icon {
  width: 18px;
  height: 18px;
}

.save-button:hover:not(:disabled),
.save-button:focus-visible:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
}

.save-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.floating-tooltip {
  position: fixed;
  transform: translate(-50%, -100%);
  padding: 5px 8px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.24);
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.1;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  z-index: 9999;
}

.editor-input {
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: auto;
  box-sizing: border-box;
  padding: 22px 24px 30px;
}

.pdf-viewer-shell,
.unsupported-state {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.pdf-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  border: 0;
  background: rgba(15, 23, 42, 0.72);
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

.editor-input :deep(.milkdown .ProseMirror p:has(a[href$='.pdf' i])) {
  display: none;
}

.editor-input :deep(.pdf-inline-embed) {
  width: 100%;
  margin: 12px 0;
}

.editor-input :deep(.pdf-inline-embed iframe) {
  width: 100%;
  height: 500px;
  border: 0;
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
  font-size: 12px;
}

.file-change-meta span {
  color: #94a3b8;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-change-actions {
  display: flex;
  gap: 8px;
}

.change-action-button {
  border: 1px solid rgba(59, 130, 246, 0.28);
  border-radius: 8px;
  padding: 6px 10px;
  color: #dbeafe;
  background: rgba(30, 64, 175, 0.25);
  cursor: pointer;
}

.change-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.file-change-diff {
  overflow: auto;
  font-family: 'SFMono-Regular', 'JetBrains Mono', monospace;
}

.diff-row {
  display: grid;
  grid-template-columns: 48px 48px minmax(0, 1fr);
  gap: 12px;
  padding: 4px 14px;
  font-size: 12px;
}

.diff-row--context {
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.38);
}

.diff-row--added {
  color: #dcfce7;
  background: rgba(22, 101, 52, 0.28);
}

.diff-row--removed {
  color: #fee2e2;
  background: rgba(153, 27, 27, 0.24);
}

.diff-line {
  color: rgba(148, 163, 184, 0.88);
  text-align: right;
}

.diff-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.empty-state {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: #94a3b8;
  text-align: center;
}

.unsupported-state {
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: #94a3b8;
  text-align: center;
}
</style>
