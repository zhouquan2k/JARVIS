<template>
  <section class="markdown-viewer" data-testid="markdown-viewer">
    <div ref="scrollShellRef" class="editor-scroll-shell" data-testid="document-editor-scroll-shell">
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
        ref="markdownSourceRef"
        class="editor-input editor-input--markdown-source"
        data-testid="document-editor-input"
        :value="modelValue"
        wrap="soft"
        :style="zoomStyle"
        spellcheck="false"
        @click="rememberMarkdownSelection"
        @input="onMarkdownSourceInput"
        @paste="onMarkdownSourcePaste"
        @keyup="rememberMarkdownSelection"
        @select="rememberMarkdownSelection"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ContextDocument } from '@packages/core/src';
import { useWorkspaceI18n } from '../i18n';
import {
  applyMarkdownLinkAtViewerSelection,
  buildMarkdownConversationLinkHref,
  captureRenderableMarkdownSelection,
  createMarkdownEditor,
  getMarkdownEditorSearchMatchCount,
  destroyMarkdownEditor,
  findResizableMarkdownImageSource,
  insertMarkdownAtViewerSelection,
  insertPastedMarkdownImage,
  normalizeMarkdownViewerContent,
  readMarkdownDocument,
  replaceMarkdownDocument,
  resolveMarkdownSourceSelection,
  rewriteMarkdownImageRatio,
  scrollToMarkdownEditorSearchMatch,
  setMarkdownEditorActiveSearchMatchIndex,
  setMarkdownEditorSearchQuery,
  toggleMarkAtViewerSelection,
  toggleMarkdownHighlightAtViewerSelection,
  type MarkdownConversationLinkTarget,
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
  persistMarkdownImage?: (input: {
    documentPath: string;
    mimeType: string;
    bytes: Uint8Array;
  }) => Promise<{ imagePath: string; markdown: string }>;
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
  (event: 'open-conversation-link', target: MarkdownConversationLinkTarget): void;
}>();

const isMarkdownDocument = computed(() => props.activeDocument?.mimeType === 'text/markdown');
const isMarkdownEditMode = computed(() => isMarkdownDocument.value && props.markdownViewerMode === 'edit');
const zoomStyle = computed(() => ({
  transform: `scale(${props.middlePaneZoom})`
}));
const editorRoot = ref<HTMLElement | null>(null);
const scrollShellRef = ref<HTMLElement | null>(null);
const markdownSourceRef = ref<HTMLTextAreaElement | null>(null);
const searchQuery = ref('');
const activeSearchMatchIndex = ref(0);

let editor: MarkdownEditor | null = null;
let isCreatingEditor = false;
let creationToken = 0;
let isApplyingExternalSync = false;
let externalSyncToken = 0;
let lastKnownMarkdown = '';
let activeEditorMode: MarkdownViewerMode | null = null;
let lastMarkdownSelection: { start: number; end: number } | null = null;
let preferRememberedMarkdownSelection = false;
let pendingViewerScrollTop: number | null = null;
let pendingModeSwitchViewerScrollTop: number | null = null;
let viewerPasteAbortController: AbortController | null = null;
let isNavigatingAwayFromViewer = false;
let lastViewerNavigationTarget: { kind: 'document'; path: string } | { kind: 'conversation'; conversationId: string } | null = null;
const MARKDOWN_IMAGE_DEBUG_STORAGE_KEY = 'chatprism:debug-markdown-image';
const MARKDOWN_VIEWER_DEBUG_STORAGE_KEY = 'chatprism:debug-markdown-viewer';

function stripLeadingFrontmatter(content: string): string {
  if (!content.startsWith('---')) {
    return content;
  }

  const end = content.indexOf('\n---', 3);
  if (end < 0) {
    return content;
  }

  const rest = content.slice(end + 4);
  return rest.startsWith('\n') ? rest.slice(1) : rest;
}

function isEditorBootstrapEcho(markdown: string, sourceContent: string, renderedContent: string): boolean {
  return markdown === sourceContent
    || markdown === renderedContent
    || markdown === stripLeadingFrontmatter(sourceContent)
    || markdown === stripLeadingFrontmatter(renderedContent);
}

function beginExternalSync(reason: string, payload: Record<string, unknown> = {}): number {
  externalSyncToken += 1;
  isApplyingExternalSync = true;
  const token = externalSyncToken;
  logMarkdownViewerDebug('external-sync-begin', {
    token,
    reason,
    activePath: props.activePath,
    documentPath: props.activeDocument?.path ?? props.activePath,
    ...payload
  });
  return token;
}

function finishExternalSync(token: number, reason: string, payload: Record<string, unknown> = {}): void {
  if (token !== externalSyncToken) {
    logMarkdownViewerDebug('external-sync-finish-skipped', {
      token,
      activeToken: externalSyncToken,
      reason,
      activePath: props.activePath,
      documentPath: props.activeDocument?.path ?? props.activePath,
      ...payload
    });
    return;
  }

  isApplyingExternalSync = false;
  logMarkdownViewerDebug('external-sync-finish', {
    token,
    reason,
    activePath: props.activePath,
    documentPath: props.activeDocument?.path ?? props.activePath,
    ...payload
  });
}

