<template>
  <aside class="knowledge-assistant-pane" data-testid="agent-right-pane">
    <div class="agent-right-pane__tabs" data-testid="agent-right-pane-tabs">
      <button
        type="button"
        class="agent-right-pane__tab"
        :class="{ 'agent-right-pane__tab--active': activeTab === 'tasks' }"
        data-testid="agent-right-pane-tab-tasks"
        @click="activeTab = 'tasks'"
      >
        {{ t('shared.taskTab') }}<span v-if="taskCount > 0" class="agent-right-pane__tab-count">({{ taskCount }})</span>
      </button>
      <button
        type="button"
        class="agent-right-pane__tab"
        :class="{ 'agent-right-pane__tab--active': activeTab === 'conversations' }"
        data-testid="agent-right-pane-tab-conversations"
        @click="activeTab = 'conversations'"
      >
        {{ t('shared.conversationTab') }}<span v-if="conversationCount > 0" class="agent-right-pane__tab-count">({{ conversationCount }})</span>
      </button>
    </div>

    <AgentConversationPanel
      v-if="activeTab === 'conversations'"
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
    <AgentTaskPanel
      v-else
      :active-agent-key="props.activeAgentKey"
      :active-path="props.activePath"
      :selected-node-path="props.selectedNodePath"
      :active-document="props.activeDocument"
      :context-provider="props.contextProvider"
    />
  </aside>
</template>

<script setup lang="ts">
import type { ContextDocument, IContextProvider, ResolvedAgentConfig } from '@packages/core/src';
import { onBeforeUnmount, ref, watch } from 'vue';
import type { ChatRoutePath } from '../routes';
import AgentConversationPanel from './AgentConversationPanel.vue';
import AgentTaskPanel from './AgentTaskPanel.vue';
import { useChatStore } from '../store/chat';
import type { OpenConversationRequest } from '../types/conversationLink';
import { useWorkspaceI18n } from '../i18n';

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
const { t } = useWorkspaceI18n();
const activeTab = ref<'conversations' | 'tasks'>('tasks');
const taskCount = ref(0);
const conversationCount = ref(0);

watch(
  () => [
    props.activeAgentKey?.trim() || '',
    props.activeDocument?.path?.trim() || '',
    props.activeDocument?.documentId || '',
    props.contextProvider ?? null,
    props.showAgentConversationList === true
  ] as const,
  async ([agentKey, documentPath, documentId, contextProvider, showAgentConversationList]) => {
    const resolvedDocumentId = documentId || undefined;
    // 任务计数
    if (contextProvider && (documentPath || agentKey)) {
      try {
        const taskProvider = contextProvider.getTaskProvider();
        const openTasks = await taskProvider.getTasks(documentPath || null, agentKey || null, false, 'all', resolvedDocumentId);
        taskCount.value = openTasks.length;
      } catch {
        taskCount.value = 0;
      }
    } else {
      taskCount.value = 0;
    }

    // 对话计数
    if (documentPath) {
      if (contextProvider) {
        try {
          const conversations = await contextProvider.getConversations({ documentPath, documentId: resolvedDocumentId });
          conversationCount.value = conversations.filter(
            (c) => !c.compare && !c.sync?.deleted && (!agentKey || c.agentKey === agentKey)
          ).length;
        } catch {
          conversationCount.value = 0;
        }
      } else {
        conversationCount.value = 0;
      }
    } else if (agentKey && showAgentConversationList) {
      conversationCount.value = chatStore.getConversationsByAgent(agentKey).length;
    } else {
      conversationCount.value = 0;
    }
  },
  { immediate: true }
);

watch(
  () => [
    props.restoreConversationId ?? null,
    props.openConversationRequest?.conversationId ?? null,
    props.openConversationRequest?.nonce ?? null,
    props.activeAgentKey?.trim() || '',
    props.activeDocument?.path?.trim() || '',
    props.showAgentConversationList === true
  ] as const,
  ([restoreConversationId, requestedConversationId, requestedNonce, agentKey, documentPath, showAgentConversationList]) => {
    const hasConversationContext = !!documentPath || (!!agentKey && showAgentConversationList);
    if (!hasConversationContext) {
      return;
    }

    if (restoreConversationId || (requestedConversationId && requestedNonce !== null)) {
      activeTab.value = 'conversations';
    }
  },
  { immediate: true, flush: 'sync' }
);

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

.agent-right-pane__tabs {
  display: flex;
  align-items: flex-end;
  gap: 0;
  padding: 0 14px;
  border-bottom: 1px solid rgba(71, 85, 105, 0.48);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.78), rgba(15, 23, 42, 0.52));
}

.agent-right-pane__tab {
  position: relative;
  border: 0;
  border-radius: 0;
  padding: 13px 18px 11px;
  background: transparent;
  color: rgba(148, 163, 184, 0.9);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    color 140ms ease,
    background-color 140ms ease;
}

.agent-right-pane__tab:hover {
  color: rgba(226, 232, 240, 0.96);
  background: rgba(30, 41, 59, 0.28);
}

.agent-right-pane__tab--active {
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.24);
}

.agent-right-pane__tab-count {
  margin-left: 4px;
  font-size: 11px;
  font-weight: 500;
  opacity: 0.72;
}

.agent-right-pane__tab--active::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -1px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, #22c55e, #38bdf8);
}

.agent-pane-chat {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
