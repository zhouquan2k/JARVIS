<template>
  <section class="editor-pane" data-testid="document-editor">
    <header class="editor-header">
      <div class="editor-meta">
        <span class="editor-path" data-testid="document-editor-title">{{ editorTitleLabel }}</span>
      </div>
      <div class="editor-actions">
        <div v-if="showMarkdownStylePicker" class="editor-link-picker">
          <button
            type="button"
            class="save-button save-button--link-picker"
            data-testid="markdown-style-picker-trigger"
            :title="t('shared.insertMarkdownStyle')"
            :aria-label="t('shared.insertMarkdownStyle')"
            :aria-expanded="isStylePickerOpen ? 'true' : 'false'"
            @mousedown.prevent
            @click="toggleMarkdownStylePicker"
          >
            <Highlighter class="save-icon" :size="18" aria-hidden="true" />
          </button>
          <div
            v-if="isStylePickerOpen"
            class="editor-link-menu"
            data-testid="markdown-style-picker"
          >
            <button
              type="button"
              class="editor-link-option"
              data-testid="markdown-style-option-highlight"
              @mousedown.prevent
              @click="insertMarkdownStyle('highlight')"
            >
              <Highlighter class="editor-link-option-icon" :size="14" aria-hidden="true" />
              {{ t('shared.markdownStyleHighlight') }}
            </button>
            <button
              type="button"
              class="editor-link-option"
              data-testid="markdown-style-option-bold"
              @mousedown.prevent
              @click="insertMarkdownStyle('bold')"
            >
              <Bold class="editor-link-option-icon" :size="14" aria-hidden="true" />
              {{ t('shared.markdownStyleBold') }}
            </button>
            <button
              type="button"
              class="editor-link-option"
              data-testid="markdown-style-option-strikethrough"
              @mousedown.prevent
              @click="insertMarkdownStyle('strikethrough')"
            >
              <Strikethrough class="editor-link-option-icon" :size="14" aria-hidden="true" />
              {{ t('shared.markdownStyleStrikethrough') }}
            </button>
          </div>
        </div>
        <div v-if="showMarkdownLinkPicker" class="editor-link-picker">
          <button
            type="button"
            class="save-button save-button--link-picker"
            data-testid="markdown-insert-link"
            :title="t('shared.insertMarkdownLink')"
            :aria-label="t('shared.insertMarkdownLink')"
            :aria-expanded="isLinkPickerOpen ? 'true' : 'false'"
            :disabled="!canInsertAnyLink"
            @mousedown.prevent
            @click="toggleLinkPicker"
          >
            <Link2 class="save-icon" :size="18" aria-hidden="true" />
          </button>
          <div
            v-if="isLinkPickerOpen"
            class="editor-link-menu"
            data-testid="markdown-link-picker"
          >
            <div class="editor-link-tabs" role="tablist" :aria-label="t('shared.insertMarkdownLink')">
              <button
                type="button"
                class="editor-link-tab"
                :class="{ 'editor-link-tab--active': activeLinkPickerTab === 'document' }"
                data-testid="markdown-link-tab-document"
                role="tab"
                :aria-selected="activeLinkPickerTab === 'document' ? 'true' : 'false'"
                @mousedown.prevent
                @click="setLinkPickerTab('document')"
              >
                {{ t('shared.markdownLinkTabDocuments') }}
              </button>
              <button
                type="button"
                class="editor-link-tab"
                :class="{ 'editor-link-tab--active': activeLinkPickerTab === 'resource' }"
                data-testid="markdown-link-tab-resource"
                role="tab"
                :aria-selected="activeLinkPickerTab === 'resource' ? 'true' : 'false'"
                @mousedown.prevent
                @click="setLinkPickerTab('resource')"
              >
                {{ t('shared.markdownLinkTabResources') }}
              </button>
              <button
                v-for="insertLinkType in props.insertLinkTypes"
                :key="insertLinkType.id"
                type="button"
                class="editor-link-tab"
                :class="{ 'editor-link-tab--active': activeLinkPickerTab === insertLinkType.id }"
                :data-testid="`markdown-link-tab-${insertLinkType.id}`"
                role="tab"
                :aria-selected="activeLinkPickerTab === insertLinkType.id ? 'true' : 'false'"
                @mousedown.prevent
                @click="setLinkPickerTab(insertLinkType.id)"
              >
                {{ insertLinkType.titleKey ? t(insertLinkType.titleKey) : insertLinkType.title }}
              </button>
            </div>
            <p
              v-if="linkInsertionPointMissing"
              class="editor-link-hint"
              data-testid="markdown-link-insertion-point-hint"
              role="status"
            >
              {{ t('shared.markdownLinkInsertionPointRequired') }}
            </p>
            <div v-if="activeLinkPickerTab === 'document'" data-testid="markdown-link-panel-document">
              <button
                v-for="node in props.linkableMarkdownDocuments"
                :key="node.path"
                type="button"
                class="editor-link-option"
                :data-testid="`markdown-link-option-${node.path}`"
                @mousedown.prevent
                @click="insertMarkdownLink(node.path)"
              >
                {{ getContextNodeDisplayName(node.name) }}
              </button>
              <p v-if="props.linkableMarkdownDocuments.length === 0" class="editor-link-empty" data-testid="markdown-link-empty-document">
                {{ t('shared.noMarkdownLinkTargets') }}
              </p>
            </div>
            <div
              v-else-if="activeInsertLinkType"
              :data-testid="`markdown-link-panel-${activeInsertLinkType.id}`"
            >
              <button
                v-for="item in activeInsertLinkType.items"
                :key="item.id"
                type="button"
                class="editor-link-option"
                :data-testid="`markdown-insert-link-option-${activeInsertLinkType.id}-${item.id}`"
                @mousedown.prevent
                @click="insertDynamicLinkItem(activeInsertLinkType.id, item.id)"
              >
                <MessageSquareQuote class="editor-link-option-icon" :size="14" aria-hidden="true" />
                {{ item.title }}
              </button>
              <p
                v-if="activeInsertLinkType.items.length === 0"
                class="editor-link-empty"
                :data-testid="`markdown-link-empty-${activeInsertLinkType.id}`"
              >
                {{ t('shared.noMarkdownLinkTargets') }}
              </p>
            </div>
            <div v-else data-testid="markdown-link-panel-resource">
              <button
                v-if="props.uploadMarkdownLinkResource && props.activePath"
                type="button"
                class="editor-link-option editor-link-option--upload"
                data-testid="markdown-resource-upload"
                @mousedown.prevent
                @click="triggerResourceUpload"
              >
                <Upload class="editor-link-option-icon" :size="14" aria-hidden="true" />
                {{ t('shared.uploadLinkResource') }}
              </button>
              <button
                v-for="resource in props.linkableReferenceResources"
                :key="resource.path"
                type="button"
                class="editor-link-option"
                :data-testid="`markdown-resource-link-option-${resource.path}`"
                @mousedown.prevent
                @click="insertResourceLink(resource.path)"
              >
                {{ getContextNodeDisplayName(resource.name) }}
              </button>
              <p v-if="props.linkableReferenceResources.length === 0" class="editor-link-empty" data-testid="markdown-link-empty-resource">
                {{ t('shared.noMarkdownLinkTargets') }}
              </p>
            </div>
          </div>
        </div>
        <button
          v-if="isMarkdownDocument"
          type="button"
          class="save-button save-button--mode-toggle"
          data-testid="markdown-mode-toggle"
          :class="{ 'save-button--active': markdownViewerMode === 'viewer' }"
          :title="markdownModeToggleLabel"
          :aria-label="markdownModeToggleLabel"
          :aria-pressed="markdownViewerMode === 'viewer'"
          @click="toggleMarkdownViewerMode"
        >
          <component
            :is="markdownViewerMode === 'viewer' ? PencilLine : Eye"
            class="save-icon"
            :size="18"
            aria-hidden="true"
          />
        </button>
        <button
          v-if="props.activePath"
          type="button"
          class="save-button"
          data-testid="document-refresh"
          :title="t('shared.refreshCurrentDocument')"
          :aria-label="t('shared.refreshCurrentDocument')"
          @click="emit('refresh-document')"
        >
          <RotateCcw class="save-icon" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="save-button"
          :class="{ 'save-button--dirty': isDirty, 'save-button--saving': isSaving }"
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
        <button
          type="button"
          class="save-button save-button--pane-toggle"
          data-testid="document-middle-pane-toggle"
          :title="middlePaneToggleLabel"
          :aria-label="middlePaneToggleLabel"
          @click="emit('toggle-middle-pane-mode')"
        >
          <component
            :is="props.middlePaneMode === 'maximized' ? Minimize2 : Maximize2"
            class="save-icon"
            :size="18"
            aria-hidden="true"
          />
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

    <div v-if="isSearchOpen" class="viewer-search" data-testid="document-viewer-search">
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        class="viewer-search-input"
        data-testid="document-viewer-search-input"
        :placeholder="t('shared.documentSearchPlaceholder')"
        @input="updateViewerSearch"
        @keydown.enter.prevent="goToNextSearchMatch"
        @keydown.esc.prevent="closeViewerSearch"
      />
      <span class="viewer-search-count" data-testid="document-viewer-search-count">
        {{ t('shared.documentSearchMatchCount', { current: searchMatchCurrent, total: searchMatchCount }) }}
      </span>
      <button type="button" class="viewer-search-button" :aria-label="t('shared.previousMatch')" @click="goToPreviousSearchMatch">
        {{ t('shared.previousMatchShort') }}
      </button>
      <button type="button" class="viewer-search-button" :aria-label="t('shared.nextMatch')" @click="goToNextSearchMatch">
        {{ t('shared.nextMatchShort') }}
      </button>
      <button type="button" class="viewer-search-button" :aria-label="t('shared.closeSearch')" @click="closeViewerSearch">
        {{ t('shared.close') }}
      </button>
    </div>

    <div class="editor-content">
      <div v-if="activePaneMode === 'empty'" class="empty-state" data-testid="document-editor-empty">
        {{ t('shared.selectFile') }}
      </div>
      <div v-else class="editor-surface">
        <component
          :is="activeViewerComponent"
          v-if="activeViewerComponent"
          class="editor-viewer"
          :active-path="activePath"
          :active-document="activeDocument"
          :model-value="modelValue"
          :markdown-viewer-mode="markdownViewerMode"
          :latest-file-change="latestFileChange"
          :diff-entries="diffEntries"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :middle-pane-zoom="props.middlePaneZoom ?? 1"
          :persist-markdown-image="props.persistMarkdownImage"
          ref="markdownViewerRef"
          @update:model-value="emit('update:modelValue', $event)"
          @undo-change="emit('undo-change')"
          @redo-change="emit('redo-change')"
          @open-document-link="emit('open-document-link', $event)"
          @open-conversation-link="emit('open-conversation-link', $event)"
        />
        <div
          v-else
          class="unsupported-state"
          data-testid="document-unsupported-viewer"
        >
          {{ t('shared.unsupportedViewer', { mimeType: activeDocument?.mimeType ?? 'unknown' }) }}
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Bold, Eye, Highlighter, Link2, Maximize2, MessageSquareQuote, Minimize2, PencilLine, RotateCcw, Save, Strikethrough, Upload } from 'lucide-vue-next';
import type { ContextDocument, ContextNode } from '@packages/core/src';
import { useWorkspaceI18n } from '../i18n';
import { resolveDocumentViewer } from '../document-viewers';
import { buildMarkdownResourceInsertion, buildRelativeMarkdownLinkPath, type MarkdownConversationLinkTarget, type MarkdownViewerMode } from '../utils/markdownDocument';
import { openSingleFileDialog } from '../utils/fileDialog';
import type { FileChangeRecord, LineDiffEntry } from '../services/FileChangeService';
import type { DocumentViewerSearchHandle } from '../document-viewers/types';
import { getContextNodeDisplayName } from '../utils/contextNodePresentation';
import type { ResolvedInsertLinkType } from '../types/insertLink';