function resetEditorSyncState(reason: string, payload: Record<string, unknown> = {}): void {
  const previousToken = externalSyncToken;
  const previousApplyingState = isApplyingExternalSync;
  externalSyncToken += 1;
  isApplyingExternalSync = false;
  preferRememberedMarkdownSelection = false;
  logMarkdownViewerDebug('external-sync-reset', {
    reason,
    previousToken,
    nextToken: externalSyncToken,
    previousApplyingState,
    activePath: props.activePath,
    documentPath: props.activeDocument?.path ?? props.activePath,
    lastKnownPreview: lastKnownMarkdown.slice(0, 240),
    ...payload
  });
}

function logMarkdownImageViewerDebug(event: string, payload: Record<string, unknown>) {
  if (!isMarkdownImageDebugEnabled()) {
    return;
  }

  console.debug(`[markdown-image-viewer] ${event}`, payload);
}

function logMarkdownViewerDebug(event: string, payload: Record<string, unknown>) {
  if (!isMarkdownViewerDebugEnabled()) {
    return;
  }

  console.debug(`[markdown-viewer] ${event}`, payload);
}

const viewerInstanceId = Math.random().toString(36).slice(2, 8);
interface EditorLifecycleTraceEntry {
  seq: number;
  t: number;
  event: string;
  [key: string]: unknown;
}
let editorLifecycleSeq = 0;
const editorLifecycleTrace: EditorLifecycleTraceEntry[] = [];
function traceEditorLifecycle(event: string, payload: Record<string, unknown> = {}) {
  const entry: EditorLifecycleTraceEntry = {
    seq: ++editorLifecycleSeq,
    t: typeof performance !== 'undefined' ? Math.round(performance.now()) : Date.now(),
    event,
    viewer: viewerInstanceId,
    ...payload
  };
  editorLifecycleTrace.push(entry);
  if (editorLifecycleTrace.length > 80) {
    editorLifecycleTrace.splice(0, editorLifecycleTrace.length - 80);
  }
  logMarkdownViewerDebug(`lifecycle:${event}`, entry);
}
function dumpEditorLifecycleTrace(): EditorLifecycleTraceEntry[] {
  return editorLifecycleTrace.slice(-40);
}

