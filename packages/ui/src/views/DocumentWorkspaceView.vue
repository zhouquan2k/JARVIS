<template>
  <section class="knowledge-shell" data-testid="document-workspace">
    <div
      ref="shellRef"
      class="knowledge-grid"
      :style="{ gridTemplateColumns: `minmax(0, calc((100% - 8px) * ${panelSizes[0]} / 100)) 4px minmax(0, calc((100% - 8px) * ${panelSizes[1]} / 100)) 4px minmax(0, calc((100% - 8px) * ${panelSizes[2]} / 100))` }"
    >
      <div class="grid-pane">
        <DocumentFileTree
          :nodes="documentStore.nodes"
          :expanded-paths="documentStore.expandedPaths"
          :active-path="documentStore.selectedNodePath"
          :current-error="documentStore.currentError"
          @open="documentStore.openNode"
          @create="documentStore.createNode"
          @delete="documentStore.deleteNode"
          @rename="documentStore.renameNode"
          @refresh="documentStore.refreshTree"
        />
      </div>
      <div
        class="resize-handle"
        data-testid="document-resize-left"
        @pointerdown="startResize(0, $event)"
      />
      <div class="grid-pane">
        <DocumentEditorPane
          :active-path="documentStore.activePath"
          :active-document="documentStore.activeDocument"
          :active-viewer-id="documentStore.activeViewerId"
          :active-pane-mode="documentStore.activePaneMode"
          :model-value="draftContent"
          :is-saving="documentStore.isSaving"
          :latest-file-change="documentStore.latestFileChange"
          :diff-entries="documentStore.activeDiffEntries"
          :can-undo="documentStore.canUndoActiveFile"
          :can-redo="documentStore.canRedoActiveFile"
          @update:model-value="onDraftChange"
          @save="documentStore.flushActiveDocument"
          @undo-change="documentStore.undoActiveFileChange"
          @redo-change="documentStore.redoActiveFileChange"
        />
      </div>
      <div
        class="resize-handle"
        data-testid="document-resize-right"
        @pointerdown="startResize(1, $event)"
      />
      <div class="grid-pane">
        <slot name="assistant-pane">
          <AgentPane
            :active-agent="documentStore.activeAgent"
            :active-path="documentStore.activePath"
            :active-document="activeAssistantDocument"
            :context-provider="props.contextProvider"
            :on-file-changed="handleAssistantFileChanged"
            :agent-resolution-error="documentStore.agentResolutionError"
            :is-resolving-agent="documentStore.isResolvingAgent"
          />
        </slot>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { encodeTextDocument, type IContextProvider } from '@packages/core/src';
import AgentPane from '../components/AgentPane.vue';
import DocumentEditorPane from '../components/DocumentEditorPane.vue';
import DocumentFileTree from '../components/DocumentFileTree.vue';
import { useDocumentWorkspaceStore } from '../store/documentWorkspace';

const props = withDefaults(defineProps<{
  contextProvider: IContextProvider;
  panelSizes?: [number, number, number];
}>(), {
  panelSizes: () => [20, 50, 30]
});

const documentStore = useDocumentWorkspaceStore();
const shellRef = ref<HTMLElement | null>(null);
const panelSizes = computed(() => documentStore.panelSizes);
const draftContent = computed(() => documentStore.draftContent);
const activeAssistantDocument = computed(() => {
  if (!documentStore.activeDocument) {
    return null;
  }

  if (!documentStore.activeViewerCapabilities?.edit) {
    return documentStore.activeDocument;
  }

  return {
    ...documentStore.activeDocument,
    dataBase64: encodeTextDocument(documentStore.draftContent)
  };
});

watch(() => props.panelSizes, (value) => {
  documentStore.setPanelSizes(value);
}, { immediate: true });

watch(() => props.contextProvider, async (provider) => {
  documentStore.setContextProvider(provider);
  await documentStore.hydrateWorkspace();
}, { immediate: true });

let cleanupResize: (() => void) | null = null;

function onDraftChange(markdown: string) {
  documentStore.updateActiveDocument(markdown);
}

function handleAssistantFileChanged(change: { path: string; beforeContent: string; afterContent: string }) {
  void documentStore.recordFileChange(change);
}

function startResize(handleIndex: 0 | 1, event: PointerEvent) {
  const shell = shellRef.value;
  if (!shell) {
    return;
  }

  event.preventDefault();
  const startX = event.clientX;
  const startSizes = [...documentStore.panelSizes] as [number, number, number];
  const shellWidth = shell.getBoundingClientRect().width;

  const onMove = (moveEvent: PointerEvent) => {
    const deltaPercent = ((moveEvent.clientX - startX) / shellWidth) * 100;
    const nextSizes = [...startSizes] as [number, number, number];

    if (handleIndex === 0) {
      nextSizes[0] = startSizes[0] + deltaPercent;
      nextSizes[1] = startSizes[1] - deltaPercent;
    } else {
      nextSizes[1] = startSizes[1] + deltaPercent;
      nextSizes[2] = startSizes[2] - deltaPercent;
    }

    documentStore.setPanelSizes(nextSizes);
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    cleanupResize = null;
  };

  cleanupResize?.();
  cleanupResize = onUp;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

onBeforeUnmount(() => {
  cleanupResize?.();
});
</script>

<style scoped>
.knowledge-shell {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.12), transparent 24%),
    radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.1), transparent 20%),
    linear-gradient(180deg, #060b12, #0b1220);
}

.knowledge-grid {
  display: grid;
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow: hidden;
}

.grid-pane {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.resize-handle {
  cursor: col-resize;
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.28), rgba(14, 165, 233, 0.18));
}

.resize-handle:hover {
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.5), rgba(14, 165, 233, 0.4));
}
</style>
