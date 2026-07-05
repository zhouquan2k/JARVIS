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
        :aria-label="collapsed ? t('shared.expandSidebar') : t('shared.collapseSidebar')"
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
          <span>{{ t('shared.newChat') }}</span>
        </button>
        <button
          class="new-chat-menu-btn"
          type="button"
          data-testid="sidebar-new-chat-menu"
          :aria-label="t('shared.chooseChatMode')"
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
            {{ t('shared.normalChat') }}
          </button>
          <button
            type="button"
            data-testid="sidebar-new-chat-compare"
            @click="emitNewCompare"
          >
            {{ t('shared.compareChat') }}
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
          {{ t('shared.historySourceLocal') }}
        </button>
        <button
          type="button"
          data-testid="history-source-external"
          :class="{ active: historySource === 'external' }"
          @click="$emit('switch-source', 'external')"
        >
          {{ t('shared.historySourceExternal') }}
        </button>
      </div>
    </div>

    <div v-if="!collapsed && historySource === 'local'" class="sidebar-nav sidebar-nav--local-filter">
      <button
        type="button"
        class="local-filter-toggle"
        data-testid="local-history-filter-toggle"
        :class="{ active: localConversationFilter === 'starred' }"
        :aria-pressed="localConversationFilter === 'starred'"
        :title="localConversationFilter === 'starred' ? t('shared.showAllConversations') : t('shared.onlyStarred')"
        @click="toggleLocalFilter"
      >
        <span class="local-filter-toggle__icon" aria-hidden="true">★</span>
        <span>{{ localConversationFilter === 'starred' ? t('shared.onlyStarred') : t('shared.starredFilter') }}</span>
      </button>
    </div>

    <div v-if="!collapsed && historySource === 'local' && agentBindingNotice" class="sidebar-nav sidebar-nav--binding-status">
      <p
        class="binding-status"
        :class="`binding-status--${agentBindingNoticeTone}`"
        data-testid="local-history-binding-status"
      >
        {{ agentBindingNotice }}
      </p>
    </div>

    <div v-if="!collapsed" class="sidebar-content">
      <p v-if="isCompareMode" class="mode-hint">
        {{ t('shared.compareModeHint') }}
      </p>

      <div v-if="historySource === 'local'" class="history-list">
        <div
          v-for="item in localItems"
          :key="item.id"
          class="history-row local-history-row"
          :class="{
            active: activeLocalId === item.id,
            confirming: pendingDeleteId === item.id,
            'binding-open': localAgentBindingId === item.id,
            'menu-open': openActionMenuId === item.id
          }"
        >
          <button
            v-if="renameEditingId !== item.id"
            class="history-item local-history-button"
            :class="{
              active: activeLocalId === item.id,
              'history-item--menu-open': openActionMenuId === item.id
            }"
            data-testid="local-history-item"
            @click="handleSelectLocal(item.id)"
          >
            <span v-if="item.starred" class="history-star-marker" aria-hidden="true">★</span>
            <span class="title">{{ formatConversationTitle(item.title, t('shared.untitled')) }}</span>
            <span v-if="resolveConversationDocumentTagLabel(item)" class="history-document-tag" data-testid="local-history-document-tag">
              {{ resolveConversationDocumentTagLabel(item) }}
            </span>
            <span v-if="resolveConversationAgentLabel(item.agentKey)" class="history-agent-tag">
              {{ resolveConversationAgentLabel(item.agentKey) }}
            </span>
          </button>
          <form
            v-else
            class="history-rename-form"
            data-testid="local-history-rename-form"
            @submit.prevent="submitRename(item.id)"
          >
            <input
              v-model="renameDraft"
              class="history-rename-input"
              data-testid="local-history-rename-input"
              :aria-label="t('shared.renameConversation')"
              @keydown.esc.prevent="cancelRename"
            />
          </form>
          <div class="history-actions">
            <template v-if="pendingDeleteId === item.id">
              <button
                type="button"
                class="history-action danger"
                data-testid="local-history-delete-confirm"
                @click.stop="confirmDeleteLocal(item.id)"
              >
                {{ t('shared.confirm') }}
              </button>
              <button
                type="button"
                class="history-action"
                data-testid="local-history-delete-cancel"
                @click.stop="pendingDeleteId = null"
              >
                {{ t('shared.cancel') }}
              </button>
            </template>
            <template v-else-if="localAgentBindingId === item.id">
              <button
                type="button"
                class="history-action"
                data-testid="local-history-agent-binding-close"
                :aria-label="`${t('shared.cancel')} ${formatConversationTitle(item.title, t('shared.untitled'))} ${t('shared.agentBindingPanel')}`"
                @click.stop="closeLocalAgentBinding"
              >
                {{ t('shared.cancel') }}
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                class="history-action-trigger"
                :class="{ 'history-action-trigger--visible': openActionMenuId === item.id }"
                data-testid="local-history-actions-menu"
                :aria-label="`${formatConversationTitle(item.title, t('shared.untitled'))} ${t('shared.chooseChatMode')}`"
                :aria-expanded="openActionMenuId === item.id"
                @click.stop="toggleLocalActionMenu(item.id)"
              >
                ⋯
              </button>
            </template>
          </div>
          <div
            v-if="openActionMenuId === item.id"
            class="history-action-menu"
            data-testid="local-history-actions-popup"
          >
            <button
              type="button"
              class="history-action-menu-item"
              data-testid="local-history-rename"
              @click.stop="startRename(item)"
            >
              {{ t('shared.renameConversation') }}
            </button>
            <button
              type="button"
              class="history-action-menu-item"
              data-testid="local-history-agent-binding"
              :disabled="agentBindingSubmitting === true"
              @click.stop="openLocalAgentBinding(item.id)"
            >
              {{ t('shared.bindToAgent') }}
            </button>
            <button
              type="button"
              class="history-action-menu-item"
              :class="{ active: item.starred === true }"
              data-testid="local-history-star"
              @click.stop="toggleLocalStar(item.id)"
            >
              {{ item.starred ? t('shared.unstarConversation') : t('shared.starConversation') }}
            </button>
            <button
              type="button"
              class="history-action-menu-item history-action-menu-item--danger"
              data-testid="local-history-delete"
              @click.stop="startDeleteLocal(item.id)"
            >
              {{ t('shared.deleteConversation') }}
            </button>
          </div>
          <div v-if="localAgentBindingId === item.id" class="local-agent-binding-panel">
            <p class="local-agent-binding-panel__title">{{ t('shared.selectedAgent') }}</p>
            <p v-if="agentBindingLoading" class="local-agent-binding-panel__message">{{ t('shared.loadingAgentOptions') }}</p>
            <p v-else-if="agentBindingError" class="local-agent-binding-panel__message local-agent-binding-panel__message--error">
              {{ agentBindingError }}
            </p>
            <div v-else class="local-agent-binding-panel__options">
              <button
                v-for="option in localAgentBindingOptions"
                :key="option.key ?? 'null'"
                type="button"
                class="local-agent-binding-panel__option"
                :class="{ 'local-agent-binding-panel__option--muted': option.key === null }"
                :title="option.title"
                data-testid="local-history-agent-option"
                :data-agent-key="option.key ?? ''"
                @click.stop="bindLocalAgent(item.id, option.key)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
        <p v-if="localItems.length === 0" class="empty-text">{{ t('shared.noLocalHistory') }}</p>
      </div>

      <div v-else class="external-panel">
        <div class="provider-switch" data-testid="external-provider-switch">
          <button
            v-for="provider in externalProviders"
            :key="provider.id"
            type="button"
            class="provider-chip"
            :class="{ active: activeExternalProviderId === provider.id }"
            :data-testid="`external-provider-${provider.id}`"
            @click="$emit('select-external-provider', provider.id)"
          >
            {{ provider.label }}
          </button>
        </div>

        <ExternalHistorySearchBox
          v-if="showExternalHistorySearch"
          :model-value="externalHistoryQuery"
          :loading="externalHistoryLoading"
          :placeholder="externalHistorySearchPlaceholder"
          @update:model-value="(value) => $emit('update-external-query', value)"
          @submit="$emit('submit-external-query')"
          @clear="$emit('clear-external-query')"
        />

        <div class="history-list">
          <p
            v-if="externalHistoryLoading"
            class="empty-text"
            data-testid="external-history-loading"
          >
            {{ t('shared.loadingHistory') }}
          </p>
          <button
            v-for="item in externalItems"
            :key="item.id"
            class="history-item"
            :class="{ active: activeExternalId === item.id, loading: externalPreviewLoadingId === item.id }"
            data-testid="external-history-item"
            @click="$emit('select-external', item.id)"
          >
            <span class="title">{{ item.title || t('shared.untitled') }}</span>
            <span
              v-if="externalPreviewLoadingId === item.id"
              class="loading-status"
              data-testid="external-history-item-loading"
            >
              {{ t('shared.waitingLoad') }}
            </span>
            <span
              v-if="item.isImported"
              class="imported-badge"
              data-testid="history-imported-badge"
              aria-hidden="true"
            >
              ·
            </span>
          </button>
          <p v-if="activeExternalProviderId === 'external-file'" class="empty-text">
            {{ t('shared.importOnSelectFile') }}
          </p>
          <p v-else-if="!externalHistoryLoading && externalItems.length === 0" class="empty-text">{{ t('shared.noImportableHistory') }}</p>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import ExternalHistorySearchBox from './ExternalHistorySearchBox.vue';
