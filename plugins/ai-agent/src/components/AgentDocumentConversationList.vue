<template>
  <section class="agent-document-list" data-testid="agent-document-conversation-list">
    <div v-if="loading" class="agent-document-list__state" data-testid="agent-document-conversation-loading">
      {{ t('shared.loadingDocumentConversations') }}
    </div>
    <div v-else-if="error" class="agent-document-list__state agent-document-list__state--error" data-testid="agent-document-conversation-error">
      {{ error }}
    </div>
    <div
      v-else-if="conversations.length === 0"
      class="agent-document-list__state"
      data-testid="agent-document-conversation-empty"
    >
      {{ emptyMessage }}
    </div>
    <div v-else class="agent-document-list__items">
      <div
        v-for="conversation in conversations"
        :key="conversation.id"
        class="agent-document-list__item"
        :class="{ 'agent-document-list__item--active': conversation.id === activeConversationId }"
      >
        <SwipeableListRow
          :enabled="isNarrow"
          :open="openSwipeId === conversation.id"
          :reveal-width="84"
          class="agent-document-list__swipe"
          @update:open="(value: boolean) => onSwipeOpenChange(conversation.id, value)"
        >
          <template #actions="{ close }">
            <button
              type="button"
              class="agent-document-list__swipe-delete"
              data-testid="agent-document-conversation-swipe-delete"
              :aria-label="t('shared.deleteConversation')"
              @click.stop="onSwipeDelete(conversation.id, close)"
            >
              {{ t('shared.deleteConversation') }}
            </button>
          </template>
          <div class="agent-document-list__item-row">
        <button
          type="button"
          class="agent-document-list__item-main"
          :title="getConversationTitle(conversation)"
          data-testid="agent-document-conversation-item"
          :disabled="conversation.id === editingConversationId"
          @click="emit('open', conversation.id)"
        >
          <form
            v-if="conversation.id === editingConversationId"
            class="agent-document-list__rename-form"
            data-testid="agent-document-conversation-rename-form"
            @submit.prevent="submitRename(conversation.id)"
          >
            <input
              ref="renameInputRef"
              v-model="renameDraft"
              class="agent-document-list__rename-input"
              data-testid="agent-document-conversation-rename-input"
              :aria-label="t('shared.renameConversation')"
              @keydown.esc.prevent="cancelRename"
              @click.stop
            >
          </form>
          <div v-else class="agent-document-list__item-content">
            <span class="agent-document-list__item-title">{{ getConversationTitle(conversation) }}</span>
            <span
              v-if="showDocumentLabel && getConversationDocumentLabel(conversation)"
              class="agent-document-list__item-label"
              data-testid="agent-document-conversation-label"
            >
              {{ getConversationDocumentLabel(conversation) }}
            </span>
          </div>
        </button>
        <div v-if="conversation.id === editingConversationId" class="agent-document-list__item-actions">
          <button
            type="button"
            class="agent-document-list__action"
            data-testid="agent-document-conversation-rename-confirm"
            :aria-label="t('shared.confirm')"
            @click="submitRename(conversation.id)"
          >
            {{ t('shared.confirm') }}
          </button>
          <button
            type="button"
            class="agent-document-list__action"
            data-testid="agent-document-conversation-rename-cancel"
            :aria-label="t('shared.cancel')"
            @click="cancelRename"
          >
            {{ t('shared.cancel') }}
          </button>
        </div>
        <div v-else-if="pendingDeleteId === conversation.id" class="agent-document-list__item-actions">
          <button
            type="button"
            class="agent-document-list__action agent-document-list__action--danger"
            data-testid="agent-document-conversation-delete-confirm"
            :aria-label="t('shared.confirm')"
            @click.stop="confirmDelete(conversation.id)"
          >
            {{ t('shared.confirm') }}
          </button>
          <button
            type="button"
            class="agent-document-list__action"
            data-testid="agent-document-conversation-delete-cancel"
            :aria-label="t('shared.cancel')"
            @click.stop="pendingDeleteId = null"
          >
            {{ t('shared.cancel') }}
          </button>
        </div>
        <div v-else class="agent-document-list__item-aside">
          <button
            v-if="!isNarrow"
            type="button"
            class="agent-document-list__delete-btn"
            data-testid="agent-document-conversation-delete"
            :aria-label="t('shared.deleteConversation')"
            :title="t('shared.deleteConversation')"
            @click.stop="pendingDeleteId = conversation.id"
          >
            <Trash2 :size="13" />
          </button>
          <span class="agent-document-list__item-time">
            <span class="agent-document-list__item-date">{{ formatUpdatedDate(conversation.updatedAt) }}</span>
            <span class="agent-document-list__item-clock">{{ formatUpdatedTime(conversation.updatedAt) }}</span>
          </span>
        </div>
          </div>
        </SwipeableListRow>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import type { Conversation } from '@plugins/ai-agent/src/internal';
import { useWorkspaceI18n, useIsNarrowViewport, SwipeableListRow } from '@packages/ui';
import { formatConversationTitle } from '../utils/conversationTitle';

const props = defineProps<{
  conversations: Conversation[];
  activeConversationId?: string | null;
  editingConversationId?: string | null;
  showDocumentLabel?: boolean;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
}>();

const { t } = useWorkspaceI18n();
const renameDraft = ref('');
const renameInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

const pendingDeleteId = ref<string | null>(null);
const openSwipeId = ref<string | null>(null);
const isNarrow = useIsNarrowViewport();

const emit = defineEmits<{
  (event: 'open', conversationId: string): void;
  (event: 'rename', payload: { id: string; title: string }): void;
  (event: 'cancel-rename'): void;
  (event: 'delete', conversationId: string): void;
}>();

