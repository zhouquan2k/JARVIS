<template>
  <aside class="file-tree" data-testid="knowledge-file-tree">
    <header class="tree-header">
      <div>
        <div class="tree-title">Knowledge</div>
      </div>
      <div class="tree-actions">
        <button
          type="button"
          class="tree-icon-button"
          data-testid="knowledge-new-file"
          title="新建文件"
          aria-label="新建文件"
          @mouseenter="showTooltip($event, '新建文件')"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, '新建文件')"
          @blur="hideTooltip"
          @click="createNode('file')"
        >
          <FilePlus class="tree-icon" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="tree-icon-button"
          data-testid="knowledge-new-directory"
          title="新建目录"
          aria-label="新建目录"
          @mouseenter="showTooltip($event, '新建目录')"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, '新建目录')"
          @blur="hideTooltip"
          @click="createNode('directory')"
        >
          <FolderPlus class="tree-icon" :size="18" aria-hidden="true" />
        </button>
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
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { FilePlus, FolderPlus } from 'lucide-vue-next';
import type { ContextNode } from '@packages/core/src';

const props = defineProps<{
  nodes: ContextNode[];
  expandedPaths: string[];
  activePath: string | null;
  currentError: string | null;
}>();

const emit = defineEmits<{
  (event: 'open', path: string): void;
  (event: 'create', input: { parentPath?: string; name: string; kind: 'file' | 'directory' }): void;
}>();

const tooltipState = reactive({
  text: '',
  top: 0,
  left: 0,
  visible: false
});

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
.file-tree {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.1), transparent 28%),
    linear-gradient(180deg, rgba(7, 12, 18, 0.98), rgba(10, 14, 22, 0.94));
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.tree-title {
  color: #e2e8f0;
  font-weight: 700;
}

.tree-actions {
  display: flex;
  gap: 2px;
}

.tree-icon-button {
  border: 0;
  border-radius: 8px;
  width: 28px;
  height: 28px;
  padding: 0;
  color: rgba(226, 232, 240, 0.86);
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.tree-icon {
  width: 18px;
  height: 18px;
}

.tree-icon-button:hover,
.tree-icon-button:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
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