import type {
  Conversation,
  ConversationHistorySummary,
  ExternalHistoryProviderEntry,
  ExternalHistoryProviderId
} from '@plugins/ai-agent/src/internal';
import type { LocalConversationFilter, WorkspaceHistorySource } from '../store/chat';
import { useWorkspaceI18n } from '@packages/ui';
import { formatConversationTitle, resolveConversationDocumentTag } from '../utils/conversationTitle';

const props = defineProps<{
  collapsed: boolean;
  historySource: WorkspaceHistorySource;
  localItems: Conversation[];
  externalProviders: ExternalHistoryProviderEntry[];
  externalItems: ConversationHistorySummary[];
  externalHistoryLoading: boolean;
  externalHistoryQuery: string;
  showExternalHistorySearch?: boolean;
  externalHistorySearchPlaceholder?: string;
  externalPreviewLoadingId?: string | null;
  activeExternalProviderId: ExternalHistoryProviderId;
  activeLocalId?: string | null;
  activeExternalId?: string | null;
  isCompareMode: boolean;
  showHistorySourceSwitch?: boolean;
  localConversationFilter?: LocalConversationFilter;
  agentBindingOptions?: Array<{ key: string | null; label: string; title: string }>;
  agentBindingLoading?: boolean;
  agentBindingError?: string | null;
  agentBindingNotice?: string | null;
  agentBindingNoticeTone?: 'info' | 'success' | 'error';
  agentBindingSubmitting?: boolean;
}>();