const props = withDefaults(defineProps<{
  activePath: string | null;
  activeAgentName?: string | null;
  activeDocument: ContextDocument | null;
  activeViewerId: string | null;
  activePaneMode: 'empty' | 'viewer' | 'unsupported';
  modelValue: string;
  linkableMarkdownDocuments?: ContextNode[];
  linkableReferenceResources?: ContextNode[];
  insertLinkTypes?: ResolvedInsertLinkType[];
  isSaving: boolean;
  isDirty?: boolean;
  persistMarkdownImage?: (input: {
    documentPath: string;
    mimeType: string;
    bytes: Uint8Array;
  }) => Promise<{ imagePath: string; markdown: string }>;
  uploadMarkdownLinkResource?: (input: {
    documentPath: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }) => Promise<{ resourcePath: string }>;
  middlePaneMode?: 'default' | 'maximized';
  middlePaneZoom?: number;
  latestFileChange: FileChangeRecord | null;
  diffEntries: LineDiffEntry[];
  canUndo: boolean;
  canRedo: boolean;
}>(), {
  isDirty: false,
  linkableMarkdownDocuments: () => [],
  linkableReferenceResources: () => [],
  insertLinkTypes: () => [],
  middlePaneZoom: 1
});
const { t } = useWorkspaceI18n();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'save'): void;
  (event: 'toggle-middle-pane-mode'): void;
  (event: 'undo-change'): void;
  (event: 'redo-change'): void;
  (event: 'open-document-link', path: string): void;
  (event: 'open-conversation-link', target: MarkdownConversationLinkTarget): void;
  (event: 'refresh-document'): void;
}>();

