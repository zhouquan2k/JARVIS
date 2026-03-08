<template>
  <aside
    class="workspace-sidebar"
    :class="{ collapsed }"
    data-testid="workspace-sidebar"
  >
    <div class="sidebar-top">
      <button
        class="collapse-toggle"
        type="button"
        data-testid="sidebar-toggle"
        @click="$emit('toggle-collapse', !collapsed)"
      >
        {{ collapsed ? '>' : '<' }}
      </button>
      <button
        v-if="!collapsed"
        class="new-chat-btn"
        type="button"
        data-testid="sidebar-new-chat"
        @click="$emit('new-chat')"
      >
        新建聊天
      </button>
    </div>

    <div v-if="!collapsed" class="source-switch">
      <button
        type="button"
        data-testid="history-source-local"
        :class="{ active: historySource === 'local' }"
        @click="$emit('switch-source', 'local')"
      >
        本地记录
      </button>
      <button
        type="button"
        data-testid="history-source-external"
        :class="{ active: historySource === 'external' }"
        @click="$emit('switch-source', 'external')"
      >
        外部导入
      </button>
    </div>

    <div v-if="!collapsed" class="sidebar-content">
      <p v-if="isCompareMode" class="mode-hint">
        当前为对比模式，选择历史后会切回普通聊天视图。
      </p>

      <div v-if="historySource === 'local'" class="history-list">
        <button
          v-for="item in localItems"
          :key="item.id"
          class="history-item"
          :class="{ active: activeLocalId === item.id }"
          data-testid="local-history-item"
          @click="$emit('select-local', item.id)"
        >
          <span class="title">{{ item.title || 'Untitled' }}</span>
          <span class="meta">本地 · {{ formatTime(item.updatedAt) }}</span>
        </button>
        <p v-if="localItems.length === 0" class="empty-text">暂无本地历史</p>
      </div>

      <div v-else class="history-list">
        <button
          v-for="item in externalItems"
          :key="item.id"
          class="history-item"
          :class="{ active: activeExternalId === item.id }"
          data-testid="external-history-item"
          @click="$emit('select-external', item.id)"
        >
          <span class="title">{{ item.title || 'Untitled' }}</span>
          <span class="meta">{{ item.sourceType }} · {{ formatTime(item.updatedAt) }}</span>
          <span
            v-if="item.isImported"
            class="imported-badge"
            data-testid="history-imported-badge"
          >
            已导入
          </span>
        </button>
        <p v-if="externalItems.length === 0" class="empty-text">暂无可导入历史</p>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { Conversation, ConversationHistorySummary } from '@packages/core/src';
import type { WorkspaceHistorySource } from '../store/chat';

defineProps<{
  collapsed: boolean;
  historySource: WorkspaceHistorySource;
  localItems: Conversation[];
  externalItems: ConversationHistorySummary[];
  activeLocalId?: string | null;
  activeExternalId?: string | null;
  isCompareMode: boolean;
}>();

defineEmits<{
  (event: 'toggle-collapse', value: boolean): void;
  (event: 'switch-source', value: WorkspaceHistorySource): void;
  (event: 'select-local', id: string): void;
  (event: 'select-external', id: string): void;
  (event: 'new-chat'): void;
}>();

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}
</script>

<style scoped>
.workspace-sidebar {
  width: 320px;
  height: 100%;
  min-width: 320px;
  min-height: 0;
  border-right: 1px solid #d6d3d1;
  background:
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.18), transparent 34%),
    linear-gradient(180deg, #fffdf8 0%, #f4efe7 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease, min-width 0.2s ease;
}

.workspace-sidebar.collapsed {
  width: 68px;
  min-width: 68px;
}

.sidebar-top {
  display: flex;
  gap: 10px;
  padding: 14px 12px 10px;
}

.collapse-toggle,
.new-chat-btn,
.source-switch button,
.history-item {
  border: none;
  border-radius: 14px;
  cursor: pointer;
}

.collapse-toggle {
  width: 42px;
  height: 42px;
  background: #1c1917;
  color: #fafaf9;
  font-size: 16px;
}

.new-chat-btn {
  flex: 1;
  background: #ea580c;
  color: #fff7ed;
  font-weight: 600;
}

.source-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 0 12px 12px;
}

.source-switch button {
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.72);
  color: #57534e;
}

.source-switch button.active {
  background: #1c1917;
  color: #fafaf9;
}

.sidebar-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 12px 16px;
}

.mode-hint {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(28, 25, 23, 0.08);
  color: #44403c;
  font-size: 12px;
  line-height: 1.5;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 12px;
  text-align: left;
  background: rgba(255, 255, 255, 0.85);
  color: #292524;
  box-shadow: inset 0 0 0 1px rgba(214, 211, 209, 0.8);
}

.history-item.active {
  background: #fff7ed;
  box-shadow: inset 0 0 0 1px #ea580c;
}

.title {
  font-weight: 600;
  line-height: 1.4;
}

.meta {
  font-size: 12px;
  color: #78716c;
}

.imported-badge {
  margin-top: 2px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 11px;
  font-weight: 600;
}

.empty-text {
  margin: 0;
  padding: 20px 12px;
  border-radius: 14px;
  color: #78716c;
  background: rgba(255, 255, 255, 0.72);
}

@media (max-width: 920px) {
  .workspace-sidebar {
    width: 100%;
    min-width: 0;
    border-right: none;
    border-bottom: 1px solid #d6d3d1;
  }

  .workspace-sidebar.collapsed {
    width: 100%;
    min-width: 0;
  }
}
</style>
