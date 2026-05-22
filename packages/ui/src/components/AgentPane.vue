<template>
  <aside class="knowledge-assistant-pane" data-testid="agent-pane">
    <AgentConversationPanel
      class="agent-pane-chat"
      :active-agent-key="props.activeAgentKey"
      :active-path="props.activePath"
      :selected-node-path="props.selectedNodePath"
      :active-document="props.activeDocument"
      :show-agent-conversation-list="props.showAgentConversationList"
      :context-provider="props.contextProvider"
      :restore-conversation-id="props.restoreConversationId"
      :open-conversation-request="props.openConversationRequest"
      @request-workspace-switch="emit('request-workspace-switch', $event)"
    />
  </aside>
</template>

<script setup lang="ts">
import type { ContextDocument, IContextProvider, ResolvedAgentConfig } from '@packages/core/src';
import { onBeforeUnmount, watch } from 'vue';
import type { ChatRoutePath } from '../routes';
import AgentConversationPanel from './AgentConversationPanel.vue';
import { useChatStore } from '../store/chat';
import type { OpenConversationRequest } from '../types/conversationLink';

const props = defineProps<{
  activeAgent?: ResolvedAgentConfig | null;
  activeAgentKey?: string | null;
  activePath?: string | null;
  selectedNodePath?: string | null;
  activeDocument?: ContextDocument | null;
  showAgentConversationList?: boolean;
  contextProvider?: IContextProvider | null;
  onFileChanged?: ((change: { path: string; beforeContent: string; afterContent: string; alreadyPersisted?: boolean }) => void | Promise<void>) | null;
  agentResolutionError?: string | null;
  restoreConversationId?: string | null;
  openConversationRequest?: OpenConversationRequest | null;
}>();
const chatStore = useChatStore();
const emit = defineEmits<{
  (event: 'request-workspace-switch', path: ChatRoutePath): void;
}>();

watch(() => props.activeAgent ?? null, (agent) => {
  chatStore.setActiveAgentContext(agent);
  void chatStore.applyActiveAgentContextSelection(agent);
}, { immediate: true, flush: 'sync' });

watch(
  () => [props.activeAgentKey ?? null, props.selectedNodePath ?? null, props.activePath ?? null, props.activeDocument ?? null, props.contextProvider ?? null, props.onFileChanged ?? null] as const,
  ([activeAgentKey, selectedNodePath, activePath, activeDocument, contextProvider, onFileChanged]) => {
    chatStore.setWorkspaceContext({
      activeAgentKey,
      selectedNodePath,
      activePath,
      activeDocument,
      contextProvider,
      onFileChanged
    });
  },
  { immediate: true, flush: 'sync' }
);

onBeforeUnmount(() => {
  chatStore.setActiveAgentContext(null);
  chatStore.setWorkspaceContext({
    activeAgentKey: null,
    selectedNodePath: null,
    activePath: null,
    activeDocument: null,
    contextProvider: null,
    onFileChanged: null
  });
});
</script>

<style scoped>
.knowledge-assistant-pane {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.12), transparent 30%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(9, 13, 20, 0.92));
}

.agent-pane-chat {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