const activePathLabel = computed(() => {
  if (!props.activePath) {
    return t('shared.noSelectedFile');
  }

  const segments = props.activePath.split('/').filter(Boolean);
  return getContextNodeDisplayName(segments[segments.length - 1] ?? props.activePath);
});
const editorTitleLabel = computed(() => {
  const activeAgentName = props.activeAgentName?.trim() || '';
  if (!activeAgentName) {
    return activePathLabel.value;
  }

  if (!props.activePath) {
    return activeAgentName;
  }

  return `${activeAgentName} / ${activePathLabel.value}`;
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

  if (props.isSaving) {
    return t('shared.saving');
  }

  return props.isDirty ? t('shared.unsavedChanges') : t('shared.save');
});
const middlePaneToggleLabel = computed(() => {
  return props.middlePaneMode === 'maximized'
    ? t('shared.defaultMiddlePane')
    : t('shared.maximizeMiddlePane');
});
const markdownModeToggleLabel = computed(() => {
  return markdownViewerMode.value === 'viewer'
    ? t('shared.markdownEditMode')
    : t('shared.markdownViewerMode');
});
const isMarkdownDocument = computed(() => {
  return props.activeDocument?.mimeType === 'text/markdown';
});
const markdownViewerMode = ref<MarkdownViewerMode>('viewer');
const markdownViewerRef = ref<(Partial<DocumentViewerSearchHandle> & {
  applyLinkInViewer?: (input: { label: string; href: string }) => boolean;
  insertMarkdownLink?: (input: { label: string; href: string }) => boolean;
  insertMarkdownSnippet?: (input: {
    markdown?: string;
    buildReplacement?: (selectedText: string) => string;
    resolveCaret?: (input: {
      selectionStart: number;
      selectedText: string;
      replacement: string;
    }) => { start: number; end: number };
  }) => boolean;
  insertMarkdownInViewer?: (markdown: string) => boolean;
  toggleHighlightInViewer?: () => boolean;
  toggleMarkInViewer?: (markName: string) => boolean;
}) | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const isSearchOpen = ref(false);
const isStylePickerOpen = ref(false);
const isLinkPickerOpen = ref(false);
const activeLinkPickerTab = ref<string>('document');
const linkInsertionPointMissing = ref(false);
const searchQuery = ref('');
const activeSearchMatchIndex = ref(0);
const searchMatchCount = ref(0);
const activeViewerComponent = computed(() => {
  if (!props.activeDocument) {
    return null;
  }

  return resolveDocumentViewer(props.activeDocument)?.component ?? null;
});
const supportsViewerSearch = computed(() => props.activeDocument?.mimeType === 'text/markdown');
const showMarkdownLinkPicker = computed(() => {
  return isMarkdownDocument.value;
});
const showMarkdownStylePicker = computed(() => {
  return isMarkdownDocument.value;
});
const canInsertMarkdownLink = computed(() => {
  return isMarkdownDocument.value
    && props.linkableMarkdownDocuments.length > 0
    && !!props.activePath;
});
const canInsertReferenceResourceLink = computed(() => {
  return isMarkdownDocument.value
    && props.linkableReferenceResources.length > 0
    && !!props.activePath;
});
const canUploadReferenceResource = computed(() => {
  return isMarkdownDocument.value
    && !!props.uploadMarkdownLinkResource
    && !!props.activePath;
});
const canInsertDynamicLink = computed(() => {
  return isMarkdownDocument.value
    && props.insertLinkTypes.some((type) => type.items.length > 0)
    && !!props.activePath;
});
const canInsertAnyLink = computed(() => {
  return canInsertMarkdownLink.value
    || canInsertReferenceResourceLink.value
    || canUploadReferenceResource.value
    || canInsertDynamicLink.value;
});
const activeInsertLinkType = computed(() => {
  return props.insertLinkTypes.find((type) => type.id === activeLinkPickerTab.value) ?? null;
});
const searchMatchCurrent = computed(() => searchMatchCount.value === 0 ? 0 : activeSearchMatchIndex.value + 1);
const tooltipState = reactive({
  text: '',
  top: 0,
  left: 0,
  visible: false
});

