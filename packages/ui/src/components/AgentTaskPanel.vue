<template>
  <section class="agent-task-panel" data-testid="agent-task-panel">
    <TaskListPanel
      v-if="scope"
      :context-provider="props.contextProvider"
      :document-path="scope.documentPath"
      :agent-key="scope.agentKey"
      tag="all"
    />
    <p v-else class="agent-task-panel__message" data-testid="agent-task-empty">
      {{ t('shared.noTasks') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IContextProvider } from '@packages/core/src';
import { useWorkspaceI18n } from '../i18n';
import TaskListPanel from './TaskListPanel.vue';

const props = defineProps<{
  activeAgentKey?: string | null;
  activePath?: string | null;
  selectedNodePath?: string | null;
  activeDocument?: { path: string } | null;
  contextProvider?: IContextProvider | null;
}>();

const { t } = useWorkspaceI18n();

const activeDocumentPath = computed(() => props.activeDocument?.path?.trim() || '');
const activeAgentKey = computed(() => props.activeAgentKey?.trim() || '');
const scope = computed(() => {
  if (activeDocumentPath.value) {
    return {
      documentPath: activeDocumentPath.value,
      agentKey: activeAgentKey.value || null
    };
  }

  if (activeAgentKey.value) {
    return {
      documentPath: null,
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
}

.agent-task-panel__message {
  margin: 0;
  font-size: 12px;
}
</style>
