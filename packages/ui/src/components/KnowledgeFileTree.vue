<template>
  <aside class="file-tree" data-testid="knowledge-file-tree">
    <header class="tree-header">
      <div>
        <div class="tree-title">Knowledge</div>
        <div class="tree-subtitle">Markdown 文件浏览</div>
      </div>
      <div class="tree-actions">
        <button type="button" data-testid="knowledge-new-file" @click="createNode('file')">文件</button>
        <button type="button" data-testid="knowledge-new-directory" @click="createNode('directory')">目录</button>
      </div>
    </header>

    <div v-if="currentError" class="tree-error" data-testid="knowledge-error">
      {{ currentError }}
    </div>

    <div v-else class="tree-list">
      <button
        v-for="item in visibleNodes"
        :key="item.node.path"
        type="button"
        class="tree-row"
        :class="{ active: item.node.path === activePath, directory: item.node.kind === 'directory' }"
        :data-testid="`knowledge-node-${item.node.kind}`"
        :data-path="item.node.path"
        :style="{ paddingLeft: `${12 + item.depth * 18}px` }"
        @click="onNodeClick(item.node)"
      >
        <span class="tree-toggle">
          <template v-if="item.node.kind === 'directory'">
            {{ expandedPaths.includes(item.node.path) ? '▾' : '▸' }}
          </template>
        </span>
        <span class="tree-label">{{ item.node.name }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ContextNode } from '@packages/core/src';

const props = defineProps<{
  nodes: ContextNode[];
  expandedPaths: string[];
  activePath: string | null;
  currentError: string | null;
}>();

const emit = defineEmits<{
  (event: 'toggle', path: string): void;
  (event: 'open', path: string): void;
  (event: 'create', input: { parentPath?: string; name: string; kind: 'file' | 'directory' }): void;
}>();

const childrenByParent = computed(() => {
  const grouped = new Map<string, ContextNode[]>();

  props.nodes.forEach((node) => {
    const key = node.parentPath ?? '__root__';
    const bucket = grouped.get(key) ?? [];
    bucket.push(node);
    grouped.set(key, bucket);
  });

  grouped.forEach((bucket) => {
    bucket.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name, 'zh-Hans-CN');
    });
  });

  return grouped;
});

const visibleNodes = computed(() => {
  const rows: Array<{ node: ContextNode; depth: number }> = [];

  function walk(parentPath: string | undefined, depth: number) {
    const key = parentPath ?? '__root__';
    const children = childrenByParent.value.get(key) ?? [];

    children.forEach((node) => {
      rows.push({ node, depth });
      if (node.kind === 'directory' && props.expandedPaths.includes(node.path)) {
        walk(node.path, depth + 1);
      }
    });
  }

  walk(undefined, 0);
  return rows;
});

function onNodeClick(node: ContextNode) {
  if (node.kind === 'directory') {
    emit('toggle', node.path);
    return;
  }

  emit('open', node.path);
}

function createNode(kind: 'file' | 'directory') {
  const name = window.prompt(kind === 'file' ? '输入新文件名（例如 note.md）' : '输入新目录名');
  if (!name) {
    return;
  }

  emit('create', {
    name,
    kind
  });
}
</script>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.1), transparent 28%),
    linear-gradient(180deg, rgba(7, 12, 18, 0.98), rgba(10, 14, 22, 0.94));
}

.tree-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 12px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.tree-title {
  color: #e2e8f0;
  font-weight: 700;
}

.tree-subtitle {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 12px;
}

.tree-actions {
  display: flex;
  gap: 6px;
}

.tree-actions button {
  border: 0;
  border-radius: 8px;
  padding: 6px 8px;
  color: #dbeafe;
  background: rgba(37, 99, 235, 0.4);
  cursor: pointer;
}

.tree-list {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow: auto;
  padding: 8px 0 12px;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  text-align: left;
}

.tree-row:hover {
  background: rgba(148, 163, 184, 0.08);
}

.tree-row.active {
  background: rgba(37, 99, 235, 0.18);
  color: #eff6ff;
}

.tree-row.directory {
  color: #e2e8f0;
}

.tree-toggle {
  width: 16px;
  color: #94a3b8;
}

.tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-error {
  margin: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(127, 29, 29, 0.35);
  color: #fecaca;
}
</style>