watch(
  () => props.activeDocument?.mimeType,
  (mimeType) => {
    if (mimeType === 'text/markdown') {
      markdownViewerMode.value = 'viewer';
    }
    isLinkPickerOpen.value = false;
    isStylePickerOpen.value = false;
    activeLinkPickerTab.value = 'document';
    linkInsertionPointMissing.value = false;
    closeViewerSearch();
  },
  { immediate: true }
);

watch(
  () => props.activePath,
  () => {
    isLinkPickerOpen.value = false;
    isStylePickerOpen.value = false;
    activeLinkPickerTab.value = 'document';
    linkInsertionPointMissing.value = false;
  }
);

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
});

function toggleMarkdownViewerMode() {
  const nextMode: MarkdownViewerMode = markdownViewerMode.value === 'viewer' ? 'edit' : 'viewer';
  if (markdownViewerMode.value === nextMode) {
    return;
  }

  markdownViewerMode.value = nextMode;
}

function getViewerSearchHandle(): DocumentViewerSearchHandle | null {
  const candidate = markdownViewerRef.value;
  if (
    candidate
    && typeof candidate.setSearchQuery === 'function'
    && typeof candidate.setActiveSearchMatchIndex === 'function'
    && typeof candidate.getSearchMatchCount === 'function'
    && typeof candidate.scrollToSearchMatch === 'function'
  ) {
    return candidate as DocumentViewerSearchHandle;
  }

  return null;
}

