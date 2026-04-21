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
    <component
      :is="activeViewerComponent"
      v-else-if="activeViewerComponent"
      class="editor-viewer"
      :active-path="activePath"
      :active-document="activeDocument"
      :model-value="modelValue"
      :markdown-viewer-mode="markdownViewerMode"
      :latest-file-change="latestFileChange"
      :diff-entries="diffEntries"
      :can-undo="canUndo"
      :can-redo="canRedo"
      @update:model-value="emit('update:modelValue', $event)"
      @undo-change="emit('undo-change')"
      @redo-change="emit('redo-change')"
    />
    <div
      v-else
      class="unsupported-state"
      data-testid="document-unsupported-viewer"
    >
      {{ t('shared.unsupportedViewer', { mimeType: activeDocument?.mimeType ?? 'unknown' }) }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Save } from 'lucide-vue-next';
import type { ContextDocument } from '@packages/core/src';
import { useWorkspaceI18n } from '../i18n';
import { resolveDocumentViewer } from '../document-viewers';
import type { MarkdownViewerMode } from '../utils/markdownDocument';
import type { FileChangeRecord, LineDiffEntry } from '../services/FileChangeService';

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
  return props.activeDocument?.mimeType === 'text/markdown';
});
const markdownViewerMode = ref<MarkdownViewerMode>('viewer');
const activeViewerComponent = computed(() => {
  if (!props.activeDocument) {
    return null;
  }

  return resolveDocumentViewer(props.activeDocument)?.component ?? null;
});
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
  },
  { immediate: true }
);

function switchMarkdownViewerMode(nextMode: MarkdownViewerMode) {
  if (markdownViewerMode.value === nextMode) {
    return;
  }

  markdownViewerMode.value = nextMode;
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

.mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.62);
  flex-shrink: 0;
}

.mode-switch-button {
  border: 0;
  border-radius: 999px;
  min-width: 72px;
  height: 28px;
  padding: 0 14px;
  color: rgba(226, 232, 240, 0.84);
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.mode-switch-button:hover,
.mode-switch-button:focus-visible,
.mode-switch-button.active {
  background: rgba(14, 165, 233, 0.26);
  color: #f8fafc;
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