function isMarkdownImageDebugEnabled(): boolean {
  if (import.meta.env.DEV) {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const runtimeFlag = (window as typeof window & {
    __CHATPRISM_DEBUG_MARKDOWN_IMAGE__?: boolean;
  }).__CHATPRISM_DEBUG_MARKDOWN_IMAGE__;

  if (runtimeFlag === true) {
    return true;
  }

  try {
    return window.localStorage.getItem(MARKDOWN_IMAGE_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function isMarkdownViewerDebugEnabled(): boolean {
  if (import.meta.env.DEV) {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const runtimeFlag = (window as typeof window & {
    __CHATPRISM_DEBUG_MARKDOWN_VIEWER__?: boolean;
  }).__CHATPRISM_DEBUG_MARKDOWN_VIEWER__;

  if (runtimeFlag === true) {
    return true;
  }

  try {
    return window.localStorage.getItem(MARKDOWN_VIEWER_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

watch(() => props.markdownViewerMode, (mode, previousMode) => {
  if (!isMarkdownDocument.value) {
    return;
  }
  if (previousMode === 'viewer' && mode !== 'viewer') {
    pendingModeSwitchViewerScrollTop = captureViewerScrollTop();
    logMarkdownViewerDebug('capture-viewer-scroll-top', {
      previousMode,
      mode,
      capturedScrollTop: pendingModeSwitchViewerScrollTop,
      activePath: props.activePath,
      documentPath: props.activeDocument?.path ?? props.activePath
    });
  }
}, { flush: 'sync' });

watch(() => [editorRoot.value, props.markdownViewerMode] as const, () => {
  if (!isMarkdownDocument.value || props.markdownViewerMode !== 'viewer' || !editorRoot.value) {
    return;
  }
  if (pendingModeSwitchViewerScrollTop !== null) {
    restoreViewerScrollTop(pendingModeSwitchViewerScrollTop, 'mode-switch');
  }
}, { flush: 'post' });

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
  const switchedDocument = !!(
    previousPath
    && activePath
    && (activePath !== previousPath || documentPath !== previousDocumentPath)
  );
  if (
    switchedDocument
  ) {
    resetEditorSyncState('document-switch', {
      previousPath,
      nextPath: activePath,
      previousDocumentPath,
      nextDocumentPath: documentPath
    });
    await teardownEditor();
  }
  if (!activePath) {
    resetEditorSyncState('no-active-path', {
      previousPath,
      previousDocumentPath
    });
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
      lastMarkdownSelection = null;
      preferRememberedMarkdownSelection = false;
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
    lastMarkdownSelection = null;
    preferRememberedMarkdownSelection = false;
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

onMounted(() => {
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onWindowUnhandledRejection);
});

onBeforeUnmount(async () => {
  window.removeEventListener('error', onWindowError);
  window.removeEventListener('unhandledrejection', onWindowUnhandledRejection);
  await teardownEditor();
});

const MILKDOWN_CONTEXT_MISSING_PATTERN = /Context "[^"]*" not found/;

function extractMilkdownContextErrorMessage(value: unknown): string | null {
  if (typeof value === 'string') {
    return MILKDOWN_CONTEXT_MISSING_PATTERN.test(value) ? value : null;
  }

  if (value instanceof Error) {
    return MILKDOWN_CONTEXT_MISSING_PATTERN.test(value.message) ? value.message : null;
  }

  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    return typeof message === 'string' && MILKDOWN_CONTEXT_MISSING_PATTERN.test(message)
      ? message
      : null;
  }

  return null;
}

function logMilkdownContextError(
  source: 'error' | 'unhandledrejection',
  message: string,
  stack: string | undefined
) {
  // This is a benign teardown-race artifact from inside Crepe (a detached
  // requestAnimationFrame dispatching against a destroyed editor) and is
  // suppressed by installGlobalUnhandledErrorFallback. We only record the
  // lifecycle timeline when viewer debugging is explicitly enabled so the
  // production console stays clean.
  logMarkdownViewerDebug('editor-context-missing', {
    viewer: viewerInstanceId,
    source,
    message,
    activePath: props.activePath,
    documentPath: props.activeDocument?.path ?? props.activePath,
    markdownViewerMode: props.markdownViewerMode,
    activeEditorMode,
    creationToken,
    navigatingAway: isNavigatingAwayFromViewer,
    lastNavigationTarget: lastViewerNavigationTarget,
    stack,
    lifecycleTrace: dumpEditorLifecycleTrace()
  });
}

function onWindowError(event: ErrorEvent) {
  const message = extractMilkdownContextErrorMessage(event.error ?? event.message);
  if (!message) {
    return;
  }

  logMilkdownContextError('error', message, event.error instanceof Error ? event.error.stack : undefined);
}

function onWindowUnhandledRejection(event: PromiseRejectionEvent) {
  const message = extractMilkdownContextErrorMessage(event.reason);
  if (!message) {
    return;
  }

  logMilkdownContextError(
    'unhandledrejection',
    message,
    event.reason instanceof Error ? event.reason.stack : undefined
  );
}

async function ensureEditor(content: string) {
  if (editor || !editorRoot.value || isCreatingEditor) {
    return;
  }

  isCreatingEditor = true;
  try {
    await createEditorInstance(content);
  } finally {
    isCreatingEditor = false;
  }
}

async function createEditorInstance(content: string) {
  const token = ++creationToken;
  isNavigatingAwayFromViewer = false;
  const root = editorRoot.value;
  if (!root) {
    throw new Error('Markdown editor root is not available.');
  }
  const renderedContent = isMarkdownDocument.value && props.markdownViewerMode === 'viewer'
    ? normalizeMarkdownViewerContent(content)
    : content;
  let bootstrappingEditor = true;
  traceEditorLifecycle('create-begin', {
    token,
    creationToken,
    hasEditor: !!editor,
    isCreatingEditor,
    rootConnected: editorRoot.value?.isConnected ?? null,
    rootChildCount: editorRoot.value?.childElementCount ?? null,
    mode: props.markdownViewerMode,
    activePath: props.activePath,
    documentPath: props.activeDocument?.path ?? props.activePath
  });
  logMarkdownViewerDebug('ensure-editor-start', {
    token,
    mode: props.markdownViewerMode,
    activePath: props.activePath,
    documentPath: props.activeDocument?.path ?? props.activePath,
    navigatingAway: isNavigatingAwayFromViewer
  });
  logMarkdownImageViewerDebug('ensure-editor', {
    mode: props.markdownViewerMode,
    documentPath: props.activeDocument?.path ?? props.activePath,
    sourcePreview: content.slice(0, 240),
    renderedPreview: renderedContent.slice(0, 240)
  });
  let instance: MarkdownEditor;
  try {
    instance = await createMarkdownEditor({
      root,
      content: renderedContent,
      mode: isMarkdownDocument.value ? props.markdownViewerMode : 'edit',
      documentPath: props.activeDocument?.path ?? props.activePath,
      onOpenDocumentLink(path) {
        isNavigatingAwayFromViewer = true;
        lastViewerNavigationTarget = {
          kind: 'document',
          path
        };
        logMarkdownViewerDebug('open-document-link', {
          token,
          fromPath: props.activeDocument?.path ?? props.activePath,
          toPath: path,
          mode: props.markdownViewerMode
        });
        emit('open-document-link', path);
      },
      onOpenConversationLink(target) {
        isNavigatingAwayFromViewer = true;
        lastViewerNavigationTarget = {
          kind: 'conversation',
          conversationId: target.conversationId
        };
        logMarkdownViewerDebug('open-conversation-link', {
          token,
          fromPath: props.activeDocument?.path ?? props.activePath,
          conversationId: target.conversationId,
          mode: props.markdownViewerMode
        });
        emit('open-conversation-link', target);
      },
      onResizeMarkdownImage(payload) {
        applyViewerImageRatio(payload);
      },
      getMarkdownSource: () => props.modelValue,
      onChange(markdown) {
        if (bootstrappingEditor && isEditorBootstrapEcho(markdown, content, renderedContent)) {
          logMarkdownViewerDebug('editor-change-suppressed', {
            reason: 'bootstrap-echo',
            activePath: props.activePath,
            documentPath: props.activeDocument?.path ?? props.activePath,
            markdownPreview: markdown.slice(0, 240)
          });
          return;
        }

        if (isApplyingExternalSync || !props.activePath) {
          logMarkdownViewerDebug('editor-change-suppressed', {
            reason: isApplyingExternalSync ? 'external-sync-active' : 'no-active-path',
            activePath: props.activePath,
            documentPath: props.activeDocument?.path ?? props.activePath,
            markdownPreview: markdown.slice(0, 240),
            lastKnownPreview: lastKnownMarkdown.slice(0, 240),
            externalSyncToken
          });
          lastKnownMarkdown = markdown;
          return;
        }

        if (isMarkdownDocument.value && props.markdownViewerMode === 'viewer'
            && markdown === normalizeMarkdownViewerContent(props.modelValue)) {
          logMarkdownViewerDebug('editor-change-suppressed', {
            reason: 'viewer-normalization-match',
            activePath: props.activePath,
            documentPath: props.activeDocument?.path ?? props.activePath,
            markdownPreview: markdown.slice(0, 240),
            modelPreview: props.modelValue.slice(0, 240)
          });
          return;
        }

        lastKnownMarkdown = markdown;
        logMarkdownViewerDebug('editor-change-emitted', {
          activePath: props.activePath,
          documentPath: props.activeDocument?.path ?? props.activePath,
          markdownPreview: markdown.slice(0, 240),
          modelPreview: props.modelValue.slice(0, 240)
        });
        emit('update:modelValue', markdown);
      }
    });
  } catch (creationError) {
    const message = creationError instanceof Error ? creationError.message : String(creationError);
    traceEditorLifecycle('create-failed', {
      token,
      creationToken,
      message,
      rootConnected: editorRoot.value?.isConnected ?? null,
      rootChildCount: editorRoot.value?.childElementCount ?? null,
      activePath: props.activePath
    });
    console.warn('[markdown-viewer] editor-create-failed', {
      viewer: viewerInstanceId,
      token,
      creationToken,
      message,
      stack: creationError instanceof Error ? creationError.stack : undefined,
      lifecycleTrace: dumpEditorLifecycleTrace()
    });
    throw creationError;
  } finally {
    bootstrappingEditor = false;
  }

  if (token !== creationToken || !props.activePath) {
    traceEditorLifecycle('create-abort', {
      token,
      latestToken: creationToken,
      activePath: props.activePath
    });
    logMarkdownViewerDebug('ensure-editor-abort', {
      token,
      latestToken: creationToken,
      activePath: props.activePath
    });
    await destroyMarkdownEditor(instance);
    return;
  }

  traceEditorLifecycle('create-ready', {
    token,
    creationToken,
    rootChildCount: editorRoot.value?.childElementCount ?? null
  });
  editor = instance;
  activeEditorMode = isMarkdownDocument.value ? props.markdownViewerMode : 'edit';
  lastKnownMarkdown = content;
  applyReadonlyCodeBlockLabels(renderedContent);
  applySearchHighlights();
  bindViewerPasteHandler();
  logMarkdownViewerDebug('ensure-editor-ready', {
    token,
    mode: activeEditorMode,
    activePath: props.activePath,
    documentPath: props.activeDocument?.path ?? props.activePath
  });
  if (pendingModeSwitchViewerScrollTop !== null) {
    restoreViewerScrollTop(pendingModeSwitchViewerScrollTop, 'mode-switch');
  } else if (pendingViewerScrollTop !== null) {
    restoreViewerScrollTop(pendingViewerScrollTop, 'content-sync');
  }
}

function syncEditorContent(content: string) {
  if (!editor || content === lastKnownMarkdown) {
    return;
  }

  const syncToken = beginExternalSync('sync-editor-content', {
    contentPreview: content.slice(0, 240),
    lastKnownPreview: lastKnownMarkdown.slice(0, 240)
  });
  const renderedContent = isMarkdownDocument.value && props.markdownViewerMode === 'viewer'
    ? normalizeMarkdownViewerContent(content)
    : content;
  logMarkdownImageViewerDebug('sync-editor-content', {
    mode: props.markdownViewerMode,
    documentPath: props.activeDocument?.path ?? props.activePath,
    sourcePreview: content.slice(0, 240),
    renderedPreview: renderedContent.slice(0, 240),
    lastKnownPreview: lastKnownMarkdown.slice(0, 240)
  });
  try {
    preserveViewerScrollDuring(() => {
      if (!editor) {
        return;
      }
      replaceMarkdownDocument(editor, renderedContent);
    });
    lastKnownMarkdown = content;
    applyReadonlyCodeBlockLabels(renderedContent);
    applySearchHighlights();
  } finally {
    queueMicrotask(() => {
      finishExternalSync(syncToken, 'sync-editor-content-complete', {
        contentPreview: content.slice(0, 240),
        renderedPreview: renderedContent.slice(0, 240)
      });
    });
  }
}

function onMarkdownSourceInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) {
    return;
  }

  if (isApplyingExternalSync) {
    resetEditorSyncState('source-input-during-external-sync', {
      valuePreview: target.value.slice(0, 240)
    });
  }
  lastMarkdownSelection = {
    start: target.selectionStart ?? target.value.length,
    end: target.selectionEnd ?? target.selectionStart ?? target.value.length
  };
  preferRememberedMarkdownSelection = false;
  lastKnownMarkdown = target.value;
  emit('update:modelValue', target.value);
}

async function onMarkdownSourcePaste(event: ClipboardEvent) {
  const imageFile = findFirstPastedImage(event.clipboardData);
  const documentPath = props.activeDocument?.path ?? props.activePath;
  logMarkdownViewerDebug('source-paste-event', {
    documentPath,
    hasImageFile: !!imageFile,
    clipboardItemTypes: Array.from(event.clipboardData?.items ?? []).map((item) => ({
      kind: item.kind,
      type: item.type
    })),
    externalSyncActive: isApplyingExternalSync,
    externalSyncToken
  });
  if (!imageFile || !documentPath || !props.persistMarkdownImage) {
    return;
  }

  event.preventDefault();

  try {
    const bytes = new Uint8Array(await imageFile.arrayBuffer());
    logMarkdownImageViewerDebug('source-paste-start', {
      documentPath,
      mimeType: imageFile.type || 'image/png',
      byteLength: bytes.byteLength
    });
    const persisted = await props.persistMarkdownImage({
      documentPath,
      mimeType: imageFile.type || 'image/png',
      bytes
    });
    logMarkdownImageViewerDebug('source-paste-persisted', {
      documentPath,
      imagePath: persisted.imagePath,
      markdown: persisted.markdown
    });
    const textarea = markdownSourceRef.value;
    if (!textarea) {
      return;
    }

    const selection = {
      start: textarea.selectionStart ?? lastMarkdownSelection?.start ?? textarea.value.length,
      end: textarea.selectionEnd ?? lastMarkdownSelection?.end ?? textarea.value.length
    };
    const nextValue = insertPastedMarkdownImage(textarea.value, selection, persisted.markdown);
    const caret = selection.start + persisted.markdown.length;

    lastKnownMarkdown = nextValue;
    lastMarkdownSelection = { start: caret, end: caret };
    preferRememberedMarkdownSelection = false;
    emit('update:modelValue', nextValue);

    await nextTick();
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  } catch {
    // Fail closed: keep existing document content unchanged when the image cannot be persisted.
    logMarkdownImageViewerDebug('source-paste-failed', {
      documentPath
    });
  }
}

function bindViewerPasteHandler() {
  viewerPasteAbortController?.abort();
  viewerPasteAbortController = null;
  if (!editorRoot.value || !isMarkdownDocument.value || props.markdownViewerMode !== 'viewer' || !props.persistMarkdownImage) {
    return;
  }

  const controller = new AbortController();
  viewerPasteAbortController = controller;
  editorRoot.value.addEventListener('paste', (event) => {
    void onMarkdownViewerPaste(event);
  }, {
    capture: true,
    signal: controller.signal
  });
}

function rememberMarkdownSelection(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) {
    return;
  }

  lastMarkdownSelection = {
    start: target.selectionStart ?? target.value.length,
    end: target.selectionEnd ?? target.selectionStart ?? target.value.length
  };
  preferRememberedMarkdownSelection = false;
}

function findFirstPastedImage(clipboardData: DataTransfer | null): File | null {
  const item = Array.from(clipboardData?.items ?? []).find((candidate) => candidate.kind === 'file' && candidate.type.startsWith('image/'));
  const itemFile = item?.getAsFile();
  if (itemFile) {
    return itemFile;
  }

  return Array.from(clipboardData?.files ?? []).find((candidate) => candidate.type.startsWith('image/')) ?? null;
}

async function onMarkdownViewerPaste(event: ClipboardEvent) {
  const imageFile = findFirstPastedImage(event.clipboardData);
  const documentPath = props.activeDocument?.path ?? props.activePath;
  logMarkdownViewerDebug('viewer-paste-event', {
    documentPath,
    hasImageFile: !!imageFile,
    clipboardItemTypes: Array.from(event.clipboardData?.items ?? []).map((item) => ({
      kind: item.kind,
      type: item.type
    })),
    externalSyncActive: isApplyingExternalSync,
    externalSyncToken,
    lastKnownPreview: lastKnownMarkdown.slice(0, 240),
    modelPreview: props.modelValue.slice(0, 240)
  });
  logMarkdownImageViewerDebug('viewer-paste-event', {
    documentPath,
    hasClipboardData: !!event.clipboardData,
    clipboardItemTypes: Array.from(event.clipboardData?.items ?? []).map((item) => ({
      kind: item.kind,
      type: item.type
    })),
    matchedImage: imageFile
      ? {
        type: imageFile.type,
        size: imageFile.size
      }
      : null
  });
  if (!imageFile || !documentPath || !props.persistMarkdownImage || !editorRoot.value) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  try {
    const bytes = new Uint8Array(await imageFile.arrayBuffer());
    logMarkdownImageViewerDebug('viewer-paste-start', {
      documentPath,
      mimeType: imageFile.type || 'image/png',
      byteLength: bytes.byteLength
    });
    const persisted = await props.persistMarkdownImage({
      documentPath,
      mimeType: imageFile.type || 'image/png',
      bytes
    });
    const nextSelection = resolveViewerPasteSelection();
    const nextValue = insertPastedMarkdownImage(props.modelValue, nextSelection, persisted.markdown);
    logMarkdownImageViewerDebug('viewer-paste-persisted', {
      documentPath,
      imagePath: persisted.imagePath,
      markdown: persisted.markdown,
      nextSelection
    });
    emit('update:modelValue', nextValue);
  } catch {
    // Fail closed: keep the existing markdown unchanged if persistence fails.
    logMarkdownImageViewerDebug('viewer-paste-failed', {
      documentPath
    });
  }
}

function resolveViewerPasteSelection(): { start: number; end: number } {
  if (!editorRoot.value) {
    return { start: props.modelValue.length, end: props.modelValue.length };
  }

  const snapshot = captureRenderableMarkdownSelection(editorRoot.value);
  const resolved = snapshot ? resolveMarkdownSourceSelection(props.modelValue, snapshot) : null;
  logMarkdownImageViewerDebug('resolve-viewer-paste-selection', {
    documentPath: props.activeDocument?.path ?? props.activePath,
    snapshot,
    resolved,
    sourcePreview: props.modelValue.slice(0, 240)
  });
  if (resolved) {
    return resolved;
  }

  return { start: props.modelValue.length, end: props.modelValue.length };
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
  scrollToSearchMatch,
  applyLinkInViewer,
  insertMarkdownLink,
  insertMarkdownConversationLink,
  insertMarkdownSnippet,
  insertMarkdownInViewer,
  toggleHighlightInViewer,
  toggleMarkInViewer
});

// viewer(WYSIWYG) 原地编辑后，Milkdown 的 markdownUpdated 监听是异步触发的，
// 若用户在监听回调前就切到源码模式（mode-switch 读的是 props.modelValue），
// 刚插入的内容会丢失。这里在原地编辑成功后立即把编辑器实时 markdown 同步回
// modelValue，使其不依赖异步监听的时序。
function flushViewerEditToModel(applied: boolean): boolean {
  if (!applied || !editor) {
    return applied;
  }

  const next = readMarkdownDocument(editor);
  if (typeof next === 'string' && next !== props.modelValue) {
    lastKnownMarkdown = next;
    emit('update:modelValue', next);
  }
  return applied;
}

function insertMarkdownInViewer(markdown: string): boolean {
  if (!editor) {
    console.warn('[markdown-viewer] insertMarkdownInViewer: no milkdown editor');
    return false;
  }
  return flushViewerEditToModel(insertMarkdownAtViewerSelection(editor, markdown));
}

function toggleHighlightInViewer(): boolean {
  if (!editor) {
    console.warn('[markdown-viewer] toggleHighlightInViewer: no milkdown editor');
    return false;
  }
  return flushViewerEditToModel(toggleMarkdownHighlightAtViewerSelection(editor));
}

function toggleMarkInViewer(markName: string): boolean {
  if (!editor) {
    console.warn('[markdown-viewer] toggleMarkInViewer: no milkdown editor');
    return false;
  }
  return flushViewerEditToModel(toggleMarkAtViewerSelection(editor, markName));
}

function applyLinkInViewer(input: { label: string; href: string }): boolean {
  if (!editor) {
    console.warn('[markdown-viewer] applyLinkInViewer: no milkdown editor');
    return false;
  }
  return flushViewerEditToModel(applyMarkdownLinkAtViewerSelection(editor, input));
}

function getViewerScrollContainer(): HTMLElement | null {
  return scrollShellRef.value;
}

function captureViewerScrollTop(): number | null {
  const container = getViewerScrollContainer();
  return container ? container.scrollTop : null;
}

function restoreViewerScrollTop(target = pendingViewerScrollTop, reason: 'mode-switch' | 'content-sync' = 'content-sync') {
  if (target === null) {
    logMarkdownViewerDebug('restore-viewer-scroll-top-skipped', {
      reason: 'no-pending-scroll-top',
      activePath: props.activePath,
      documentPath: props.activeDocument?.path ?? props.activePath
    });
    return;
  }
  if (pendingViewerScrollTop === target) {
    pendingViewerScrollTop = null;
  }
  if (pendingModeSwitchViewerScrollTop === target) {
    pendingModeSwitchViewerScrollTop = null;
  }
  const applyScrollRestore = (remainingFrames: number) => {
    const container = getViewerScrollContainer();
    if (container) {
      container.scrollTop = target;
    }
    logMarkdownViewerDebug('restore-viewer-scroll-top', {
      reason,
      target,
      remainingFrames,
      currentScrollTop: container?.scrollTop ?? null,
      activePath: props.activePath,
      documentPath: props.activeDocument?.path ?? props.activePath
    });
    if (remainingFrames <= 0) {
      return;
    }
    requestAnimationFrame(() => {
      applyScrollRestore(remainingFrames - 1);
    });
  };
  requestAnimationFrame(() => {
    applyScrollRestore(3);
  });
}

function preserveViewerScrollDuring(update: () => void) {
  if (!isMarkdownDocument.value || props.markdownViewerMode !== 'viewer') {
    update();
    return;
  }

  pendingViewerScrollTop = captureViewerScrollTop();
  update();
  restoreViewerScrollTop(pendingViewerScrollTop, 'content-sync');
}

function insertMarkdownLink(input: { label: string; href: string }): boolean {
  if (props.markdownViewerMode === 'viewer') {
    return applyLinkInViewer(input);
  }
  return insertMarkdownSnippet({
    buildReplacement: (selectedText) => {
      const label = selectedText || input.label;
      return `[${label}](${input.href})`;
    }
  });
}

function insertMarkdownSnippet(input: {
  markdown?: string;
  buildReplacement?: (selectedText: string) => string;
  resolveCaret?: (input: {
    selectionStart: number;
    selectedText: string;
    replacement: string;
  }) => { start: number; end: number };
}): boolean {
  if (!isMarkdownEditMode.value || !markdownSourceRef.value) {
    return false;
  }

  const textarea = markdownSourceRef.value;
  const hasFocus = document.activeElement === textarea;
  const useRememberedSelection = preferRememberedMarkdownSelection && !!lastMarkdownSelection;
  const rememberedSelection = useRememberedSelection || !hasFocus
    ? lastMarkdownSelection
    : null;
  const selectionStart = rememberedSelection
    ? rememberedSelection.start
    : hasFocus
    ? (textarea.selectionStart ?? 0)
    : textarea.value.length;
  const selectionEnd = rememberedSelection
    ? rememberedSelection.end
    : hasFocus
    ? (textarea.selectionEnd ?? selectionStart)
    : selectionStart;
  const selectedText = textarea.value.slice(selectionStart, selectionEnd);
  const replacement = input.buildReplacement
    ? input.buildReplacement(selectedText)
    : (input.markdown ?? '');
  const nextValue = `${textarea.value.slice(0, selectionStart)}${replacement}${textarea.value.slice(selectionEnd)}`;
  lastKnownMarkdown = nextValue;
  const nextSelection = input.resolveCaret?.({
    selectionStart,
    selectedText,
    replacement
  }) ?? {
    start: selectionStart + replacement.length,
    end: selectionStart + replacement.length
  };
  lastMarkdownSelection = nextSelection;
  preferRememberedMarkdownSelection = false;
  emit('update:modelValue', nextValue);

  const restoreSelection = () => {
    textarea.focus();
    textarea.setSelectionRange(nextSelection.start, nextSelection.end);
  };

  nextTick(() => {
    restoreSelection();
    void nextTick().then(() => {
      restoreSelection();
    });
  });

  return true;
}

function insertMarkdownConversationLink(input: { label: string; conversationId: string }): boolean {
  return insertMarkdownLink({
    label: input.label,
    href: buildMarkdownConversationLinkHref(input.conversationId)
  });
}

function applyViewerImageRatio(payload: { src: string; ratio: number }) {
  const documentPath = props.activeDocument?.path ?? props.activePath;
  if (!documentPath) {
    return;
  }

  const match = findResizableMarkdownImageSource(props.modelValue, payload.src, documentPath);
  logMarkdownImageViewerDebug('apply-ratio', {
    documentPath,
    src: payload.src,
    ratio: payload.ratio,
    match
  });
  if (!match) {
    return;
  }

  const nextValue = rewriteMarkdownImageRatio(props.modelValue, match, payload.ratio);
  logMarkdownImageViewerDebug('apply-ratio-result', {
    documentPath,
    src: payload.src,
    ratio: payload.ratio,
    changed: nextValue !== props.modelValue,
    sourcePreview: props.modelValue.slice(0, 240),
    nextValuePreview: nextValue.slice(0, 240)
  });
  if (nextValue === props.modelValue) {
    return;
  }

  emit('update:modelValue', nextValue);
}

async function teardownEditor() {
  creationToken += 1;
  const teardownToken = creationToken;
  const currentEditor = editor;
  traceEditorLifecycle('teardown-begin', {
    teardownToken,
    hadEditor: !!currentEditor,
    isCreatingEditor,
    rootChildCount: editorRoot.value?.childElementCount ?? null,
    activePath: props.activePath
  });
  resetEditorSyncState('teardown-editor', {
    teardownToken,
    hadEditor: !!currentEditor
  });
  editor = null;
  activeEditorMode = null;
  lastKnownMarkdown = '';
  viewerPasteAbortController?.abort();
  viewerPasteAbortController = null;
  logMarkdownViewerDebug('teardown-editor-start', {
    token: teardownToken,
    activePath: props.activePath,
    documentPath: props.activeDocument?.path ?? props.activePath,
    navigatingAway: isNavigatingAwayFromViewer,
    hadEditor: !!currentEditor
  });

  await destroyMarkdownEditor(currentEditor);
  if (editorRoot.value) {
    editorRoot.value.innerHTML = '';
  }
  traceEditorLifecycle('teardown-cleared-dom', {
    teardownToken,
    isCreatingEditor,
    rootChildCount: editorRoot.value?.childElementCount ?? null
  });
  logMarkdownViewerDebug('teardown-editor-done', {
    token: teardownToken,
    activePath: props.activePath,
    navigatingAway: isNavigatingAwayFromViewer
  });
  isNavigatingAwayFromViewer = false;
  lastViewerNavigationTarget = null;
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

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block) {
  margin: 0.12em 0;
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block > .list-item) {
  display: grid;
  grid-template-columns: 1.35em minmax(0, 1fr);
  column-gap: 0.48em;
  align-items: start;
  margin: 0;
  padding: 0;
  list-style: none;
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block > .list-item::marker) {
  content: '';
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 1.35em;
  width: 1.35em;
  min-height: 1.75em;
  color: rgba(226, 232, 240, 0.8);
  pointer-events: none;
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper .label) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1em;
  height: 1.1em;
  color: inherit;
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper .label.bullet) {
  color: rgba(226, 232, 240, 0.72);
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper .label.ordered) {
  width: auto;
  height: auto;
  font-size: 0.95em;
  font-variant-numeric: tabular-nums;
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper .label.unchecked),
.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper .label.checked) {
  width: 1.15em;
  height: 1.15em;
  border-radius: 0.22em;
  color: rgba(226, 232, 240, 0.92);
  background: rgba(15, 23, 42, 0.82);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.34);
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper .label.checked) {
  color: #7dd3fc;
  box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.44);
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper .label svg) {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .children) {
  min-width: 0;
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .children > .content-dom) {
  min-width: 0;
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .children > .content-dom > p) {
  margin: 0;
  min-height: 1.75em;
}