function refreshSearchMatchCount() {
  searchMatchCount.value = getViewerSearchHandle()?.getSearchMatchCount() ?? 0;
}

function openViewerSearch() {
  if (!supportsViewerSearch.value) {
    return;
  }

  isSearchOpen.value = true;
  nextTick(() => {
    searchInputRef.value?.focus();
    updateViewerSearch();
  });
}

function closeViewerSearch() {
  isSearchOpen.value = false;
  searchQuery.value = '';
  activeSearchMatchIndex.value = 0;
  searchMatchCount.value = 0;
  getViewerSearchHandle()?.setSearchQuery('');
}

function updateViewerSearch() {
  const handle = getViewerSearchHandle();
  if (!handle) {
    return;
  }

  handle.setSearchQuery(searchQuery.value);
  activeSearchMatchIndex.value = 0;
  nextTick(() => {
    refreshSearchMatchCount();
    handle.scrollToSearchMatch(activeSearchMatchIndex.value);
  });
}

function goToNextSearchMatch() {
  refreshSearchMatchCount();
  if (searchMatchCount.value === 0) {
    return;
  }

  activeSearchMatchIndex.value = (activeSearchMatchIndex.value + 1) % searchMatchCount.value;
  getViewerSearchHandle()?.setActiveSearchMatchIndex(activeSearchMatchIndex.value);
  getViewerSearchHandle()?.scrollToSearchMatch(activeSearchMatchIndex.value);
}

