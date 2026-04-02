<template>
  <section class="editor-pane" data-testid="knowledge-editor">
    <header class="editor-header">
      <div class="editor-meta">
        <span class="editor-path">{{ activePathLabel }}</span>
      </div>
      <button
        type="button"
        class="save-button"
        data-testid="knowledge-save"
        :title="saveButtonLabel"
        :aria-label="saveButtonLabel"
        :disabled="!activePath || isSaving"
        @mouseenter="showTooltip($event, saveButtonLabel)"
        @mouseleave="hideTooltip"
        @focus="showTooltip($event, saveButtonLabel)"
        @blur="hideTooltip"
        @click="emit('save')"
      >
        <Save class="save-icon" :size="18" aria-hidden="true" />
      </button>
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

    <div v-if="!activePath" class="empty-state" data-testid="knowledge-editor-empty">
      从左侧文件树选择一个 Markdown 文件开始编辑。
    </div>
    <div v-else ref="editorRoot" class="editor-input" data-testid="knowledge-editor-surface" />
    <section
      v-if="activePath && latestFileChange"
      class="file-change-panel"
      data-testid="knowledge-file-change"
    >
      <div class="file-change-header">
        <div class="file-change-meta">
          <strong>最近一次 Agent 文件改写</strong>
          <span>{{ latestFileChange.path }}</span>
        </div>
        <div class="file-change-actions">
          <button
            type="button"
            class="change-action-button"
            data-testid="knowledge-file-change-undo"
            :disabled="!canUndo"
            @click="emit('undo-change')"
          >
            Undo
          </button>
          <button
            type="button"
            class="change-action-button"
            data-testid="knowledge-file-change-redo"
            :disabled="!canRedo"
            @click="emit('redo-change')"
          >
            Redo
          </button>
        </div>
      </div>
      <div class="file-change-diff" data-testid="knowledge-file-diff">
        <div
          v-for="(entry, index) in diffEntries"
          :key="`${index}-${entry.kind}-${entry.oldLineNumber ?? 'n'}-${entry.newLineNumber ?? 'n'}`"
          class="diff-row"
          :class="`diff-row--${entry.kind}`"
          data-testid="knowledge-file-diff-row"
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
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Save } from 'lucide-vue-next';
import type { FileChangeRecord, LineDiffEntry } from '../services/FileChangeService';
import {
  createMarkdownEditor,
  destroyMarkdownEditor,
  readMarkdownDocument,
  replaceMarkdownDocument,
  type MarkdownEditor
} from '../utils/markdownDocument';

const props = defineProps<{
  activePath: string | null;
  modelValue: string;
  isSaving: boolean;
  latestFileChange: FileChangeRecord | null;
  diffEntries: LineDiffEntry[];
  canUndo: boolean;
  canRedo: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'save'): void;
  (event: 'undo-change'): void;
  (event: 'redo-change'): void;
}>();

const activePathLabel = computed(() => {
  if (!props.activePath) {
    return '未选择文件';
  }

  const segments = props.activePath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? props.activePath;
});
const saveButtonLabel = computed(() => props.isSaving ? '保存中' : '保存');
const editorRoot = ref<HTMLElement | null>(null);
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

watch(() => [props.activePath, props.modelValue] as const, async ([activePath, modelValue], previousValue) => {
  const previousPath = previousValue?.[0] ?? null;
  if (!activePath) {
    await teardownEditor();
    return;
  }

  await nextTick();
  await ensureEditor(modelValue);

  if (!editor) {
    return;
  }

  if (activePath !== previousPath || modelValue !== lastKnownMarkdown) {
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
  const instance = await createMarkdownEditor({
    root: editorRoot.value,
    content,
    onChange(markdown) {
      lastKnownMarkdown = markdown;
      if (isApplyingExternalSync || !props.activePath) {
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
  lastKnownMarkdown = readMarkdownDocument(instance);
}

function syncEditorContent(content: string) {
  if (!editor || content === lastKnownMarkdown) {
    return;
  }

  isApplyingExternalSync = true;
  replaceMarkdownDocument(editor, content);
  lastKnownMarkdown = readMarkdownDocument(editor);
  queueMicrotask(() => {
    isApplyingExternalSync = false;
  });
}

async function teardownEditor() {
  creationToken += 1;
  const currentEditor = editor;
  editor = null;
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
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.9);
}

.editor-input :deep(.milkdown .ProseMirror code) {
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.72);
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
</style>
