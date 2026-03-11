<template>
  <section class="workspace-shell" data-testid="conversation-workspace">
    <ConversationSidebar
      :collapsed="chatStore.sidebarCollapsed"
      :history-source="chatStore.historySource"
      :show-history-source-switch="showHistorySourceSwitch"
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
      @new-compare="onNewCompare"
    />

    <div class="workspace-main" :class="{ 'compare-mode': isCompareMode }">
      <CompareChatView v-if="isCompareMode" />
      <NormalChatView v-else />
    </div>
  </section>
</template>

<script setup lang="ts">
import '../theme/chatgpt-dark.css';
import CompareChatView from './CompareChatView.vue';
import ConversationSidebar from '../components/ConversationSidebar.vue';
import NormalChatView from './NormalChatView.vue';
import { useChatStore } from '../store/chat';

const props = defineProps<{
  isCompareMode: boolean;
  showHistorySourceSwitch?: boolean;
}>();

const emit = defineEmits<{
  (event: 'request-normal-mode'): void;
  (event: 'request-compare-mode'): void;
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

function onNewCompare() {
  emit('request-compare-mode');
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
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 28%),
    radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.08), transparent 24%),
    linear-gradient(180deg, #090b10 0%, #11151d 100%);
}

.workspace-main {
  display: flex;
  flex: 1;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.workspace-main.compare-mode {
  background:
    radial-gradient(circle at top left, rgba(120, 128, 150, 0.1), transparent 34%),
    radial-gradient(circle at bottom right, rgba(71, 85, 105, 0.12), transparent 28%),
    linear-gradient(180deg, #1a1d24 0%, #20242d 100%);
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