function goToPreviousSearchMatch() {
  refreshSearchMatchCount();
  if (searchMatchCount.value === 0) {
    return;
  }

  activeSearchMatchIndex.value = (activeSearchMatchIndex.value - 1 + searchMatchCount.value) % searchMatchCount.value;
  getViewerSearchHandle()?.setActiveSearchMatchIndex(activeSearchMatchIndex.value);
  getViewerSearchHandle()?.scrollToSearchMatch(activeSearchMatchIndex.value);
}

function toggleLinkPicker() {
  isStylePickerOpen.value = false;
  if (!canInsertAnyLink.value) {
    return;
  }
  if (!isLinkPickerOpen.value) {
    if (canInsertMarkdownLink.value) {
      activeLinkPickerTab.value = 'document';
    } else if (canInsertReferenceResourceLink.value || canUploadReferenceResource.value) {
      activeLinkPickerTab.value = 'resource';
    } else {
      activeLinkPickerTab.value = props.insertLinkTypes[0]?.id ?? 'document';
    }
    linkInsertionPointMissing.value = false;
  }
  isLinkPickerOpen.value = !isLinkPickerOpen.value;
}

function toggleMarkdownStylePicker() {
  isLinkPickerOpen.value = false;
  linkInsertionPointMissing.value = false;
  isStylePickerOpen.value = !isStylePickerOpen.value;
}

function setLinkPickerTab(tab: string) {
  activeLinkPickerTab.value = tab;
  linkInsertionPointMissing.value = false;
}


function insertMarkdownLink(targetPath: string) {
  if (!props.activePath) {
    return;
  }

  const node = props.linkableMarkdownDocuments.find((candidate) => candidate.path === targetPath);
  if (!node) {
    return;
  }

  const href = buildRelativeMarkdownLinkPath(props.activePath, targetPath);
  const label = getContextNodeDisplayName(node.name);

  if (markdownViewerMode.value === 'viewer') {
    markdownViewerRef.value?.applyLinkInViewer?.({ label, href });
    isLinkPickerOpen.value = false;
    return;
  }

  const snippet = `[${label}](${href})`;
  insertMarkdownSnippetIntoDocument(snippet, () => markdownViewerRef.value?.insertMarkdownLink?.({ label, href }));
}

type MarkdownStyleId = 'highlight' | 'bold' | 'strikethrough';

interface MarkdownStyleDefinition {
  /** Milkdown/ProseMirror mark 名称，用于 viewer 模式下的原地 toggleMark。 */
  markName: string;
  /** edit 模式（纯 textarea）在源字符串上直接 splice 的包裹标记。 */
  open: string;
  close: string;
}

const markdownStyleDefinitions: Record<MarkdownStyleId, MarkdownStyleDefinition> = {
  highlight: { markName: 'highlight', open: '==', close: '==' },
  bold: { markName: 'strong', open: '**', close: '**' },
  strikethrough: { markName: 'strike_through', open: '~~', close: '~~' }
};

