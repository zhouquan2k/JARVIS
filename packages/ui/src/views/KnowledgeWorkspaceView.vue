<template>
  <section class="knowledge-shell" data-testid="knowledge-workspace">
    <div
      ref="shellRef"
      class="knowledge-grid"
      :style="{ gridTemplateColumns: `${panelSizes[0]}fr 8px ${panelSizes[1]}fr 8px ${panelSizes[2]}fr` }"
    >
      <KnowledgeFileTree
        :nodes="knowledgeStore.nodes"
        :expanded-paths="knowledgeStore.expandedPaths"
        :active-path="knowledgeStore.activePath"
        :current-error="knowledgeStore.currentError"
        @toggle="knowledgeStore.toggleExpanded"
        @open="knowledgeStore.openNode"
        @create="knowledgeStore.createNode"
      />
      <div
        class="resize-handle"
        data-testid="knowledge-resize-left"
        @pointerdown="startResize(0, $event)"
      />
      <KnowledgeEditorPane
        :active-path="knowledgeStore.activePath"
        :model-value="draftContent"
        :is-saving="knowledgeStore.isSaving"
        @update:model-value="onDraftChange"
        @save="knowledgeStore.flushActiveDocument"
      />
      <div
        class="resize-handle"
        data-testid="knowledge-resize-right"
        @pointerdown="startResize(1, $event)"
      />
      <slot name="assistant-pane">
        <KnowledgeAssistantPane />
      </slot>
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
  panelSizes: () => [22, 48, 30]
});

const knowledgeStore = useKnowledgeWorkspaceStore();
const shellRef = ref<HTMLElement | null>(null);
const panelSizes = computed(() => knowledgeStore.panelSizes);
const draftContent = computed(() => knowledgeStore.draftContent);

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
  height: 100%;
}

.resize-handle {
  cursor: col-resize;
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.28), rgba(14, 165, 233, 0.18));
}

.resize-handle:hover {
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.5), rgba(14, 165, 233, 0.4));
}
</style>