.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .children > .content-dom > ul),
.editor-input :deep(.milkdown .ProseMirror .milkdown-list-item-block .children > .content-dom > ol) {
  margin-top: 0.2em;
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

.editor-input :deep(.milkdown .ProseMirror del) {
  color: rgba(226, 232, 240, 0.38);
  text-decoration-color: rgba(226, 232, 240, 0.3);
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

.editor-input :deep(.milkdown .ProseMirror mark),
.editor-input :deep(.milkdown .ProseMirror .markdown-highlight) {
  border-radius: 0.2em;
  padding: 0 0.08em;
  color: inherit;
  background: linear-gradient(180deg, rgba(250, 204, 21, 0.78) 0%, rgba(251, 191, 36, 0.58) 100%);
  box-shadow: inset 0 -1px 0 rgba(120, 53, 15, 0.2);
}

.editor-input :deep(.markdown-image-resize-frame) {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  vertical-align: top;
  user-select: none;
  -webkit-user-select: none;
}

.editor-input :deep(.markdown-image-resize-frame img) {
  max-width: 100%;
  height: auto;
}

.editor-input :deep(.markdown-image-resize-handle) {
  position: absolute;
  right: -8px;
  bottom: -8px;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid rgba(125, 211, 252, 0.72);
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.9);
  box-shadow: 0 2px 10px rgba(8, 47, 73, 0.35);
  cursor: nwse-resize;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.editor-input :deep(.markdown-image-resize-frame--active .markdown-image-resize-handle) {
  background: rgba(56, 189, 248, 1);
}
</style>