function insertMarkdownStyle(styleId: MarkdownStyleId) {
  const definition = markdownStyleDefinitions[styleId];

  // viewer 模式：与高亮原理一致，走 ProseMirror toggleMark 原地切换 mark，
  // 不切到 edit 源码模式、不做 viewer 光标 → 源码偏移的换算（见 ARCHITECTURE §4.1）。
  if (markdownViewerMode.value === 'viewer') {
    if (styleId === 'highlight') {
      markdownViewerRef.value?.toggleHighlightInViewer?.();
    } else {
      markdownViewerRef.value?.toggleMarkInViewer?.(definition.markName);
    }
    isStylePickerOpen.value = false;
    return;
  }

  // edit 模式（纯 textarea）：在源字符串上直接 splice 包裹标记。
  const { open, close } = definition;
  const buildReplacement = (selectedText: string) =>
    selectedText ? `${open}${selectedText}${close}` : `${open}${close}`;

  const resolveCaret = ({
    selectionStart,
    selectedText,
    replacement
  }: {
    selectionStart: number;
    selectedText: string;
    replacement: string;
  }) => {
    if (selectedText) {
      const end = selectionStart + replacement.length;
      return { start: end, end };
    }

    const caret = selectionStart + open.length;
    return { start: caret, end: caret };
  };

  linkInsertionPointMissing.value = false;
  void runMarkdownInsertion(
    () => markdownViewerRef.value?.insertMarkdownSnippet?.({
      buildReplacement,
      resolveCaret
    }),
    { closePicker: 'style' }
  );
}

function insertDynamicLinkItem(typeId: string, itemId: string) {
  const insertLinkType = props.insertLinkTypes.find((candidate) => candidate.id === typeId);
  const item = insertLinkType?.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    return;
  }

  const snippet = item.markdown;

  if (markdownViewerMode.value === 'viewer') {
    markdownViewerRef.value?.insertMarkdownInViewer?.(snippet);
    isLinkPickerOpen.value = false;
    return;
  }

  insertMarkdownSnippetIntoDocument(
    snippet,
    () => markdownViewerRef.value?.insertMarkdownSnippet?.({ markdown: snippet })
  );
}

function insertResourceLink(targetPath: string) {
  if (!props.activePath) {
    return;
  }

  const insertion = buildMarkdownResourceInsertion(props.activePath, targetPath);

  if (markdownViewerMode.value === 'viewer') {
    markdownViewerRef.value?.insertMarkdownInViewer?.(insertion.markdown);
    isLinkPickerOpen.value = false;
    return;
  }

  insertMarkdownSnippetIntoDocument(
    insertion.markdown,
    () => markdownViewerRef.value?.insertMarkdownSnippet?.({ markdown: insertion.markdown })
  );
}

async function triggerResourceUpload() {
  console.log('[resource-upload] triggerResourceUpload entered', {
    activePath: props.activePath,
    hasUploadHandler: !!props.uploadMarkdownLinkResource
  });
  try {
    const file = await openSingleFileDialog();
    console.log('[resource-upload] file dialog resolved', { hasFile: !!file, fileName: file?.name ?? null });
    if (!file || !props.activePath || !props.uploadMarkdownLinkResource) {
      console.log('[resource-upload] aborting: missing file/activePath/uploadHandler');
      return;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploaded = await props.uploadMarkdownLinkResource({
      documentPath: props.activePath,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      bytes
    });
    console.log('[resource-upload] upload succeeded', { resourcePath: uploaded.resourcePath });
    insertResourceLink(uploaded.resourcePath);
  } catch (error) {
    console.error('[resource-upload] triggerResourceUpload failed', error);
  }
}

function insertMarkdownSnippetIntoDocument(snippet: string, editModeAction: () => boolean | undefined) {
  linkInsertionPointMissing.value = false;
  void runMarkdownInsertion(editModeAction);
}

async function runMarkdownInsertion(
  action: () => boolean | undefined,
  options: { closePicker?: 'link' | 'style' } = {}
) {
  const previousModelValue = props.modelValue;
  if (markdownViewerMode.value !== 'edit') {
    markdownViewerMode.value = 'edit';
  }

  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await nextTick();
    const inserted = action() === true;
    if (!inserted) {
      continue;
    }

    for (let syncAttempt = 0; syncAttempt < maxAttempts; syncAttempt += 1) {
      await nextTick();
      const changed = props.modelValue !== previousModelValue;
      if (changed) {
        break;
      }
      if (syncAttempt === maxAttempts - 1) {
        console.warn('[document-editor] markdown insertion did not propagate to parent modelValue in time.', {
          activePath: props.activePath,
          activeTab: activeLinkPickerTab.value
        });
      }
    }

    if (options.closePicker !== 'style') {
      isLinkPickerOpen.value = false;
    }
    if (options.closePicker !== 'link') {
      isStylePickerOpen.value = false;
    }
    return;
  }

  console.warn('[document-editor] markdown insertion skipped because edit mode was not ready in time.', {
    activePath: props.activePath,
    activeTab: activeLinkPickerTab.value
  });
}