watch(
  () => props.editingConversationId,
  async (conversationId) => {
    if (!conversationId) {
      renameDraft.value = '';
      return;
    }

    const conversation = props.conversations.find((item) => item.id === conversationId);
    renameDraft.value = conversation?.title?.trim() || '';
    await focusAndSelectRenameInput();
  },
  { immediate: true }
);

async function focusAndSelectRenameInput(): Promise<void> {
  await nextTick();
  const input = Array.isArray(renameInputRef.value)
    ? (renameInputRef.value[0] ?? null)
    : renameInputRef.value;
  if (!input) {
    return;
  }

  if (typeof input.focus === 'function') {
    input.focus();
  }
  if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(0, renameDraft.value.length);
  }
}

function getConversationTitle(conversation: Conversation): string {
  return formatConversationTitle(
    conversation.title,
    t('shared.untitled')
  );
}

function getConversationDocumentLabel(conversation: Conversation): string {
  return formatDocumentLabel(conversation.documentPaths?.[0])
    || formatDocumentLabel(conversation.archive?.documentPath)
    || formatDocumentLabel(conversation.boundNodeName)
    || '';
}

function formatDocumentLabel(documentPath: string | null | undefined): string {
  const normalized = documentPath?.trim();
  if (!normalized) {
    return '';
  }

  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] ?? normalized;
  return fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
}

function submitRename(conversationId: string): void {
  emit('rename', {
    id: conversationId,
    title: renameDraft.value
  });
}

function cancelRename(): void {
  emit('cancel-rename');
}

function confirmDelete(conversationId: string): void {
  pendingDeleteId.value = null;
  emit('delete', conversationId);
}

function onSwipeOpenChange(conversationId: string, value: boolean): void {
  if (value) {
    pendingDeleteId.value = null;
    openSwipeId.value = conversationId;
    return;
  }
  if (openSwipeId.value === conversationId) {
    openSwipeId.value = null;
  }
}

function onSwipeDelete(conversationId: string, close: () => void): void {
  close();
  openSwipeId.value = null;
  // Reuse the existing confirm/cancel step.
  pendingDeleteId.value = conversationId;
}

function formatUpdatedDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  }).format(timestamp);
}

function formatUpdatedTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp);
}
</script>

<style scoped>
.agent-document-list {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 16px;
  padding: 18px 16px;
  background:
    radial-gradient(circle at top left, rgba(16, 185, 129, 0.12), transparent 24%),
    linear-gradient(180deg, rgba(5, 10, 16, 0.96), rgba(9, 14, 22, 0.94));
}

.agent-document-list__item-time {
  display: grid;
  grid-auto-rows: min-content;
  justify-items: end;
  gap: 4px;
  flex-shrink: 0;
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1;
}

.agent-document-list__item {
  display: flex;
  align-items: stretch;
  gap: 10px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 14px;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.72);
  font: inherit;
  overflow: hidden;
  --swipeable-row-bg: #0d1526;
}

.agent-document-list__swipe {
  flex: 1;
  min-width: 0;
}

.agent-document-list__item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.agent-document-list__swipe-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0 10px;
  background: #b91c1c;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.agent-document-list__swipe-delete:hover,
.agent-document-list__swipe-delete:focus-visible {
  background: #dc2626;
}

.agent-document-list__items {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}

.agent-document-list__item-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  padding: 14px 0 14px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.agent-document-list__item-content {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  gap: 4px;
}

.agent-document-list__item-main:disabled {
  cursor: default;
}

.agent-document-list__item-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-right: 12px;
  flex-shrink: 0;
}

.agent-document-list__action {
  border: 0;
  border-radius: 8px;
  padding: 6px 8px;
  color: #cbd5e1;
  background: rgba(30, 41, 59, 0.52);
  font-size: 11px;
  cursor: pointer;
}

.agent-document-list__rename-form {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
}

.agent-document-list__rename-input {
  width: 100%;
  min-width: 0;
  height: 30px;
  border: 1px solid rgba(96, 165, 250, 0.36);
  border-radius: 8px;
  padding: 0 10px;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.82);
  font-size: 13px;
}

.agent-document-list__item--active {
  border-color: rgba(34, 197, 94, 0.55);
  background: rgba(21, 128, 61, 0.18);
}

.agent-document-list__item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-document-list__item-label {
  min-width: 0;
  overflow: hidden;
  color: rgba(148, 163, 184, 0.92);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-document-list__item-date,
.agent-document-list__item-clock {
  display: block;
  min-width: 100%;
  text-align: right;
}

.agent-document-list__state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  border: 1px dashed rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  color: #94a3b8;
  text-align: center;
}

.agent-document-list__state--error {
  color: #fecaca;
}

.agent-document-list__item-aside {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 10px;
  flex-shrink: 0;
}

.agent-document-list__item-aside .agent-document-list__delete-btn {
  opacity: 0;
  transition: opacity 0.16s ease;
}

.agent-document-list__item:hover .agent-document-list__item-aside .agent-document-list__delete-btn,
.agent-document-list__item:focus-within .agent-document-list__item-aside .agent-document-list__delete-btn {
  opacity: 1;
}

.agent-document-list__delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.agent-document-list__delete-btn:hover,
.agent-document-list__delete-btn:focus-visible {
  background: rgba(239, 68, 68, 0.16);
  color: #fca5a5;
}

.agent-document-list__action--danger {
  color: #fca5a5;
  background: rgba(127, 29, 29, 0.36);
}

.agent-document-list__action--danger:hover {
  background: rgba(127, 29, 29, 0.56);
  color: #ffe4e6;
}
</style>
