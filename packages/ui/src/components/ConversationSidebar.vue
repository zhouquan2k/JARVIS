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
        :aria-label="collapsed ? '展开侧边栏' : '折叠侧边栏'"
        @click="$emit('toggle-collapse', !collapsed)"
      >
        <span class="collapse-icon">{{ collapsed ? '>' : '<' }}</span>
      </button>
      <div v-if="!collapsed" ref="menuHostRef" class="new-chat-group">
        <button
          class="new-chat-btn"
          type="button"
          data-testid="sidebar-new-chat"
          @click="emitNewChat"
        >
          <span class="new-chat-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M14.7 5.3h-6.2c-1.8 0-3.2 1.4-3.2 3.2v7c0 1.8 1.4 3.2 3.2 3.2h7c1.8 0 3.2-1.4 3.2-3.2V9.3m-7.5 5.9 6.9-6.9 1.6 1.6-6.9 6.9-2.3.7z"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7"
              />
            </svg>
          </span>
          <span>新建聊天</span>
        </button>
        <button
          class="new-chat-menu-btn"
          type="button"
          data-testid="sidebar-new-chat-menu"
          aria-label="选择聊天模式"
          :aria-expanded="menuOpen"
          @click.stop="menuOpen = !menuOpen"
        >
          <span class="menu-chevron">⌄</span>
        </button>
        <div v-if="menuOpen" class="new-chat-menu">
          <button
            type="button"
            data-testid="sidebar-new-chat-normal"
            @click="emitNewChat"
          >
            普通聊天
          </button>
          <button
            type="button"
            data-testid="sidebar-new-chat-compare"
            @click="emitNewCompare"
          >
            对比聊天
          </button>
        </div>
      </div>
    </div>

    <div v-if="!collapsed && showHistorySourceSwitch" class="sidebar-nav">
      <div class="source-switch">
        <button
          type="button"
          data-testid="history-source-local"
          :class="{ active: historySource === 'local' }"
          @click="$emit('switch-source', 'local')"
        >
          聊天
        </button>
        <button
          type="button"
          data-testid="history-source-external"
          :class="{ active: historySource === 'external' }"
          @click="$emit('switch-source', 'external')"
        >
          导入
        </button>
      </div>
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
          <span
            v-if="item.isImported"
            class="imported-badge"
            data-testid="history-imported-badge"
            aria-hidden="true"
          >
            ·
          </span>
        </button>
        <p v-if="externalItems.length === 0" class="empty-text">暂无可导入历史</p>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { Conversation, ConversationHistorySummary } from '@packages/core/src';
import type { WorkspaceHistorySource } from '../store/chat';

const props = defineProps<{
  collapsed: boolean;
  historySource: WorkspaceHistorySource;
  localItems: Conversation[];
  externalItems: ConversationHistorySummary[];
  activeLocalId?: string | null;
  activeExternalId?: string | null;
  isCompareMode: boolean;
  showHistorySourceSwitch?: boolean;
}>();

const emit = defineEmits<{
  (event: 'toggle-collapse', value: boolean): void;
  (event: 'switch-source', value: WorkspaceHistorySource): void;
  (event: 'select-local', id: string): void;
  (event: 'select-external', id: string): void;
  (event: 'new-chat'): void;
  (event: 'new-compare'): void;
}>();

const menuOpen = ref(false);
const menuHostRef = ref<HTMLElement | null>(null);

function emitNewChat() {
  menuOpen.value = false;
  emit('new-chat');
}

function emitNewCompare() {
  menuOpen.value = false;
  emit('new-compare');
}

function handleWindowClick(event: MouseEvent) {
  if (!menuOpen.value || !menuHostRef.value) {
    return;
  }

  const target = event.target;
  if (target instanceof Node && menuHostRef.value.contains(target)) {
    return;
  }

  menuOpen.value = false;
}

onMounted(() => {
  window.addEventListener('click', handleWindowClick);
});

onUnmounted(() => {
  window.removeEventListener('click', handleWindowClick);
});
</script>

