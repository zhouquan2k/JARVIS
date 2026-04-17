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
      <button
        v-for="conversation in conversations"
        :key="conversation.id"
        type="button"
        class="agent-document-list__item"
        :class="{ 'agent-document-list__item--active': conversation.id === activeConversationId }"
        :title="getConversationTitle(conversation)"
        data-testid="agent-document-conversation-item"
        @click="emit('open', conversation.id)"
      >
        <span class="agent-document-list__item-title">{{ getConversationTitle(conversation) }}</span>
        <span class="agent-document-list__item-time">
          <span class="agent-document-list__item-date">{{ formatUpdatedDate(conversation.updatedAt) }}</span>
          <span class="agent-document-list__item-clock">{{ formatUpdatedTime(conversation.updatedAt) }}</span>
        </span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Conversation } from '@packages/core/src';
import { useWorkspaceI18n } from '../i18n';
import { formatConversationTitle } from '../utils/conversationTitle';

defineProps<{
  conversations: Conversation[];
  activeConversationId?: string | null;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
}>();

const { t } = useWorkspaceI18n();

const emit = defineEmits<{
  (event: 'open', conversationId: string): void;
}>();

function getConversationTitle(conversation: Conversation): string {
  return formatConversationTitle(
    conversation.title,
    conversation.boundNodeName,
    t('shared.untitled')
  );
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
  flex: 0 0 72px;
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1;
}

.agent-document-list__item {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 14px;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.72);
  font: inherit;
}

.agent-document-list__items {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}

.agent-document-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 14px;
  cursor: pointer;
  text-align: left;
}

.agent-document-list__item--active {
  border-color: rgba(34, 197, 94, 0.55);
  background: rgba(21, 128, 61, 0.18);
}

.agent-document-list__item-title {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
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
</style>