const emit = defineEmits<{
  (event: 'toggle-collapse', value: boolean): void;
  (event: 'switch-source', value: WorkspaceHistorySource): void;
  (event: 'select-external-provider', id: ExternalHistoryProviderId): void;
  (event: 'select-local', id: string): void;
  (event: 'delete-local', id: string): void;
  (event: 'rename-local', payload: { id: string; title: string }): void;
  (event: 'toggle-local-star', id: string): void;
  (event: 'set-local-filter', value: LocalConversationFilter): void;
  (event: 'select-external', id: string): void;
  (event: 'update-external-query', value: string): void;
  (event: 'submit-external-query'): void;
  (event: 'clear-external-query'): void;
  (event: 'open-local-agent-binding', id: string): void;
  (event: 'bind-local-agent', payload: { conversationId: string; agentKey: string | null }): void;
  (event: 'new-chat'): void;
  (event: 'new-compare'): void;
}>();

function resolveConversationDocumentTagLabel(conversation: Conversation): string | null {
  return resolveConversationDocumentTag(conversation.documentPaths?.[0] ?? null, conversation.boundNodeName);
}

const menuOpen = ref(false);
const menuHostRef = ref<HTMLElement | null>(null);
const pendingDeleteId = ref<string | null>(null);
const localAgentBindingId = ref<string | null>(null);
const renameEditingId = ref<string | null>(null);
const renameDraft = ref('');
const openActionMenuId = ref<string | null>(null);
const localAgentBindingOptions = computed(() => props.agentBindingOptions ?? []);
const { t } = useWorkspaceI18n();

function emitNewChat() {
  menuOpen.value = false;
  emit('new-chat');
}

function emitNewCompare() {
  menuOpen.value = false;
  emit('new-compare');
}

function handleSelectLocal(id: string) {
  pendingDeleteId.value = null;
  localAgentBindingId.value = null;
  openActionMenuId.value = null;
  if (renameEditingId.value === id) {
    return;
  }
  emit('select-local', id);
}

