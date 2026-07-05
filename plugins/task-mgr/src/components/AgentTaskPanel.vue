<template>
  <section class="agent-task-panel" data-testid="agent-task-panel">
    <TaskListPanel
      v-if="scope"
      ref="taskListRef"
      :document-path="scope.documentPath"
      :document-id="scope.documentId"
      :agent-key="scope.agentKey"
      :detail-key="props.workspaceDetailKey ?? null"
      tag="all"
    />
    <p v-else class="agent-task-panel__message" data-testid="agent-task-empty">
      {{ t('shared.noTasks') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { IContextProvider } from '@packages/core/src';
import { useWorkspaceI18n } from '@packages/ui';
import TaskListPanel from './TaskListPanel.vue';

const props = defineProps<{
  activeScopeKey?: string | null;
  activePath?: string | null;
  selectedNodePath?: string | null;
  activeDocument?: { path: string; documentId?: string } | null;
  contextProvider?: IContextProvider | null;
  workspaceDetailKey?: string | null;
}>();

const { t } = useWorkspaceI18n();
const taskListRef = ref<InstanceType<typeof TaskListPanel> | null>(null);

defineExpose({ openTaskCount: computed(() => taskListRef.value?.openTaskCount ?? 0) });

const activeDocumentPath = computed(() => props.activeDocument?.path?.trim() || '');
const activeAgentKey = computed(() => props.activeScopeKey?.trim() || '');
const scope = computed(() => {
  if (activeDocumentPath.value) {
    return {
      documentPath: activeDocumentPath.value,
      documentId: props.activeDocument?.documentId ?? undefined,
      agentKey: activeAgentKey.value || null
    };
  }

  if (activeAgentKey.value) {
    return {
      documentPath: null,
      documentId: undefined,
      agentKey: activeAgentKey.value
    };
  }

  return null;
});
</script>

<style scoped>
.agent-task-panel {
  padding: 14px;
  color: rgba(226, 232, 240, 0.88);
  overflow-y: auto;
  box-sizing: border-box;
}

.agent-task-panel__message {
  margin: 0;
  font-size: 12px;
}
</style>