function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && canSave.value && !props.isSaving) {
    event.preventDefault();
    emit('save');
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && supportsViewerSearch.value) {
    event.preventDefault();
    openViewerSearch();
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

.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.editor-link-picker {
  position: relative;
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

.save-button--dirty:not(:disabled) {
  color: #facc15;
  background: rgba(250, 204, 21, 0.1);
}

.save-button--saving {
  color: #7dd3fc;
  background: rgba(14, 165, 233, 0.12);
}

.save-button--pane-toggle:not(:disabled) {
  color: rgba(226, 232, 240, 0.86);
}

.save-button--mode-toggle:not(:disabled) {
  color: rgba(226, 232, 240, 0.76);
}

.save-button--active:not(:disabled) {
  background: rgba(14, 165, 233, 0.16);
  color: #f8fafc;
}

.editor-link-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 10;
  display: flex;
  min-width: 260px;
  max-width: 320px;
  max-height: 260px;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  padding: 6px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.28);
}

.editor-link-tabs {
  display: flex;
  gap: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.editor-link-tab {
  border: 0;
  border-radius: 999px;
  padding: 6px 10px;
  color: #cbd5e1;
  background: rgba(30, 41, 59, 0.72);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.editor-link-tab--active {
  color: #e0f2fe;
  background: rgba(14, 165, 233, 0.18);
}

.editor-link-option {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  padding: 8px 10px;
  color: #e2e8f0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.editor-link-option:hover,
.editor-link-option:focus-visible {
  background: rgba(255, 255, 255, 0.08);
}

.editor-link-option--upload {
  margin-bottom: 8px;
  border: 1px solid rgba(56, 189, 248, 0.28);
  background: rgba(14, 165, 233, 0.12);
  color: #bae6fd;
  font-weight: 600;
}

.editor-link-option--upload:hover,
.editor-link-option--upload:focus-visible {
  background: rgba(14, 165, 233, 0.2);
}

.editor-link-option-icon {
  flex-shrink: 0;
}

.editor-link-empty {
  margin: 0;
  padding: 10px 8px;
  color: #94a3b8;
  font-size: 13px;
}

.editor-link-hint {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(248, 113, 113, 0.12);
  color: #fca5a5;
  font-size: 12px;
  line-height: 1.4;
}

.editor-content {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.editor-surface {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  transform-origin: top left;
}

.viewer-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.76);
}

.viewer-search-input {
  min-width: 160px;
  width: 220px;
  height: 30px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  padding: 0 10px;
  color: #e2e8f0;
  background: rgba(2, 6, 23, 0.48);
  font-size: 13px;
}

.viewer-search-count {
  color: rgba(226, 232, 240, 0.72);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.viewer-search-button {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  height: 30px;
  padding: 0 9px;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.7);
  font-size: 12px;
  cursor: pointer;
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

.empty-state,
.unsupported-state {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.empty-state {
  align-items: center;
  justify-content: center;
  color: rgba(226, 232, 240, 0.72);
  font-size: 14px;
}

.unsupported-state {
  align-items: center;
  justify-content: center;
  color: rgba(248, 250, 252, 0.84);
  font-size: 14px;
}

.editor-viewer {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
