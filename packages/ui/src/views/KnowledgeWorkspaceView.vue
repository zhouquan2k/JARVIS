<template>
  <section class="knowledge-shell" data-testid="knowledge-workspace">
    <div
      ref="shellRef"
      class="knowledge-grid"
      :style="{ gridTemplateColumns: `minmax(0, calc((100% - 8px) * ${panelSizes[0]} / 100)) 4px minmax(0, calc((100% - 8px) * ${panelSizes[1]} / 100)) 4px minmax(0, calc((100% - 8px) * ${panelSizes[2]} / 100))` }"
    >
      <div class="grid-pane">
        <KnowledgeFileTree
          :nodes="knowledgeStore.nodes"
          :expanded-paths="knowledgeStore.expandedPaths"
          :active-path="knowledgeStore.selectedNodePath"
          :current-error="knowledgeStore.currentError"
          @open="knowledgeStore.openNode"
          @create="knowledgeStore.createNode"
        />
      </div>
      <div
        class="resize-handle"
        data-testid="knowledge-resize-left"
        @pointerdown="startResize(0, $event)"
      />
      <div class="grid-pane">
        <KnowledgeEditorPane
          :active-path="knowledgeStore.activePath"
          :model-value="draftContent"
          :is-saving="knowledgeStore.isSaving"
          :latest-file-change="knowledgeStore.latestFileChange"
          :diff-entries="knowledgeStore.activeDiffEntries"
          :can-undo="knowledgeStore.canUndoActiveFile"
          :can-redo="knowledgeStore.canRedoActiveFile"
          @update:model-value="onDraftChange"
          @save="knowledgeStore.flushActiveDocument"
          @undo-change="knowledgeStore.undoActiveFileChange"
          @redo-change="knowledgeStore.redoActiveFileChange"
        />
      </div>
      <div
        class="resize-handle"
        data-testid="knowledge-resize-right"
        @pointerdown="startResize(1, $event)"
      />
      <div class="grid-pane">
        <slot name="assistant-pane">
          <KnowledgeAssistantPane
            :active-agent="knowledgeStore.activeAgent"
            :active-path="knowledgeStore.activePath"
            :active-document="activeAssistantDocument"
            :context-provider="props.contextProvider"
            :on-file-changed="knowledgeStore.recordFileChange"
            :agent-resolution-error="knowledgeStore.agentResolutionError"
            :is-resolving-agent="knowledgeStore.isResolvingAgent"
          />
        </slot>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { IContextProvider } from '@packages/core/src';
import KnowledgeAssistantPane from '../components/KnowledgeAssistantPane.vue';
import KnowledgeEditorPane from '../components/KnowledgeEditorPane.vue';
import KnowledgeFileTree from '../components/KnowledgeFileTree.vue';
import { useKnowledgeWorkspaceStore } from '../store/knowledgeWorkspace';

const props = withDefaults(defineProps<{
  contextProvider: IContextProvider;
  panelSizes?: [number, number, number];
}>(), {
  panelSizes: () => [20, 50, 30]
});

const knowledgeStore = useKnowledgeWorkspaceStore();
const shellRef = ref<HTMLElement | null>(null);
const panelSizes = computed(() => knowledgeStore.panelSizes);
const draftContent = computed(() => knowledgeStore.draftContent);
const activeAssistantDocument = computed(() => {
  if (!knowledgeStore.activePath) {
    return null;
  }

  return {
    path: knowledgeStore.activePath,
    content: knowledgeStore.draftContent
  };
});

watch(() => props.panelSizes, (value) => {
  knowledgeStore.setPanelSizes(value);
}, { immediate: true });

watch(() => props.contextProvider, async (provider) => {
  knowledgeStore.setContextProvider(provider);
  await knowledgeStore.hydrateWorkspace();
}, { immediate: true });

let cleanupResize: (() => void) | null = null;

function onDraftChange(markdown: string) {
  knowledgeStore.updateActiveDocument(markdown);
}

function startResize(handleIndex: 0 | 1, event: PointerEvent) {
  const shell = shellRef.value;
  if (!shell) {
    return;
  }

  event.preventDefault();
  const startX = event.clientX;
  const startSizes = [...knowledgeStore.panelSizes] as [number, number, number];
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

    knowledgeStore.setPanelSizes(nextSizes);
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