function confirmDeleteLocal(id: string) {
  pendingDeleteId.value = null;
  localAgentBindingId.value = null;
  openActionMenuId.value = null;
  emit('delete-local', id);
}

function toggleLocalFilter() {
  emit('set-local-filter', props.localConversationFilter === 'starred' ? 'all' : 'starred');
}

function resolveConversationAgentLabel(agentKey: string | null | undefined): string {
  if (!agentKey) {
    return '';
  }

  return props.agentBindingOptions?.find((option) => option.key === agentKey)?.label ?? agentKey;
}

function openLocalAgentBinding(id: string) {
  pendingDeleteId.value = null;
  renameEditingId.value = null;
  openActionMenuId.value = null;
  if (localAgentBindingId.value === id) {
    localAgentBindingId.value = null;
    return;
  }

  localAgentBindingId.value = id;
  emit('open-local-agent-binding', id);
}

function startRename(item: Conversation) {
  pendingDeleteId.value = null;
  localAgentBindingId.value = null;
  openActionMenuId.value = null;
  renameEditingId.value = item.id;
  renameDraft.value = item.title || '';
}

function submitRename(id: string) {
  emit('rename-local', { id, title: renameDraft.value });
  renameEditingId.value = null;
  renameDraft.value = '';
}

function cancelRename() {
  renameEditingId.value = null;
  renameDraft.value = '';
}

function closeLocalAgentBinding() {
  localAgentBindingId.value = null;
}

function bindLocalAgent(conversationId: string, agentKey: string | null) {
  emit('bind-local-agent', { conversationId, agentKey });
  localAgentBindingId.value = null;
}

function toggleLocalActionMenu(id: string) {
  pendingDeleteId.value = null;
  localAgentBindingId.value = null;
  if (renameEditingId.value === id) {
    return;
  }

  openActionMenuId.value = openActionMenuId.value === id ? null : id;
}

function toggleLocalStar(id: string) {
  openActionMenuId.value = null;
  emit('toggle-local-star', id);
}

function startDeleteLocal(id: string) {
  openActionMenuId.value = null;
  pendingDeleteId.value = id;
}

function handleWindowClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Node)) {
    menuOpen.value = false;
    openActionMenuId.value = null;
    return;
  }

  if (menuOpen.value && menuHostRef.value && !menuHostRef.value.contains(target)) {
    menuOpen.value = false;
  }

  const sidebarRoot = target instanceof Element ? target.closest('.workspace-sidebar') : null;
  if (!sidebarRoot) {
    openActionMenuId.value = null;
  }
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
.provider-chip,
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
  padding: 0 12px 8px;
}

.sidebar-nav--local-filter {
  padding-top: 6px;
  padding-bottom: 6px;
}

.sidebar-nav--binding-status {
  padding-top: 0;
  padding-bottom: 8px;
}

.source-switch {
  display: inline-flex;
  align-items: flex-end;
  width: 100%;
  gap: 2px;
  padding: 0;
  border-radius: 0;
  background: transparent;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: none;
}

.source-switch button {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 16px;
  border-radius: 12px 12px 0 0;
  background: transparent;
  color: var(--cp-text-faint);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.01em;
  border-bottom: 2px solid transparent;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
}

.source-switch button:hover,
.source-switch button:focus-visible {
  color: var(--cp-text-primary);
  background: rgba(255, 255, 255, 0.03);
}

.source-switch button.active {
  background: rgba(255, 255, 255, 0.05);
  color: #f8fafc;
  border-bottom-color: rgba(96, 165, 250, 0.9);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.local-filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.045);
  color: var(--cp-text-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.local-filter-toggle:hover,
.local-filter-toggle:focus-visible {
  background: rgba(255, 255, 255, 0.07);
  color: var(--cp-text-primary);
}

.local-filter-toggle.active {
  background: rgba(250, 204, 21, 0.14);
  color: #fde68a;
  box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.2);
}

.local-filter-toggle__icon {
  font-size: 11px;
  line-height: 1;
}

.binding-status {
  margin: 0 12px 0 0;
  padding: 8px 10px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.4;
  background: rgba(255, 255, 255, 0.04);
}

.binding-status--info {
  color: #cbd5e1;
}

.binding-status--success {
  color: #bbf7d0;
  background: rgba(22, 101, 52, 0.16);
}

.binding-status--error {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.22);
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

