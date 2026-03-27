<template>
  <section class="editor-pane" data-testid="knowledge-editor">
    <header class="editor-header">
      <div class="editor-meta">
        <span class="editor-label">Markdown</span>
        <span class="editor-path">{{ activePathLabel }}</span>
      </div>
      <button
        type="button"
        class="save-button"
        data-testid="knowledge-save"
        :disabled="!activePath || isSaving"
        @click="emit('save')"
      >
        {{ isSaving ? '保存中...' : '保存' }}
      </button>
    </header>

    <div v-if="!activePath" class="empty-state" data-testid="knowledge-editor-empty">
      从左侧文件树选择一个 Markdown 文件开始编辑。
    </div>
    <div v-else ref="editorRoot" class="editor-input" data-testid="knowledge-editor-surface" />
  </section>
</template>

<script setup lang="ts">
import '@milkdown/crepe/theme/nord-dark.css';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
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
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'save'): void;
}>();

const activePathLabel = computed(() => props.activePath ?? '未选择文件');
const editorRoot = ref<HTMLElement | null>(null);

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
  padding: 12px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.editor-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.editor-label {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}

.editor-path {
  color: #e2e8f0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.save-button {
  border: 0;
  border-radius: 10px;
  padding: 8px 12px;
  color: #e2e8f0;
  background: rgba(37, 99, 235, 0.78);
  cursor: pointer;
}

.save-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
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
