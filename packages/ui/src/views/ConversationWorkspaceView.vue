<template>
  <section class="workspace-shell" data-testid="conversation-workspace">
    <ConversationSidebar
      :collapsed="chatStore.sidebarCollapsed"
      :history-source="chatStore.historySource"
      :local-items="chatStore.conversations"
      :external-items="chatStore.externalHistoryItems"
      :active-local-id="chatStore.workspaceMode === 'active' ? chatStore.currentConversation?.id : null"
      :active-external-id="chatStore.workspaceMode === 'preview' ? chatStore.previewConversation?.externalId : null"
      :is-compare-mode="isCompareMode"
      @toggle-collapse="chatStore.setSidebarCollapsed"
      @switch-source="onSwitchSource"
      @select-local="onSelectLocal"
      @select-external="onSelectExternal"
      @new-chat="onNewChat"
    />

    <div class="workspace-main">
      <CompareChatView v-if="isCompareMode" />
      <NormalChatView v-else />
    </div>
  </section>
</template>

<script setup lang="ts">
import CompareChatView from './CompareChatView.vue';
import ConversationSidebar from '../components/ConversationSidebar.vue';
import NormalChatView from './NormalChatView.vue';
import { useChatStore } from '../store/chat';

const props = defineProps<{
  isCompareMode: boolean;
}>();

const emit = defineEmits<{
  (event: 'request-normal-mode'): void;
}>();

const chatStore = useChatStore();

async function onSwitchSource(source: 'local' | 'external') {
  await chatStore.setHistorySource(source);
}

async function onSelectLocal(id: string) {
  if (props.isCompareMode) {
    emit('request-normal-mode');
  }
  await chatStore.selectLocalConversation(id);
}

async function onSelectExternal(id: string) {
  if (props.isCompareMode) {
    emit('request-normal-mode');
  }
  await chatStore.previewExternalConversation(id);
}

async function onNewChat() {
  if (props.isCompareMode) {
    emit('request-normal-mode');
  }
  await chatStore.startNewConversation();
}
</script>

<style scoped>
.workspace-shell {
  display: flex;
  flex: 1;
  width: 100%;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(251, 191, 36, 0.08), transparent 30%),
    linear-gradient(180deg, #fafaf9 0%, #f5f5f4 100%);
}

.workspace-main {
  display: flex;
  flex: 1;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.workspace-main > * {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

@media (max-width: 920px) {
  .workspace-shell {
    flex-direction: column;
  }
}
</style>