.external-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.provider-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-right: 8px;
}

.provider-chip {
  min-height: 34px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--cp-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.provider-chip.active {
  background: rgba(59, 130, 246, 0.2);
  color: #eef5ff;
  box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.3);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-row {
  position: relative;
}

.history-row.binding-open {
  padding-bottom: 6px;
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

.history-item.loading {
  background: rgba(30, 41, 59, 0.88);
  box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.28);
}

.local-history-button {
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-rename-form {
  padding: 4px 8px;
}

.history-rename-input {
  width: 100%;
  height: 28px;
  border: 1px solid rgba(96, 165, 250, 0.36);
  border-radius: 8px;
  padding: 0 8px;
  color: var(--cp-text-primary);
  background: rgba(15, 23, 42, 0.82);
  font-size: 13px;
}

.history-agent-tag {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.14);
  color: #bfdbfe;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  flex-shrink: 0;
}

.history-document-tag {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  color: #cbd5e1;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  flex-shrink: 0;
}

.history-actions {
  position: absolute;
  top: 50%;
  right: 6px;
  display: flex;
  align-items: center;
  transform: translateY(-50%);
  opacity: 1;
  visibility: visible;
  pointer-events: none;
  z-index: 2;
}

.history-row.menu-open {
  z-index: 20;
}

.history-action,
.history-action-trigger {
  min-height: 28px;
  min-width: 28px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.92);
  color: var(--cp-text-muted);
  font-size: 12px;
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.14);
  transition: color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
  border: none;
  cursor: pointer;
  pointer-events: auto;
}

.history-action-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  letter-spacing: 0.08em;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.history-action-trigger--visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.local-history-row:hover .history-action-trigger,
.local-history-row:focus-within .history-action-trigger {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.history-action:hover,
.history-action:focus-visible,
.history-action-trigger:hover,
.history-action-trigger:focus-visible {
  color: var(--cp-text-primary);
  background: rgba(30, 41, 59, 0.96);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.28);
}

.history-action.active {
  color: #fcd34d;
  box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.22);
}

.history-action.active:hover,
.history-action.active:focus-visible {
  color: #fde68a;
  background: rgba(120, 53, 15, 0.92);
  box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.32);
}

.history-action.danger {
  color: #fca5a5;
  box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.18);
}

.history-action.danger:hover,
.history-action.danger:focus-visible {
  color: #ffe4e6;
  background: rgba(127, 29, 29, 0.92);
  box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.34);
}

.history-action:disabled {
  cursor: wait;
  opacity: 0.7;
}

.history-action-menu {
  position: absolute;
  top: 100%;
  right: 6px;
  z-index: 20;
  min-width: 168px;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background-color: #111827;
  background-image: none;
  opacity: 1;
  isolation: isolate;
  overflow: hidden;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.42);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-action-menu-item {
  min-height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--cp-text-primary);
  text-align: left;
  font-size: 13px;
  cursor: pointer;
}

.history-action-menu-item:hover,
.history-action-menu-item:focus-visible {
  background: rgba(255, 255, 255, 0.06);
}

.history-action-menu-item.active {
  color: #fde68a;
}

.history-action-menu-item:disabled {
  cursor: wait;
  opacity: 0.72;
}

.history-action-menu-item--danger {
  color: #fecaca;
}

.local-agent-binding-panel {
  margin: 4px 0 8px;
  padding: 10px 10px 12px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.92);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.local-agent-binding-panel__title {
  margin: 0 0 8px;
  color: var(--cp-text-primary);
  font-size: 12px;
  font-weight: 700;
}

.local-agent-binding-panel__message {
  margin: 0;
  color: var(--cp-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.local-agent-binding-panel__message--error {
  color: #fca5a5;
}

.local-agent-binding-panel__options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.local-agent-binding-panel__option {
  min-height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--cp-text-primary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.local-agent-binding-panel__option:hover,
.local-agent-binding-panel__option:focus-visible {
  background: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
}

.local-agent-binding-panel__option--muted {
  color: var(--cp-text-muted);
}

.title {
  display: block;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.local-history-button .title {
  flex: 1;
  min-width: 0;
}

.history-star-marker {
  flex: 0 0 auto;
  color: #fcd34d;
  font-size: 12px;
}

.loading-status {
  position: absolute;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  font-size: 12px;
  color: #93c5fd;
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