<style scoped>
.workspace-sidebar {
  width: 292px;
  height: 100%;
  min-width: 292px;
  min-height: 0;
  border-right: 1px solid var(--cp-border);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0%, transparent 100%),
    rgba(7, 10, 18, 0.9);
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
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 10px;
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
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--cp-text-primary);
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.18s ease, transform 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.workspace-sidebar:not(.collapsed) .collapse-toggle {
  opacity: 0.6;
  transform: translateX(-2px);
}

.workspace-sidebar:hover .collapse-toggle,
.workspace-sidebar:focus-within .collapse-toggle,
.workspace-sidebar.collapsed .collapse-toggle {
  opacity: 1;
  transform: translateX(0);
}

.collapse-toggle:hover,
.collapse-toggle:focus-visible {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

.collapse-icon {
  line-height: 1;
}

.new-chat-btn {
  flex: 1;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-radius: 0;
  background: transparent;
  color: var(--cp-text-primary);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.new-chat-btn:hover,
.new-chat-btn:focus-visible {
  background: rgba(255, 255, 255, 0.05);
}

.new-chat-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.new-chat-icon svg {
  width: 20px;
  height: 20px;
  opacity: 0.94;
}

.new-chat-group {
  position: relative;
  flex: 1;
  display: flex;
  align-items: stretch;
  gap: 0;
  border: 1px solid var(--cp-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  overflow: visible;
}

.new-chat-group:hover,
.new-chat-group:focus-within {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.14);
}

.new-chat-menu-btn,
.new-chat-menu button {
  border: none;
  background: transparent;
  color: var(--cp-text-primary);
}

.new-chat-menu-btn {
  width: 40px;
  min-width: 40px;
  min-height: 40px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 0 14px 14px 0;
}

.new-chat-menu-btn:hover,
.new-chat-menu-btn:focus-visible,
.new-chat-menu button:hover,
.new-chat-menu button:focus-visible {
  background: rgba(255, 255, 255, 0.05);
}

.menu-chevron {
  font-size: 16px;
  line-height: 1;
  transform: translateY(-1px);
}

.new-chat-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  min-width: 168px;
  padding: 6px;
  border-radius: 16px;
  border: 1px solid var(--cp-border);
  background:
    linear-gradient(180deg, rgba(31, 36, 45, 0.98), rgba(20, 24, 31, 0.98)),
    rgba(17, 24, 39, 0.98);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.new-chat-menu button {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
}

.sidebar-nav {
  padding: 0 12px 10px;
}

.source-switch {
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--cp-border-subtle);
}

.source-switch button {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 10px;
  background: transparent;
  color: var(--cp-text-faint);
  font-size: 12px;
  font-weight: 600;
}

.source-switch button.active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--cp-text-primary);
}

.sidebar-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 14px 12px;
}

.mode-hint {
  margin: 2px 4px 8px 0;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--cp-text-muted);
  font-size: 11px;
  line-height: 1.3;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-item {
  position: relative;
  display: block;
  width: 100%;
  min-height: 34px;
  padding: 8px 12px;
  text-align: left;
  background: transparent;
  color: var(--cp-text-primary);
  box-shadow: inset 0 0 0 1px transparent;
  transition: background 0.16s ease, box-shadow 0.16s ease;
}

.history-item:hover,
.history-item:focus-visible {
  background: var(--cp-sidebar-hover);
}

.history-item.active {
  background: var(--cp-sidebar-active);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.title {
  display: block;
  padding-right: 18px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.imported-badge {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  padding: 0;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(125, 211, 252, 0.74);
  color: transparent;
  box-shadow: 0 0 0 3px rgba(125, 211, 252, 0.08);
}

.empty-text {
  margin: 8px 4px 0 0;
  padding: 14px 12px;
  border-radius: 14px;
  color: var(--cp-text-muted);
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
}

@media (max-width: 920px) {
  .workspace-sidebar {
    width: 100%;
    min-width: 0;
    border-right: none;
    border-bottom: 1px solid var(--cp-border);
  }

  .workspace-sidebar.collapsed {
    width: 100%;
    min-width: 0;
  }

  .workspace-sidebar:not(.collapsed) .collapse-toggle {
    opacity: 1;
    transform: none;
  }
}
</style>
