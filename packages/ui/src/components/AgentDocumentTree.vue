<template>
  <div class="agent-document-tree" data-testid="agent-document-tree">
    <div
      v-for="node in nodes"
      :key="node.path"
      class="agent-document-tree__node"
      :class="{ 'agent-document-tree__node--directory': node.kind === 'directory' }"
    >
      <button
        v-if="node.kind === 'file'"
        type="button"
        class="agent-document-tree__item"
        data-testid="agent-view-document"
        @click="emit('open-document', node.path)"
      >
        <span>{{ node.name }}</span>
      </button>

      <div v-else class="agent-document-tree__directory">
        <div class="agent-document-tree__directory-label">
          <span>{{ node.name }}</span>
        </div>
        <div v-if="node.children?.length" class="agent-document-tree__children">
          <AgentDocumentTree
            :nodes="node.children"
            @open-document="emit('open-document', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ContextNode } from '@packages/core/src';

defineOptions({
    name: 'AgentDocumentTree'
});

defineProps<{
    nodes: ContextNode[];
}>();

const emit = defineEmits<{
    (event: 'open-document', path: string): void;
}>();
</script>

<style scoped>
.agent-document-tree {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-document-tree__node {
  min-width: 0;
}

.agent-document-tree__directory {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-document-tree__directory-label {
  display: flex;
  align-items: center;
  min-height: 38px;
  padding: 10px 4px;
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 600;
}

.agent-document-tree__children {
  padding-left: 16px;
  border-left: 1px solid rgba(148, 163, 184, 0.16);
}

.agent-document-tree__item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  padding: 10px 4px;
  border: 0;
  border-radius: 8px;
  color: #e2e8f0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.agent-document-tree__item span {
  min-width: 0;
}

.agent-document-tree__item:hover,
.agent-document-tree__item:focus-visible {
  background: rgba(148, 163, 184, 0.1);
}
</style>
